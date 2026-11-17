const { conflict, notFound } = require("../../common/errors");
const { toPage } = require("../../common/validation");
const { hasStarted, withStarted } = require("../matches/matches.service");
const { scorePrediction } = require("./scoring");

// Typować można tylko mecz zaplanowany, który jeszcze się nie zaczął
const isOpen = (match, now) => match.status === "SCHEDULED" && !hasStarted(match, now);

function createPredictionsService({
  predictionsRepository: repo,
  matchesRepository,
  leaguesService,
  leaguesRepository,
  now = () => new Date(),
}) {
  function requireOpen(match, current) {
    if (!isOpen(match, current)) throw conflict("PREDICTIONS_CLOSED", "Typowanie tego meczu jest już zamknięte");
  }

  async function getMatch(matchId) {
    const match = await matchesRepository.findById(matchId);
    if (!match) throw notFound(`Mecz o id ${matchId} nie istnieje`);
    return match;
  }

  return {
    /**
     * Kolejki ligi pogrupowane po rozgrywkach. Dla każdych rozgrywek wskazuje kolejkę bieżącą:
     * pierwszą, w której są jeszcze nierozstrzygnięte mecze (czyli tę do typowania albo właśnie
     * rozliczaną), a gdy wszystko rozegrane – ostatnią.
     */
    async rounds(user, leagueId) {
      await leaguesService.requireMember(leagueId, user.id);
      const competitionIds = await leaguesRepository.competitionIds(leagueId);
      const rows = await matchesRepository.listRounds(competitionIds);

      const groups = new Map();
      for (const { competitionId, competitionName, ...round } of rows) {
        if (!groups.has(competitionId)) {
          groups.set(competitionId, { competition: { id: competitionId, name: competitionName }, rounds: [] });
        }
        groups.get(competitionId).rounds.push(round);
      }
      return [...groups.values()].map((group) => {
        const current = group.rounds.find((r) => r.settled < r.matches) ?? group.rounds.at(-1);
        return { ...group, currentStage: current?.stage ?? null };
      });
    },

    /** Terminarz ligi (tylko jej rozgrywki) z moimi typami – główny widok aplikacji */
    async fixtures(user, leagueId, { competitionId, stage, status, from, to, page, size }) {
      await leaguesService.requireMember(leagueId, user.id);
      let competitionIds = await leaguesRepository.competitionIds(leagueId);
      if (competitionId) {
        if (!competitionIds.includes(competitionId)) {
          throw conflict("COMPETITION_NOT_IN_LEAGUE", "Te rozgrywki nie należą do tej ligi");
        }
        competitionIds = [competitionId];
      }
      const { rows, total } = await matchesRepository.findPage(
        { competitionIds, stage, status, from, to },
        { page, size }
      );

      const mine = await repo.findMineForMatches(user.id, leagueId, rows.map((m) => m.id));
      const byMatch = new Map(mine.map((p) => [p.matchId, p]));
      const current = now();

      const content = rows.map((match) => ({
        match: withStarted(match, current),
        myPrediction: byMatch.get(match.id) ?? null,
        canPredict: isOpen(match, current),
      }));
      return toPage(content, total, { page, size });
    },

    /**
     * Dodanie lub zmiana typu. Reguły biznesowe:
     * 1) typuje tylko członek ligi,
     * 2) mecz musi należeć do rozgrywek obejmowanych przez ligę,
     * 3) typ można złożyć/zmienić wyłącznie przed rozpoczęciem meczu.
     */
    async upsert(user, leagueId, matchId, { homeScore, awayScore }) {
      await leaguesService.requireMember(leagueId, user.id);
      const match = await getMatch(matchId);
      const competitionIds = await leaguesRepository.competitionIds(leagueId);
      if (!competitionIds.includes(match.competition.id)) {
        throw conflict("MATCH_NOT_IN_LEAGUE", "Ten mecz nie należy do rozgrywek tej ligi");
      }
      requireOpen(match, now());

      const existing = await repo.findOne(user.id, leagueId, matchId);
      if (existing) {
        await repo.updateScore(existing.id, { homeScore, awayScore });
        return repo.findById(existing.id);
      }
      const id = await repo.insert({ userId: user.id, leagueId, matchId, homeScore, awayScore });
      return repo.findById(id);
    },

    async remove(user, leagueId, matchId) {
      await leaguesService.requireMember(leagueId, user.id);
      const existing = await repo.findOne(user.id, leagueId, matchId);
      if (!existing) throw notFound("Nie masz typu na ten mecz w tej lidze");
      requireOpen(await getMatch(matchId), now());
      await repo.delete(existing.id);
    },

    /**
     * Reguła biznesowa: typy innych członków są ukryte do rozpoczęcia meczu
     * (żeby nie dało się "ściągać" od znajomych). Przed startem widać tylko własny typ.
     */
    async matchPredictions(user, leagueId, matchId) {
      await leaguesService.requireMember(leagueId, user.id);
      const revealed = hasStarted(await getMatch(matchId), now());
      const all = await repo.listForMatch(leagueId, matchId);
      return revealed ? all : all.filter((p) => p.user.id === user.id);
    },

    /**
     * Kopiuje moje typy z innej ligi – tylko na mecze, które się jeszcze nie zaczęły
     * i należą do rozgrywek ligi docelowej. Istniejące typy nadpisuje tylko przy overwrite = true.
     */
    async copyFrom(user, targetLeagueId, { sourceLeagueId, overwrite = false }) {
      if (sourceLeagueId === targetLeagueId) {
        throw conflict("SAME_LEAGUE", "Liga źródłowa i docelowa muszą być różne");
      }
      await leaguesService.requireMember(targetLeagueId, user.id);
      await leaguesService.requireMember(sourceLeagueId, user.id);
      const targetCompetitions = await leaguesRepository.competitionIds(targetLeagueId);
      const sourcePredictions = await repo.findMineInLeagueWithMatch(user.id, sourceLeagueId);
      const current = now();

      return repo.transaction(async (tx) => {
        const result = { copied: 0, overwritten: 0, skipped: 0 };
        for (const p of sourcePredictions) {
          if (!isOpen(p, current) || !targetCompetitions.includes(p.competitionId)) {
            result.skipped++;
            continue;
          }
          const score = { homeScore: p.homeScore, awayScore: p.awayScore };
          const existing = await tx.findOne(user.id, targetLeagueId, p.matchId);
          if (existing && !overwrite) {
            result.skipped++;
          } else if (existing) {
            await tx.updateScore(existing.id, score);
            result.overwritten++;
          } else {
            await tx.insert({ userId: user.id, leagueId: targetLeagueId, matchId: p.matchId, ...score });
            result.copied++;
          }
        }
        return result;
      });
    },

    /** Rozliczenie wszystkich typów na dany mecz (we wszystkich ligach). Zwraca liczbę typów. */
    async scoreMatch(matchId) {
      const match = await getMatch(matchId);
      if (match.status !== "FINISHED" || match.homeScore === null || match.awayScore === null) return 0;
      const actual = { home: match.homeScore, away: match.awayScore };
      const predictions = await repo.findByMatch(matchId);
      await repo.transaction(async (tx) => {
        for (const p of predictions) {
          await tx.setPoints(p.id, scorePrediction({ home: p.homeScore, away: p.awayScore }, actual));
        }
      });
      return predictions.length;
    },
  };
}

module.exports = { createPredictionsService, isOpen };

const { EVENTS } = require("../../events");
const { mapCompetition, mapMatch } = require("./footballData.mapper");

/**
 * Synchronizacja terminarza i wyników z football-data.org.
 * Dla każdego zakończonego (albo poprawionego) meczu emituje MATCH_FINISHED –
 * punkty liczy ten sam listener, co przy ręcznym wpisaniu wyniku przez admina.
 */
function createSyncService({ client, syncRepository, events, competitionCodes, logger = console, now = () => new Date() }) {
  const status = { running: false, lastRunAt: null, lastResult: null };

  async function syncCompetition(code) {
    const data = await client.getCompetitionMatches(code);
    const competition = mapCompetition(data);
    const matches = (data.matches ?? []).map(mapMatch).filter(Boolean);

    // wszystko dla jednych rozgrywek w jednej transakcji: albo cały terminarz, albo nic
    const finishedMatchIds = await syncRepository.transaction(async (tx) => {
      const competitionId = await tx.upsertCompetition(competition);
      const removed = await tx.deleteLocalMatches(competitionId);
      if (removed) logger.info(`[sync] ${code}: usunięte mecze demo: ${removed}`);
      const teamIds = new Map();
      const teamId = async (team) => {
        if (!teamIds.has(team.externalId)) teamIds.set(team.externalId, await tx.upsertTeam(team));
        return teamIds.get(team.externalId);
      };

      const finished = [];
      for (const m of matches) {
        const saved = await tx.upsertMatch({
          ...m,
          competitionId,
          homeTeamId: await teamId(m.homeTeam),
          awayTeamId: await teamId(m.awayTeam),
        });
        const resultChanged =
          saved.previousStatus !== "FINISHED" ||
          saved.previousHomeScore !== m.homeScore ||
          saved.previousAwayScore !== m.awayScore;
        if (m.status === "FINISHED" && resultChanged) finished.push(saved.id);
      }
      return finished;
    });

    // zdarzenia dopiero po zatwierdzeniu transakcji – listener ma już widzieć nowe wyniki
    for (const matchId of finishedMatchIds) events.emit(EVENTS.MATCH_FINISHED, { matchId });
    return { competition: code, matches: matches.length, newlyFinished: finishedMatchIds.length };
  }

  return {
    status: () => ({ ...status }),

    async syncAll() {
      if (status.running) return { skipped: true, reason: "Synchronizacja już trwa" };
      status.running = true;
      const results = [];
      try {
        for (const code of competitionCodes) {
          try {
            results.push(await syncCompetition(code));
          } catch (err) {
            // błąd jednych rozgrywek (np. brak dostępu w darmowym planie) nie zatrzymuje pozostałych
            logger.error(`[sync] ${code}: ${err.message}`);
            results.push({ competition: code, error: err.message });
          }
        }
      } finally {
        status.running = false;
        status.lastRunAt = now();
        status.lastResult = results;
      }
      const summary = results.map((r) =>
        r.error ? `${r.competition}: błąd` : `${r.competition}: meczów ${r.matches}, nowych wyników ${r.newlyFinished}`
      );
      logger.info(`[sync] ${summary.join("; ")}`);
      return { results };
    },
  };
}

module.exports = { createSyncService };

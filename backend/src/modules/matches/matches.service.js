const { conflict, notFound } = require("../../common/errors");
const { toPage } = require("../../common/validation");
const { EVENTS } = require("../../events");

const hasStarted = (match, now) => now.getTime() >= new Date(match.kickoffAt).getTime();

// Mecz w odpowiedzi API dostaje dodatkowo pole "started" (czy już się zaczął)
const withStarted = (match, now) => ({ ...match, started: hasStarted(match, now) });

function createMatchesService({ matchesRepository: repo, competitionsService, events, now = () => new Date() }) {
  async function getRaw(id) {
    const match = await repo.findById(id);
    if (!match) throw notFound(`Mecz o id ${id} nie istnieje`);
    return match;
  }

  // wspólne sprawdzenia dla dodawania i edycji meczu
  async function checkReferences({ competitionId, homeTeamId, awayTeamId }) {
    if (homeTeamId === awayTeamId) throw conflict("SAME_TEAMS", "Drużyna nie może grać sama ze sobą");
    await competitionsService.getCompetition(competitionId);
    await competitionsService.getTeam(homeTeamId);
    await competitionsService.getTeam(awayTeamId);
  }

  return {
    getRaw,

    async list(filter, { page, size }) {
      const { rows, total } = await repo.findPage(filter, { page, size });
      const current = now();
      return toPage(rows.map((m) => withStarted(m, current)), total, { page, size });
    },

    async get(id) {
      return withStarted(await getRaw(id), now());
    },

    async create(data) {
      await checkReferences(data);
      const id = await repo.insert(data);
      return withStarted(await repo.findById(id), now());
    },

    async update(id, data) {
      const match = await getRaw(id);
      if (match.status === "FINISHED") throw conflict("MATCH_FINISHED", "Nie można edytować zakończonego meczu");
      await checkReferences(data);
      await repo.update(id, data);
      return withStarted(await repo.findById(id), now());
    },

    async remove(id) {
      if (!(await repo.delete(id))) throw notFound(`Mecz o id ${id} nie istnieje`);
    },

    /**
     * Reguła biznesowa: wynik można wpisać dopiero po rozpoczęciu meczu i nie dla meczu odwołanego/przełożonego.
     * Poprawienie wyniku zakończonego meczu jest dozwolone – punkty przeliczą się ponownie.
     * Po zapisie ogłaszamy zdarzenie MATCH_FINISHED, a punkty liczą się asynchronicznie.
     */
    async setResult(id, { homeScore, awayScore }) {
      const match = await getRaw(id);
      const current = now();
      if (match.status === "CANCELLED" || match.status === "POSTPONED") {
        throw conflict("MATCH_NOT_PLAYED", "Mecz odwołany lub przełożony nie może mieć wyniku");
      }
      if (!hasStarted(match, current)) {
        throw conflict("MATCH_NOT_STARTED", "Nie można wpisać wyniku meczu, który się jeszcze nie rozpoczął");
      }
      await repo.setResult(id, homeScore, awayScore);
      events.emit(EVENTS.MATCH_FINISHED, { matchId: id });
      return withStarted(await repo.findById(id), current);
    },

    async changeStatus(id, status) {
      const match = await getRaw(id);
      if (match.status === "FINISHED") throw conflict("MATCH_FINISHED", "Mecz jest już zakończony");
      await repo.setStatus(id, status);
      return withStarted(await repo.findById(id), now());
    },
  };
}

module.exports = { createMatchesService, hasStarted, withStarted };

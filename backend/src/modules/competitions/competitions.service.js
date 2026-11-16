const { conflict, notFound } = require("../../common/errors");
const { toPage } = require("../../common/validation");

function createCompetitionsService({ competitionsRepository: repo }) {
  async function getCompetition(id) {
    const competition = await repo.findCompetition(id);
    if (!competition) throw notFound(`Rozgrywki o id ${id} nie istnieją`);
    return competition;
  }

  async function getTeam(id) {
    const team = await repo.findTeam(id);
    if (!team) throw notFound(`Drużyna o id ${id} nie istnieje`);
    return team;
  }

  return {
    listCompetitions: () => repo.listCompetitions(),
    getCompetition,

    async createCompetition(data) {
      const code = data.code.toUpperCase();
      if (await repo.existsCode(code)) throw conflict("COMPETITION_CODE_TAKEN", `Rozgrywki o kodzie ${code} już istnieją`);
      return repo.insertCompetition({ ...data, code });
    },

    async updateCompetition(id, data) {
      await getCompetition(id);
      const code = data.code.toUpperCase();
      if (await repo.existsCode(code, id)) throw conflict("COMPETITION_CODE_TAKEN", `Rozgrywki o kodzie ${code} już istnieją`);
      return repo.updateCompetition(id, { ...data, code });
    },

    async deleteCompetition(id) {
      // rozgrywki z meczami nie zostaną usunięte (ON DELETE RESTRICT -> 409 z errorHandlera)
      if (!(await repo.deleteCompetition(id))) throw notFound(`Rozgrywki o id ${id} nie istnieją`);
    },

    async listTeams({ q, page, size }) {
      const { rows, total } = await repo.findTeamsPage({ q, page, size });
      return toPage(rows, total, { page, size });
    },

    getTeam,
    createTeam: (data) => repo.insertTeam(data),

    async updateTeam(id, data) {
      const team = await repo.updateTeam(id, data);
      if (!team) throw notFound(`Drużyna o id ${id} nie istnieje`);
      return team;
    },

    async deleteTeam(id) {
      if (!(await repo.deleteTeam(id))) throw notFound(`Drużyna o id ${id} nie istnieje`);
    },
  };
}

module.exports = { createCompetitionsService };

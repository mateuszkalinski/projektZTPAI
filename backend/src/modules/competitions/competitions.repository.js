// Słowniki: rozgrywki (Liga Mistrzów, Premier League...) i drużyny.
const COMPETITION = "id, name, code, season";
const TEAM = `id, name, short_name AS "shortName", crest_url AS "crestUrl"`;

function createCompetitionsRepository(db) {
  return {
    // ---------- rozgrywki ----------
    async listCompetitions() {
      return (await db.query(`SELECT ${COMPETITION} FROM competitions ORDER BY name`)).rows;
    },

    async findCompetition(id) {
      const { rows } = await db.query(`SELECT ${COMPETITION} FROM competitions WHERE id = $1`, [id]);
      return rows[0] ?? null;
    },

    async findCompetitionByCode(code) {
      const { rows } = await db.query(`SELECT ${COMPETITION} FROM competitions WHERE upper(code) = upper($1)`, [code]);
      return rows[0] ?? null;
    },

    async findTeamByName(name) {
      const { rows } = await db.query(`SELECT ${TEAM} FROM teams WHERE name = $1 ORDER BY id LIMIT 1`, [name]);
      return rows[0] ?? null;
    },

    async countCompetitions(ids) {
      const { rows } = await db.query("SELECT count(*) AS count FROM competitions WHERE id = ANY($1)", [ids]);
      return rows[0].count;
    },

    async existsCode(code, exceptId = null) {
      const { rowCount } = await db.query(
        "SELECT 1 FROM competitions WHERE upper(code) = upper($1) AND ($2::int IS NULL OR id <> $2)",
        [code, exceptId]
      );
      return rowCount > 0;
    },

    async insertCompetition({ name, code, season }) {
      const { rows } = await db.query(
        `INSERT INTO competitions (name, code, season) VALUES ($1, $2, $3) RETURNING ${COMPETITION}`,
        [name, code, season ?? null]
      );
      return rows[0];
    },

    async updateCompetition(id, { name, code, season }) {
      const { rows } = await db.query(
        `UPDATE competitions SET name = $2, code = $3, season = $4 WHERE id = $1 RETURNING ${COMPETITION}`,
        [id, name, code, season ?? null]
      );
      return rows[0] ?? null;
    },

    async deleteCompetition(id) {
      return (await db.query("DELETE FROM competitions WHERE id = $1", [id])).rowCount > 0;
    },

    // ---------- drużyny ----------
    async findTeamsPage({ q, page, size }) {
      const where = q ? "WHERE name ILIKE $1" : "";
      const params = q ? [`%${q}%`] : [];
      const total = (await db.query(`SELECT count(*) AS count FROM teams ${where}`, params)).rows[0].count;
      const { rows } = await db.query(
        `SELECT ${TEAM} FROM teams ${where} ORDER BY name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, size, page * size]
      );
      return { rows, total };
    },

    async findTeam(id) {
      const { rows } = await db.query(`SELECT ${TEAM} FROM teams WHERE id = $1`, [id]);
      return rows[0] ?? null;
    },

    async insertTeam({ name, shortName, crestUrl }) {
      const { rows } = await db.query(
        `INSERT INTO teams (name, short_name, crest_url) VALUES ($1, $2, $3) RETURNING ${TEAM}`,
        [name, shortName ?? null, crestUrl ?? null]
      );
      return rows[0];
    },

    async updateTeam(id, { name, shortName, crestUrl }) {
      const { rows } = await db.query(
        `UPDATE teams SET name = $2, short_name = $3, crest_url = $4 WHERE id = $1 RETURNING ${TEAM}`,
        [id, name, shortName ?? null, crestUrl ?? null]
      );
      return rows[0] ?? null;
    },

    async deleteTeam(id) {
      return (await db.query("DELETE FROM teams WHERE id = $1", [id])).rowCount > 0;
    },
  };
}

module.exports = { createCompetitionsRepository };

// Mecz zawsze zwracamy razem z rozgrywkami i drużynami – jednym zapytaniem z JOIN-ami (bez N+1).
const SELECT_MATCH = `
  SELECT m.id,
         m.kickoff_at  AS "kickoffAt",
         m.stage,
         m.status,
         m.home_score  AS "homeScore",
         m.away_score  AS "awayScore",
         json_build_object('id', c.id, 'name', c.name, 'code', c.code, 'season', c.season) AS competition,
         json_build_object('id', ht.id, 'name', ht.name, 'shortName', ht.short_name, 'crestUrl', ht.crest_url) AS "homeTeam",
         json_build_object('id', awt.id, 'name', awt.name, 'shortName', awt.short_name, 'crestUrl', awt.crest_url) AS "awayTeam"
  FROM matches m
  JOIN competitions c ON c.id = m.competition_id
  JOIN teams ht ON ht.id = m.home_team_id
  JOIN teams awt ON awt.id = m.away_team_id`;

// Buduje WHERE z opcjonalnych filtrów; wartości zawsze jako parametry ($1, $2...), nigdy wklejane w SQL.
function buildWhere({ competitionIds, status, teamId, from, to } = {}) {
  const conditions = [];
  const params = [];
  const param = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (competitionIds?.length) conditions.push(`m.competition_id = ANY(${param(competitionIds)})`);
  if (status) conditions.push(`m.status = ${param(status)}`);
  if (teamId) {
    const p = param(teamId);
    conditions.push(`(m.home_team_id = ${p} OR m.away_team_id = ${p})`);
  }
  if (from) conditions.push(`m.kickoff_at >= ${param(from)}`);
  if (to) conditions.push(`m.kickoff_at < ${param(to)}`);
  return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
}

function createMatchesRepository(db) {
  return {
    async findById(id) {
      const { rows } = await db.query(`${SELECT_MATCH} WHERE m.id = $1`, [id]);
      return rows[0] ?? null;
    },

    async findPage(filter, { page, size }) {
      const { where, params } = buildWhere(filter);
      const total = (await db.query(`SELECT count(*) AS count FROM matches m ${where}`, params)).rows[0].count;
      const { rows } = await db.query(
        `${SELECT_MATCH} ${where} ORDER BY m.kickoff_at, m.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, size, page * size]
      );
      return { rows, total };
    },

    async insert({ competitionId, homeTeamId, awayTeamId, kickoffAt, stage }) {
      const { rows } = await db.query(
        `INSERT INTO matches (competition_id, home_team_id, away_team_id, kickoff_at, stage)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [competitionId, homeTeamId, awayTeamId, kickoffAt, stage ?? null]
      );
      return rows[0].id;
    },

    async update(id, { competitionId, homeTeamId, awayTeamId, kickoffAt, stage }) {
      await db.query(
        `UPDATE matches SET competition_id = $2, home_team_id = $3, away_team_id = $4, kickoff_at = $5, stage = $6
         WHERE id = $1`,
        [id, competitionId, homeTeamId, awayTeamId, kickoffAt, stage ?? null]
      );
    },

    async setResult(id, homeScore, awayScore) {
      await db.query(
        "UPDATE matches SET home_score = $2, away_score = $3, status = 'FINISHED' WHERE id = $1",
        [id, homeScore, awayScore]
      );
    },

    async setStatus(id, status) {
      await db.query("UPDATE matches SET status = $2 WHERE id = $1", [id, status]);
    },

    async delete(id) {
      return (await db.query("DELETE FROM matches WHERE id = $1", [id])).rowCount > 0;
    },
  };
}

module.exports = { createMatchesRepository };

const { withTransaction } = require("../../db/pool");

const SELECT_PREDICTION = `
  SELECT p.id,
         p.match_id       AS "matchId",
         p.league_id      AS "leagueId",
         json_build_object('id', u.id, 'username', u.username) AS user,
         p.predicted_home AS "homeScore",
         p.predicted_away AS "awayScore",
         p.points,
         p.updated_at     AS "updatedAt"
  FROM predictions p
  JOIN users u ON u.id = p.user_id`;

function createPredictionsRepository(db) {
  return {
    transaction(fn) {
      return withTransaction(db, (client) => fn(createPredictionsRepository(client)));
    },

    async findById(id) {
      const { rows } = await db.query(`${SELECT_PREDICTION} WHERE p.id = $1`, [id]);
      return rows[0] ?? null;
    },

    async findOne(userId, leagueId, matchId) {
      const { rows } = await db.query(
        `${SELECT_PREDICTION} WHERE p.user_id = $1 AND p.league_id = $2 AND p.match_id = $3`,
        [userId, leagueId, matchId]
      );
      return rows[0] ?? null;
    },

    async findMineForMatches(userId, leagueId, matchIds) {
      if (!matchIds.length) return [];
      const { rows } = await db.query(
        `${SELECT_PREDICTION} WHERE p.user_id = $1 AND p.league_id = $2 AND p.match_id = ANY($3)`,
        [userId, leagueId, matchIds]
      );
      return rows;
    },

    // moje typy w lidze razem z danymi meczu potrzebnymi do kopiowania
    async findMineInLeagueWithMatch(userId, leagueId) {
      const { rows } = await db.query(
        `SELECT p.match_id AS "matchId", p.predicted_home AS "homeScore", p.predicted_away AS "awayScore",
                m.kickoff_at AS "kickoffAt", m.status, m.competition_id AS "competitionId"
         FROM predictions p JOIN matches m ON m.id = p.match_id
         WHERE p.user_id = $1 AND p.league_id = $2`,
        [userId, leagueId]
      );
      return rows;
    },

    async listForMatch(leagueId, matchId) {
      const { rows } = await db.query(
        `${SELECT_PREDICTION} WHERE p.league_id = $1 AND p.match_id = $2 ORDER BY u.username`,
        [leagueId, matchId]
      );
      return rows;
    },

    async insert({ userId, leagueId, matchId, homeScore, awayScore }) {
      const { rows } = await db.query(
        `INSERT INTO predictions (user_id, league_id, match_id, predicted_home, predicted_away)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [userId, leagueId, matchId, homeScore, awayScore]
      );
      return rows[0].id;
    },

    async updateScore(id, { homeScore, awayScore }) {
      await db.query(
        "UPDATE predictions SET predicted_home = $2, predicted_away = $3, updated_at = now() WHERE id = $1",
        [id, homeScore, awayScore]
      );
    },

    async delete(id) {
      await db.query("DELETE FROM predictions WHERE id = $1", [id]);
    },

    // ---------- rozliczanie ----------
    async findByMatch(matchId) {
      const { rows } = await db.query(
        `SELECT id, predicted_home AS "homeScore", predicted_away AS "awayScore" FROM predictions WHERE match_id = $1`,
        [matchId]
      );
      return rows;
    },

    async setPoints(id, points) {
      await db.query("UPDATE predictions SET points = $2 WHERE id = $1", [id, points]);
    },
  };
}

module.exports = { createPredictionsRepository };

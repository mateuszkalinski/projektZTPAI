const { withTransaction } = require("../../db/pool");

// Lista rozgrywek ligi jako tablica JSON (jedno zapytanie zamiast osobnego dla każdej ligi)
const COMPETITIONS_JSON = `
  COALESCE((SELECT json_agg(json_build_object('id', c.id, 'name', c.name, 'code', c.code, 'season', c.season)
                            ORDER BY c.name)
            FROM league_competitions lc JOIN competitions c ON c.id = lc.competition_id
            WHERE lc.league_id = l.id), '[]'::json)`;

const MEMBER_COUNT = `(SELECT count(*) FROM league_memberships x WHERE x.league_id = l.id)`;

const MEMBERSHIP = `id, league_id AS "leagueId", user_id AS "userId", role, joined_at AS "joinedAt"`;

function createLeaguesRepository(db) {
  return {
    // repozytorium działające na jednej transakcji (fn dostaje repozytorium podpięte pod transakcję)
    transaction(fn) {
      return withTransaction(db, (client) => fn(createLeaguesRepository(client)));
    },

    // ---------- ligi ----------
    async findById(id) {
      const { rows } = await db.query(
        `SELECT l.id, l.name, l.description, l.invite_code AS "inviteCode", l.created_at AS "createdAt",
                json_build_object('id', u.id, 'username', u.username) AS owner,
                ${COMPETITIONS_JSON} AS competitions,
                ${MEMBER_COUNT} AS "memberCount"
         FROM leagues l JOIN users u ON u.id = l.owner_id
         WHERE l.id = $1`,
        [id]
      );
      return rows[0] ?? null;
    },

    async exists(id) {
      return (await db.query("SELECT 1 FROM leagues WHERE id = $1", [id])).rowCount > 0;
    },

    async findIdByInviteCode(code) {
      const { rows } = await db.query("SELECT id FROM leagues WHERE invite_code = $1", [code]);
      return rows[0]?.id ?? null;
    },

    async existsInviteCode(code) {
      return (await db.query("SELECT 1 FROM leagues WHERE invite_code = $1", [code])).rowCount > 0;
    },

    async listForUser(userId) {
      const { rows } = await db.query(
        `SELECT l.id, l.name, lm.role AS "myRole",
                ${COMPETITIONS_JSON} AS competitions,
                ${MEMBER_COUNT} AS "memberCount"
         FROM league_memberships lm JOIN leagues l ON l.id = lm.league_id
         WHERE lm.user_id = $1
         ORDER BY lm.joined_at DESC`,
        [userId]
      );
      return rows;
    },

    async insert({ name, description, inviteCode, ownerId }) {
      const { rows } = await db.query(
        "INSERT INTO leagues (name, description, invite_code, owner_id) VALUES ($1, $2, $3, $4) RETURNING id",
        [name, description ?? null, inviteCode, ownerId]
      );
      return rows[0].id;
    },

    async update(id, { name, description }) {
      await db.query("UPDATE leagues SET name = $2, description = $3 WHERE id = $1", [id, name, description ?? null]);
    },

    async setInviteCode(id, inviteCode) {
      await db.query("UPDATE leagues SET invite_code = $2 WHERE id = $1", [id, inviteCode]);
    },

    async setOwner(id, ownerId) {
      await db.query("UPDATE leagues SET owner_id = $2 WHERE id = $1", [id, ownerId]);
    },

    async setCompetitions(id, competitionIds) {
      await db.query("DELETE FROM league_competitions WHERE league_id = $1", [id]);
      await db.query(
        "INSERT INTO league_competitions (league_id, competition_id) SELECT $1, unnest($2::int[])",
        [id, competitionIds]
      );
    },

    async competitionIds(id) {
      const { rows } = await db.query("SELECT competition_id AS id FROM league_competitions WHERE league_id = $1", [id]);
      return rows.map((r) => r.id);
    },

    async delete(id) {
      // członkostwa, typy i powiązania z rozgrywkami usuwa ON DELETE CASCADE
      await db.query("DELETE FROM leagues WHERE id = $1", [id]);
    },

    // ---------- członkostwo ----------
    async findMembership(leagueId, userId) {
      const { rows } = await db.query(
        `SELECT ${MEMBERSHIP} FROM league_memberships WHERE league_id = $1 AND user_id = $2`,
        [leagueId, userId]
      );
      return rows[0] ?? null;
    },

    async insertMembership(leagueId, userId, role) {
      await db.query("INSERT INTO league_memberships (league_id, user_id, role) VALUES ($1, $2, $3)", [
        leagueId,
        userId,
        role,
      ]);
    },

    async setMembershipRole(membershipId, role) {
      await db.query("UPDATE league_memberships SET role = $2 WHERE id = $1", [membershipId, role]);
    },

    async deleteMembership(membershipId) {
      await db.query("DELETE FROM league_memberships WHERE id = $1", [membershipId]);
    },

    async listMembers(leagueId) {
      const { rows } = await db.query(
        `SELECT json_build_object('id', u.id, 'username', u.username) AS user, lm.role, lm.joined_at AS "joinedAt"
         FROM league_memberships lm JOIN users u ON u.id = lm.user_id
         WHERE lm.league_id = $1
         ORDER BY lm.joined_at`,
        [leagueId]
      );
      return rows;
    },

    // Tabela ligi: suma punktów każdego członka (także z 0 pkt, dzięki LEFT JOIN)
    async leaderboard(leagueId, { page, size }) {
      const total = (
        await db.query("SELECT count(*) AS count FROM league_memberships WHERE league_id = $1", [leagueId])
      ).rows[0].count;
      const { rows } = await db.query(
        `SELECT u.id AS "userId", u.username,
                COALESCE(SUM(p.points), 0) AS points,
                COUNT(p.points) AS "scoredPredictions"
         FROM league_memberships lm
         JOIN users u ON u.id = lm.user_id
         LEFT JOIN predictions p ON p.league_id = lm.league_id AND p.user_id = lm.user_id
         WHERE lm.league_id = $1
         GROUP BY u.id, u.username
         ORDER BY points DESC, u.username
         LIMIT $2 OFFSET $3`,
        [leagueId, size, page * size]
      );
      return { rows, total };
    },
  };
}

module.exports = { createLeaguesRepository };

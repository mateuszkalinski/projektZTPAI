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
        `SELECT l.id, l.name, l.description, l.is_public AS "isPublic", l.invite_code AS "inviteCode",
                l.created_at AS "createdAt",
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
        `SELECT l.id, l.name, l.is_public AS "isPublic", lm.role AS "myRole",
                ${COMPETITIONS_JSON} AS competitions,
                ${MEMBER_COUNT} AS "memberCount"
         FROM league_memberships lm JOIN leagues l ON l.id = lm.league_id
         WHERE lm.user_id = $1
         ORDER BY lm.joined_at DESC`,
        [userId]
      );
      return rows;
    },

    // Ligi publiczne – od największych; isMember mówi, czy pytający już w nich jest
    async findPublicPage({ q, page, size, userId }) {
      const where = "WHERE l.is_public AND ($1::text IS NULL OR l.name ILIKE '%' || $1 || '%')";
      const search = q || null;
      const total = (await db.query(`SELECT count(*) AS count FROM leagues l ${where}`, [search])).rows[0].count;
      const { rows } = await db.query(
        `SELECT l.id, l.name, l.description,
                ${COMPETITIONS_JSON} AS competitions,
                ${MEMBER_COUNT} AS "memberCount",
                EXISTS (SELECT 1 FROM league_memberships x WHERE x.league_id = l.id AND x.user_id = $2) AS "isMember"
         FROM leagues l ${where}
         ORDER BY "memberCount" DESC, l.name
         LIMIT $3 OFFSET $4`,
        [search, userId, size, page * size]
      );
      return { rows, total };
    },

    async insert({ name, description, isPublic, inviteCode, ownerId }) {
      const { rows } = await db.query(
        `INSERT INTO leagues (name, description, is_public, invite_code, owner_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [name, description ?? null, Boolean(isPublic), inviteCode, ownerId]
      );
      return rows[0].id;
    },

    async update(id, { name, description, isPublic }) {
      await db.query("UPDATE leagues SET name = $2, description = $3, is_public = $4 WHERE id = $1", [
        id,
        name,
        description ?? null,
        Boolean(isPublic),
      ]);
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
      // członkostwa, typy, bany i powiązania z rozgrywkami usuwa ON DELETE CASCADE
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

    // ---------- bany ----------
    async isBanned(leagueId, userId) {
      const { rowCount } = await db.query("SELECT 1 FROM league_bans WHERE league_id = $1 AND user_id = $2", [
        leagueId,
        userId,
      ]);
      return rowCount > 0;
    },

    async insertBan(leagueId, userId, bannedBy) {
      await db.query(
        `INSERT INTO league_bans (league_id, user_id, banned_by) VALUES ($1, $2, $3)
         ON CONFLICT (league_id, user_id) DO NOTHING`,
        [leagueId, userId, bannedBy]
      );
    },

    async deleteBan(leagueId, userId) {
      const { rowCount } = await db.query("DELETE FROM league_bans WHERE league_id = $1 AND user_id = $2", [
        leagueId,
        userId,
      ]);
      return rowCount > 0;
    },

    async listBans(leagueId) {
      const { rows } = await db.query(
        `SELECT json_build_object('id', u.id, 'username', u.username) AS user,
                b.banned_at AS "bannedAt",
                bb.username AS "bannedBy"
         FROM league_bans b
         JOIN users u ON u.id = b.user_id
         LEFT JOIN users bb ON bb.id = b.banned_by
         WHERE b.league_id = $1
         ORDER BY b.banned_at DESC`,
        [leagueId]
      );
      return rows;
    },

    // ---------- tabela ----------
    /**
     * Tabela ligi: punkty każdego członka (także 0 pkt dzięki LEFT JOIN) i miejsce.
     * Miejsce liczymy RANK()-iem na całej lidze, a dopiero potem filtrujemy po nicku –
     * wyszukany gracz ma więc swoje prawdziwe miejsce. Remis punktowy = to samo miejsce.
     */
    async standings(leagueId, { q, page, size }) {
      const ranked = `
        WITH ranked AS (
          SELECT u.id AS "userId", u.username, lm.role, lm.joined_at AS "joinedAt",
                 COALESCE(SUM(p.points), 0) AS points,
                 COUNT(p.points) AS "scoredPredictions",
                 RANK() OVER (ORDER BY COALESCE(SUM(p.points), 0) DESC) AS position
          FROM league_memberships lm
          JOIN users u ON u.id = lm.user_id
          LEFT JOIN predictions p ON p.league_id = lm.league_id AND p.user_id = lm.user_id
          WHERE lm.league_id = $1
          GROUP BY u.id, u.username, lm.role, lm.joined_at
        )`;
      const filter = `WHERE ($2::text IS NULL OR username ILIKE '%' || $2 || '%')`;
      const search = q || null;
      const total = (await db.query(`${ranked} SELECT count(*) AS count FROM ranked ${filter}`, [leagueId, search]))
        .rows[0].count;
      const { rows } = await db.query(
        `${ranked} SELECT * FROM ranked ${filter} ORDER BY position, username LIMIT $3 OFFSET $4`,
        [leagueId, search, size, page * size]
      );
      return { rows, total };
    },

    // Punkty wybranych graczy w wybranych kolejkach (kolejka = rozgrywki + etap)
    async roundPoints(leagueId, userIds, rounds) {
      if (!userIds.length || !rounds.length) return [];
      const { rows } = await db.query(
        `SELECT p.user_id AS "userId", m.competition_id AS "competitionId", COALESCE(m.stage, '-') AS stage,
                SUM(p.points) AS points
         FROM predictions p
         JOIN matches m ON m.id = p.match_id
         JOIN unnest($3::int[], $4::text[]) AS r(competition_id, stage)
           ON r.competition_id = m.competition_id AND r.stage = COALESCE(m.stage, '-')
         WHERE p.league_id = $1 AND p.user_id = ANY($2) AND p.points IS NOT NULL
         GROUP BY p.user_id, m.competition_id, COALESCE(m.stage, '-')`,
        [leagueId, userIds, rounds.map((r) => r.competitionId), rounds.map((r) => r.stage)]
      );
      return rows;
    },
  };
}

module.exports = { createLeaguesRepository };

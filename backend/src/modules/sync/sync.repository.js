const { withTransaction } = require("../../db/pool");

// Zapisy "wstaw albo zaktualizuj" (upsert) po id z zewnętrznego API – synchronizację można
// puszczać dowolnie wiele razy i nic się nie zdubluje.
function createSyncRepository(db) {
  return {
    transaction(fn) {
      return withTransaction(db, (client) => fn(createSyncRepository(client)));
    },

    // Rozgrywki dopasowujemy po kodzie (CL, PL), więc istniejące rekordy dostają tylko external_id i sezon
    async upsertCompetition({ externalId, code, name, season }) {
      const { rows } = await db.query(
        `INSERT INTO competitions (name, code, season, external_id) VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE SET external_id = EXCLUDED.external_id, season = EXCLUDED.season
         RETURNING id`,
        [name, code, season, externalId]
      );
      return rows[0].id;
    },

    // Rozgrywki synchronizowane z API mają tylko mecze z API – usuwamy lokalne (np. dane demo)
    async deleteLocalMatches(competitionId) {
      const { rowCount } = await db.query(
        "DELETE FROM matches WHERE competition_id = $1 AND external_id IS NULL",
        [competitionId]
      );
      return rowCount;
    },

    async upsertTeam({ externalId, name, shortName, crestUrl }) {
      const { rows } = await db.query(
        `INSERT INTO teams (name, short_name, crest_url, external_id) VALUES ($1, $2, $3, $4)
         ON CONFLICT (external_id) DO UPDATE
           SET name = EXCLUDED.name, short_name = EXCLUDED.short_name, crest_url = EXCLUDED.crest_url
         RETURNING id`,
        [name, shortName, crestUrl, externalId]
      );
      return rows[0].id;
    },

    /**
     * Zwraca też stan meczu sprzed zapisu (CTE "before" widzi dane sprzed tej instrukcji),
     * dzięki czemu serwis wie, czy mecz właśnie się zakończył albo zmienił mu się wynik.
     */
    async upsertMatch({ externalId, competitionId, homeTeamId, awayTeamId, kickoffAt, stage, status, homeScore, awayScore }) {
      const { rows } = await db.query(
        `WITH before AS (
           SELECT status, home_score, away_score FROM matches WHERE external_id = $1
         )
         INSERT INTO matches (external_id, competition_id, home_team_id, away_team_id, kickoff_at, stage, status, home_score, away_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (external_id) DO UPDATE SET
           competition_id = EXCLUDED.competition_id,
           home_team_id   = EXCLUDED.home_team_id,
           away_team_id   = EXCLUDED.away_team_id,
           kickoff_at     = EXCLUDED.kickoff_at,
           stage          = EXCLUDED.stage,
           status         = EXCLUDED.status,
           home_score     = EXCLUDED.home_score,
           away_score     = EXCLUDED.away_score
         RETURNING id,
           (SELECT status FROM before)     AS "previousStatus",
           (SELECT home_score FROM before) AS "previousHomeScore",
           (SELECT away_score FROM before) AS "previousAwayScore"`,
        [externalId, competitionId, homeTeamId, awayTeamId, kickoffAt, stage, status, homeScore, awayScore]
      );
      return rows[0];
    },
  };
}

module.exports = { createSyncRepository };

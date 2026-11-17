const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mapMatch, mapCompetition, stageLabel } = require("../../src/modules/sync/footballData.mapper");
const { createSyncService } = require("../../src/modules/sync/sync.service");
const { EVENTS, createEventBus } = require("../../src/events");

// Fragment odpowiedzi football-data.org (v4)
function apiMatch(overrides = {}) {
  return {
    id: 501,
    utcDate: "2026-11-25T20:00:00Z",
    status: "TIMED",
    matchday: 5,
    stage: "LEAGUE_STAGE",
    homeTeam: { id: 86, name: "Real Madrid CF", shortName: "Real Madrid", tla: "RMA", crest: "https://crests/86.png" },
    awayTeam: { id: 5, name: "FC Bayern München", shortName: "Bayern", tla: "FCB", crest: "https://crests/5.png" },
    score: { winner: null, duration: "REGULAR", fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
    season: { startDate: "2026-09-16", endDate: "2027-05-29" },
    ...overrides,
  };
}

test("mapowanie meczu zaplanowanego", () => {
  const m = mapMatch(apiMatch());
  assert.equal(m.externalId, 501);
  assert.equal(m.status, "SCHEDULED");
  assert.equal(m.homeScore, null);
  assert.equal(m.stage, "Faza ligowa, 5. kolejka");
  assert.equal(m.homeTeam.shortName, "RMA");
  assert.equal(m.kickoffAt.toISOString(), "2026-11-25T20:00:00.000Z");
});

test("zakończony mecz bierze wynik z regulaminowego czasu, nie z karnych", () => {
  const m = mapMatch(
    apiMatch({
      status: "FINISHED",
      score: {
        duration: "PENALTY_SHOOTOUT",
        fullTime: { home: 7, away: 6 },
        regularTime: { home: 1, away: 1 },
        extraTime: { home: 0, away: 0 },
        penalties: { home: 6, away: 5 },
      },
    })
  );
  assert.equal(m.status, "FINISHED");
  assert.deepEqual([m.homeScore, m.awayScore], [1, 1]);
});

test("zwykły zakończony mecz bierze fullTime", () => {
  const m = mapMatch(apiMatch({ status: "FINISHED", score: { duration: "REGULAR", fullTime: { home: 3, away: 0 } } }));
  assert.deepEqual([m.status, m.homeScore, m.awayScore], ["FINISHED", 3, 0]);
});

test("mecz bez znanych drużyn (drabinka) jest pomijany, statusy są tłumaczone", () => {
  assert.equal(mapMatch(apiMatch({ homeTeam: { id: null, name: null } })), null);
  assert.equal(mapMatch(apiMatch({ status: "IN_PLAY" })).status, "SCHEDULED");
  assert.equal(mapMatch(apiMatch({ status: "SUSPENDED" })).status, "POSTPONED");
  assert.equal(mapMatch(apiMatch({ status: "CANCELLED" })).status, "CANCELLED");
});

test("nazwy etapów i rozgrywek po polsku", () => {
  assert.equal(stageLabel("REGULAR_SEASON", 13), "13. kolejka");
  assert.equal(stageLabel("QUARTER_FINALS", null), "Ćwierćfinał");
  const c = mapCompetition({ competition: { id: 2001, code: "CL", name: "UEFA Champions League" }, matches: [apiMatch()] });
  assert.deepEqual(c, { externalId: 2001, code: "CL", name: "Liga Mistrzów", season: "2026/27" });
});

test("synchronizacja emituje MATCH_FINISHED tylko dla nowych lub zmienionych wyników", async () => {
  // stan "bazy" sprzed synchronizacji: mecz 1 już rozliczony 2:1, mecz 2 jeszcze bez wyniku
  const before = { 701: { previousStatus: "FINISHED", previousHomeScore: 2, previousAwayScore: 1 }, 702: { previousStatus: "SCHEDULED" } };
  const repo = {
    transaction: (fn) => fn(repo),
    upsertCompetition: async () => 1,
    deleteLocalMatches: async () => 0,
    upsertTeam: async (t) => t.externalId,
    upsertMatch: async (m) => ({ id: m.externalId, previousStatus: null, previousHomeScore: null, previousAwayScore: null, ...before[m.externalId] }),
  };
  const finished = (id, home, away) => apiMatch({ id, status: "FINISHED", score: { fullTime: { home, away } } });
  const client = {
    getCompetitionMatches: async () => ({
      competition: { id: 2001, code: "CL", name: "UEFA Champions League" },
      matches: [finished(701, 2, 1), finished(702, 0, 0), apiMatch({ id: 703 })],
    }),
  };
  const events = createEventBus();
  const emitted = [];
  events.on(EVENTS.MATCH_FINISHED, (e) => emitted.push(e.matchId));

  const service = createSyncService({ client, syncRepository: repo, events, competitionCodes: ["CL"], logger: { info() {}, error() {} } });
  const { results } = await service.syncAll();

  assert.deepEqual(results, [{ competition: "CL", matches: 3, newlyFinished: 1 }]);
  assert.deepEqual(emitted, [702]); // 701 bez zmian, 703 jeszcze się nie odbył
});

test("błąd jednych rozgrywek nie zatrzymuje pozostałych", async () => {
  const repo = { transaction: (fn) => fn(repo), upsertCompetition: async () => 1, deleteLocalMatches: async () => 0, upsertTeam: async () => 1, upsertMatch: async () => ({ id: 1 }) };
  const client = {
    getCompetitionMatches: async (code) => {
      if (code === "WC") throw new Error("football-data.org odpowiedziało 403");
      return { competition: { id: 2021, code: "PL", name: "Premier League" }, matches: [] };
    },
  };
  const service = createSyncService({ client, syncRepository: repo, events: createEventBus(), competitionCodes: ["WC", "PL"], logger: { info() {}, error() {} } });
  const { results } = await service.syncAll();
  assert.match(results[0].error, /403/);
  assert.deepEqual(results[1], { competition: "PL", matches: 0, newlyFinished: 0 });
  assert.equal(service.status().running, false);
});

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { createPredictionsService } = require("../../src/modules/predictions/predictions.service");
const { AppError } = require("../../src/common/errors");

// Testy logiki typowania bez bazy danych – repozytoria są podmienione na proste atrapy.
const NOW = new Date("2026-11-20T18:00:00Z");
const hoursFromNow = (h) => new Date(NOW.getTime() + h * 3600 * 1000).toISOString();
const me = { id: 1, username: "mateusz", role: "USER" };
const CL = 10;
const PL = 20;

function match(id, competitionId, kickoffAt, status = "SCHEDULED") {
  return { id, competition: { id: competitionId }, kickoffAt, status, homeScore: null, awayScore: null };
}

let state;
let service;

beforeEach(() => {
  state = {
    matches: new Map(),
    predictions: [],
    members: new Set(["100:1", "200:1"]), // użytkownik 1 należy do lig 100 i 200
    leagueCompetitions: { 100: [CL], 200: [CL, PL] },
  };
  let nextId = 1;

  const predictionsRepository = {
    transaction: (fn) => fn(predictionsRepository),
    findById: async (id) => state.predictions.find((p) => p.id === id) ?? null,
    findOne: async (userId, leagueId, matchId) =>
      state.predictions.find((p) => p.userId === userId && p.leagueId === leagueId && p.matchId === matchId) ?? null,
    findMineForMatches: async () => [],
    findMineInLeagueWithMatch: async (userId, leagueId) =>
      state.predictions
        .filter((p) => p.userId === userId && p.leagueId === leagueId)
        .map((p) => {
          const m = state.matches.get(p.matchId);
          return { ...p, kickoffAt: m.kickoffAt, status: m.status, competitionId: m.competition.id };
        }),
    insert: async (data) => {
      const p = { id: nextId++, ...data, points: null };
      state.predictions.push(p);
      return p.id;
    },
    updateScore: async (id, { homeScore, awayScore }) => Object.assign(state.predictions.find((p) => p.id === id), { homeScore, awayScore }),
    findByMatch: async (matchId) => state.predictions.filter((p) => p.matchId === matchId),
    setPoints: async (id, points) => (state.predictions.find((p) => p.id === id).points = points),
  };

  service = createPredictionsService({
    predictionsRepository,
    matchesRepository: {
      findById: async (id) => state.matches.get(id) ?? null,
      listRounds: async () => state.rounds ?? [],
    },
    leaguesRepository: { competitionIds: async (leagueId) => state.leagueCompetitions[leagueId] ?? [] },
    leaguesService: {
      requireMember: async (leagueId, userId) => {
        if (!state.members.has(`${leagueId}:${userId}`)) throw new AppError(403, "NOT_A_MEMBER", "Nie należysz do tej ligi");
        return { role: "MEMBER" };
      },
    },
    now: () => NOW,
  });
});

const rejectsWith = (promise, code) => assert.rejects(promise, (err) => err instanceof AppError && err.code === code);

test("typ przed rozpoczęciem meczu zostaje zapisany", async () => {
  state.matches.set(30, match(30, CL, hoursFromNow(2)));
  const prediction = await service.upsert(me, 100, 30, { homeScore: 2, awayScore: 1 });
  assert.equal(prediction.homeScore, 2);
  assert.equal(state.predictions.length, 1);
});

test("typ po rozpoczęciu meczu jest odrzucany (PREDICTIONS_CLOSED)", async () => {
  state.matches.set(30, match(30, CL, hoursFromNow(-0.1)));
  await rejectsWith(service.upsert(me, 100, 30, { homeScore: 1, awayScore: 0 }), "PREDICTIONS_CLOSED");
  assert.equal(state.predictions.length, 0);
});

test("mecz spoza rozgrywek ligi jest odrzucany (MATCH_NOT_IN_LEAGUE)", async () => {
  state.matches.set(31, match(31, PL, hoursFromNow(24)));
  await rejectsWith(service.upsert(me, 100, 31, { homeScore: 1, awayScore: 1 }), "MATCH_NOT_IN_LEAGUE");
});

test("osoba spoza ligi nie może typować (NOT_A_MEMBER)", async () => {
  state.matches.set(30, match(30, CL, hoursFromNow(2)));
  await rejectsWith(service.upsert({ id: 99, role: "USER" }, 100, 30, { homeScore: 1, awayScore: 1 }), "NOT_A_MEMBER");
});

test("ponowne typowanie zmienia istniejący typ zamiast tworzyć drugi", async () => {
  state.matches.set(30, match(30, CL, hoursFromNow(2)));
  await service.upsert(me, 100, 30, { homeScore: 0, awayScore: 0 });
  await service.upsert(me, 100, 30, { homeScore: 3, awayScore: 2 });
  assert.equal(state.predictions.length, 1);
  assert.equal(state.predictions[0].homeScore, 3);
});

test("kopiowanie bierze tylko otwarte mecze z rozgrywek ligi docelowej", async () => {
  state.matches.set(40, match(40, CL, hoursFromNow(24))); // otwarty, CL – kopiujemy
  state.matches.set(41, match(41, CL, hoursFromNow(-1))); // już trwa – pomijamy
  state.matches.set(42, match(42, PL, hoursFromNow(24))); // PL nie należy do ligi 100 – pomijamy
  for (const matchId of [40, 41, 42]) {
    state.predictions.push({ id: 1000 + matchId, userId: 1, leagueId: 200, matchId, homeScore: 1, awayScore: 0, points: null });
  }

  const result = await service.copyFrom(me, 100, { sourceLeagueId: 200, overwrite: false });

  assert.deepEqual(result, { copied: 1, overwritten: 0, skipped: 2 });
  assert.ok(state.predictions.some((p) => p.leagueId === 100 && p.matchId === 40));
});

test("kopiowanie z tej samej ligi jest odrzucane (SAME_LEAGUE)", async () => {
  await rejectsWith(service.copyFrom(me, 100, { sourceLeagueId: 100 }), "SAME_LEAGUE");
});

test("rozliczenie meczu przyznaje punkty 3/1/0 wszystkim typom", async () => {
  state.matches.set(50, { ...match(50, CL, hoursFromNow(-3), "FINISHED"), homeScore: 2, awayScore: 1 });
  state.predictions.push(
    { id: 1, userId: 1, leagueId: 100, matchId: 50, homeScore: 2, awayScore: 1, points: null },
    { id: 2, userId: 2, leagueId: 100, matchId: 50, homeScore: 1, awayScore: 0, points: null },
    { id: 3, userId: 3, leagueId: 200, matchId: 50, homeScore: 0, awayScore: 2, points: null }
  );

  assert.equal(await service.scoreMatch(50), 3);
  assert.deepEqual(state.predictions.map((p) => p.points), [3, 1, 0]);
});

test("bieżąca kolejka to pierwsza z nierozstrzygniętymi meczami (osobno dla każdych rozgrywek)", async () => {
  state.rounds = [
    { competitionId: CL, competitionName: "Liga Mistrzów", stage: "Faza ligowa, 4. kolejka", matches: 18, settled: 18 },
    { competitionId: PL, competitionName: "Premier League", stage: "12. kolejka", matches: 10, settled: 10 },
    { competitionId: CL, competitionName: "Liga Mistrzów", stage: "Faza ligowa, 5. kolejka", matches: 18, settled: 7 },
    { competitionId: CL, competitionName: "Liga Mistrzów", stage: "Faza ligowa, 6. kolejka", matches: 18, settled: 0 },
    { competitionId: PL, competitionName: "Premier League", stage: "13. kolejka", matches: 10, settled: 10 },
  ];
  const groups = await service.rounds(me, 200);
  const cl = groups.find((g) => g.competition.id === CL);
  const pl = groups.find((g) => g.competition.id === PL);
  assert.equal(cl.rounds.length, 3);
  assert.equal(cl.currentStage, "Faza ligowa, 5. kolejka"); // w trakcie rozliczania
  assert.equal(pl.currentStage, "13. kolejka"); // wszystko rozegrane -> ostatnia
});

test("terminarz dla rozgrywek spoza ligi jest odrzucany", async () => {
  await rejectsWith(service.fixtures(me, 100, { competitionId: PL, page: 0, size: 20 }), "COMPETITION_NOT_IN_LEAGUE");
});

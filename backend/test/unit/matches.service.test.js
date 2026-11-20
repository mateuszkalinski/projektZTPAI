const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createMatchesService } = require("../../src/modules/matches/matches.service");
const { createEventBus, EVENTS } = require("../../src/events");

const NOW = new Date("2026-11-21T15:00:00Z");

function setup(match) {
  const saved = [];
  const repo = {
    findById: async () => match,
    setResult: async (id, home, away) => saved.push({ id, home, away }),
  };
  const events = createEventBus();
  const emitted = [];
  events.on(EVENTS.MATCH_FINISHED, (e) => emitted.push(e));
  const service = createMatchesService({ matchesRepository: repo, competitionsService: {}, events, now: () => NOW });
  return { service, saved, emitted };
}

const started = { id: 1, status: "SCHEDULED", kickoffAt: "2026-11-21T14:00:00Z", synced: false };

test("wynik meczu: zapis po rozpoczęciu i zdarzenie do liczenia punktów", async () => {
  const { service, saved, emitted } = setup(started);
  await service.setResult(1, { homeScore: 2, awayScore: 1 });
  assert.deepEqual(saved, [{ id: 1, home: 2, away: 1 }]);
  assert.deepEqual(emitted, [{ matchId: 1 }]);
});

test("wynik meczu: nie przed rozpoczęciem", async () => {
  const { service, saved } = setup({ ...started, kickoffAt: "2026-11-21T16:00:00Z" });
  await assert.rejects(service.setResult(1, { homeScore: 0, awayScore: 0 }), { code: "MATCH_NOT_STARTED" });
  assert.equal(saved.length, 0);
});

test("mecz z football-data.org: wynik tylko z synchronizacji, nie ręcznie", async () => {
  const { service, saved, emitted } = setup({ ...started, synced: true });
  await assert.rejects(service.setResult(1, { homeScore: 1, awayScore: 0 }), { code: "MATCH_SYNCED" });
  await assert.rejects(service.changeStatus(1, "POSTPONED"), { code: "MATCH_SYNCED" });
  await assert.rejects(service.remove(1), { code: "MATCH_SYNCED" });
  assert.equal(saved.length + emitted.length, 0);
});

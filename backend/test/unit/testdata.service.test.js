const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestDataService, TEST_TEAMS } = require("../../src/modules/testdata/testdata.service");

const NOW = new Date("2026-11-21T10:00:00Z");

function setup() {
  const teams = new Map();
  const matches = [];
  let competition = null;
  const competitionsRepository = {
    findCompetitionByCode: async () => competition,
    insertCompetition: async (c) => (competition = { id: 7, ...c }),
    findTeamByName: async (name) => teams.get(name) ?? null,
    insertTeam: async (t) => {
      const team = { id: teams.size + 1, ...t };
      teams.set(t.name, team);
      return team;
    },
  };
  const matchesRepository = {
    listRounds: async () => [...new Set(matches.map((m) => m.stage))].map((stage) => ({ stage })),
    insert: async (m) => matches.push({ id: matches.length + 1, ...m }) && matches.length,
  };
  const matchesService = { get: async (id) => matches[id - 1] };
  const service = createTestDataService({ competitionsRepository, matchesRepository, matchesService, now: () => NOW });
  return { service, matches, teams };
}

test("kolejka testowa: 5 meczów za X minut, każda drużyna gra raz, kolejne kolejki numerowane", async () => {
  const { service, matches, teams } = setup();

  const first = await service.createRound({ minutes: 3, matches: 5 });
  assert.equal(first.stage, "1. kolejka");
  assert.equal(first.matches.length, 5);
  assert.equal(first.kickoffAt.toISOString(), "2026-11-21T10:03:00.000Z");
  assert.equal(teams.size, TEST_TEAMS.length);
  const playing = matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]);
  assert.equal(new Set(playing).size, 10); // nikt nie gra dwa razy ani sam ze sobą

  const second = await service.createRound({ minutes: 10, matches: 2 });
  assert.equal(second.stage, "2. kolejka");
  assert.equal(second.matches.length, 2);
  assert.equal(teams.size, TEST_TEAMS.length); // drużyny nie są dublowane
});

const { notFound } = require("../../common/errors");

/**
 * "Liga Warzyw" – rozgrywki testowe do demonstracji i ręcznego testowania.
 * Admin generuje kolejkę z meczami za kilka minut, gracze typują, mecze się zaczynają
 * (typowanie się zamyka), admin wpisuje wyniki, a punkty liczą się same.
 * Wszystkie reguły biznesowe działają tak samo jak dla prawdziwych meczów.
 * Liga Warzyw nie jest synchronizowana z football-data.org, więc nic jej nie nadpisze.
 */
const COMPETITION = { name: "Liga Warzyw", code: "WARZYWA", season: "testowy" };

const TEAMS = [
  ["Kalafior FC", "KAL"],
  ["Marchewka United", "MAR"],
  ["Sporting Brokuł", "BRO"],
  ["Pietruszka 1906", "PIE"],
  ["Seler Rovers", "SEL"],
  ["Burak Wanderers", "BUR"],
  ["Rzodkiewka Athletic", "RZO"],
  ["Ogórek City", "OGO"],
  ["Pomidor Calcio", "POM"],
  ["Kapusta Dynamo", "KAP"],
];

// losowe przetasowanie (Fisher–Yates); random do podmiany w testach
function shuffle(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// realistyczne wyniki: częściej 0–2 gole niż 4+
const GOALS = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 4];
const randomGoals = (random) => GOALS[Math.floor(random() * GOALS.length)];

function createTestDataService({
  competitionsRepository,
  matchesRepository,
  matchesService,
  now = () => new Date(),
  random = Math.random,
}) {
  async function ensureCompetition() {
    return (
      (await competitionsRepository.findCompetitionByCode(COMPETITION.code)) ??
      competitionsRepository.insertCompetition(COMPETITION)
    );
  }

  async function ensureTeams() {
    const teams = [];
    for (const [name, shortName] of TEAMS) {
      teams.push(
        (await competitionsRepository.findTeamByName(name)) ??
          (await competitionsRepository.insertTeam({ name, shortName }))
      );
    }
    return teams;
  }

  return {
    /** Nowa kolejka Ligi Warzyw: `matches` meczów (max 5 – każda drużyna gra raz) za `minutes` minut. */
    async createRound({ minutes = 3, matches = 5 }) {
      const competition = await ensureCompetition();
      const teams = shuffle(await ensureTeams(), random);
      const roundNumber = (await matchesRepository.listRounds([competition.id])).length + 1;
      const stage = `${roundNumber}. kolejka`;
      const kickoffAt = new Date(now().getTime() + minutes * 60 * 1000);

      const created = [];
      for (let i = 0; i < Math.min(matches, teams.length / 2); i++) {
        const home = teams[2 * i];
        const away = teams[2 * i + 1];
        const id = await matchesRepository.insert({
          competitionId: competition.id,
          homeTeamId: home.id,
          awayTeamId: away.id,
          kickoffAt,
          stage,
        });
        created.push(await matchesService.get(id));
      }
      return { competition, stage, kickoffAt, matches: created };
    },

    /**
     * Losowe wyniki dla wszystkich rozpoczętych, jeszcze nierozliczonych meczów Ligi Warzyw.
     * Idzie przez matchesService.setResult – te same reguły i to samo zdarzenie co ręczne wpisanie wyniku.
     */
    async finishStartedMatches() {
      const competition = await competitionsRepository.findCompetitionByCode(COMPETITION.code);
      if (!competition) throw notFound("Liga Warzyw jeszcze nie istnieje – najpierw wygeneruj kolejkę");
      const { rows } = await matchesRepository.findPage(
        { competitionIds: [competition.id], status: "SCHEDULED", to: now() },
        { page: 0, size: 100 }
      );
      const finished = [];
      for (const match of rows) {
        finished.push(
          await matchesService.setResult(match.id, { homeScore: randomGoals(random), awayScore: randomGoals(random) })
        );
      }
      return { finished: finished.length, matches: finished };
    },
  };
}

module.exports = { createTestDataService, TEST_COMPETITION: COMPETITION, TEST_TEAMS: TEAMS };

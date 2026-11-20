/**
 * "Liga Warzyw" – lokalne rozgrywki testowe (bez synchronizacji z football-data.org).
 * Admin dodaje kolejkę meczów startujących za kilka minut i wpisuje ich wyniki;
 * obowiązują te same reguły co dla prawdziwych meczów.
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
  };
}

module.exports = { createTestDataService, TEST_COMPETITION: COMPETITION, TEST_TEAMS: TEAMS };

// Tłumaczy dane z football-data.org na nasz model. Czyste funkcje – łatwe do testowania.

// statusy API -> nasze statusy
const STATUS = {
  SCHEDULED: "SCHEDULED",
  TIMED: "SCHEDULED",
  IN_PLAY: "SCHEDULED", // trwa: "rozpoczęty" wynika z godziny, wyniku jeszcze nie ma
  PAUSED: "SCHEDULED",
  LIVE: "SCHEDULED",
  FINISHED: "FINISHED",
  AWARDED: "FINISHED", // walkower
  POSTPONED: "POSTPONED",
  SUSPENDED: "POSTPONED",
  CANCELLED: "CANCELLED",
};

const STAGES = {
  LEAGUE_STAGE: "Faza ligowa",
  GROUP_STAGE: "Faza grupowa",
  PLAYOFFS: "Baraże",
  LAST_32: "1/16 finału",
  LAST_16: "1/8 finału",
  QUARTER_FINALS: "Ćwierćfinał",
  SEMI_FINALS: "Półfinał",
  THIRD_PLACE: "Mecz o 3. miejsce",
  FINAL: "Finał",
};

function stageLabel(stage, matchday) {
  if (stage === "REGULAR_SEASON") return matchday ? `${matchday}. kolejka` : "Sezon zasadniczy";
  const name = STAGES[stage] ?? stage ?? null;
  return name && matchday && (stage === "LEAGUE_STAGE" || stage === "GROUP_STAGE") ? `${name}, ${matchday}. kolejka` : name;
}

// w przykładach API pola wyniku nazywają się raz home/away, raz homeTeam/awayTeam
const goals = (part) => (part ? { home: part.home ?? part.homeTeam ?? null, away: part.away ?? part.awayTeam ?? null } : null);

/**
 * Liczy się wynik po 90 minutach (regularTime). fullTime przy karnych wlicza gole z serii (np. 7:6),
 * więc używamy go tylko, gdy regularTime nie ma (mecz zakończony w regulaminowym czasie).
 */
function finalScore(score) {
  const s = goals(score?.regularTime) ?? goals(score?.fullTime);
  return s && Number.isInteger(s.home) && Number.isInteger(s.away) ? s : null;
}

function mapTeam(team) {
  return {
    externalId: team.id,
    name: team.name,
    shortName: team.tla ?? team.shortName ?? null,
    crestUrl: team.crest ?? null,
  };
}

/** @returns mecz w naszym formacie albo null, jeśli drużyny nie są jeszcze znane (np. drabinka pucharowa) */
function mapMatch(m) {
  if (!m.homeTeam?.id || !m.awayTeam?.id) return null;
  const status = STATUS[m.status] ?? "SCHEDULED";
  const score = status === "FINISHED" ? finalScore(m.score) : null;
  return {
    externalId: m.id,
    kickoffAt: new Date(m.utcDate),
    stage: stageLabel(m.stage, m.matchday),
    // zakończony mecz bez wyniku w API traktujemy jak niezakończony – dociągniemy go przy kolejnej synchronizacji
    status: status === "FINISHED" && !score ? "SCHEDULED" : status,
    homeScore: score?.home ?? null,
    awayScore: score?.away ?? null,
    homeTeam: mapTeam(m.homeTeam),
    awayTeam: mapTeam(m.awayTeam),
  };
}

function seasonLabel(season) {
  if (!season?.startDate) return null;
  const start = season.startDate.slice(0, 4);
  const end = season.endDate?.slice(0, 4);
  return end && end !== start ? `${start}/${end.slice(2)}` : start;
}

// polskie nazwy najpopularniejszych rozgrywek (reszta zostaje z API)
const COMPETITION_NAMES = {
  CL: "Liga Mistrzów",
  PL: "Premier League",
  PD: "La Liga",
  BL1: "Bundesliga",
  SA: "Serie A",
  FL1: "Ligue 1",
  WC: "Mistrzostwa Świata",
  EC: "Mistrzostwa Europy",
};

function mapCompetition(data) {
  const { id, code, name } = data.competition;
  return {
    externalId: id,
    code,
    name: COMPETITION_NAMES[code] ?? name,
    season: seasonLabel(data.matches?.[0]?.season),
  };
}

module.exports = { mapMatch, mapCompetition, stageLabel, finalScore };

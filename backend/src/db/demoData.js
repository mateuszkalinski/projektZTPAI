// Dane demonstracyjne: Liga Mistrzów i Premier League, kilka drużyn i meczów.
// Daty liczone względem "teraz", więc zawsze są mecze rozegrane, trwający i nadchodzące.
// Wstawiane tylko do pustej bazy (gdy nie ma jeszcze żadnych rozgrywek).

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function seedDemoData(pool, { now = new Date(), logger = console } = {}) {
  const { rows } = await pool.query("SELECT count(*) AS count FROM competitions");
  if (rows[0].count > 0) return false;

  const at = (offsetMs) => new Date(now.getTime() + offsetMs);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cl = await insertCompetition(client, "Liga Mistrzów UEFA", "CL", "2026/27");
    const pl = await insertCompetition(client, "Premier League", "PL", "2026/27");

    const t = {};
    for (const [key, name, shortName] of [
      ["rma", "Real Madryt", "RMA"],
      ["bar", "FC Barcelona", "BAR"],
      ["bay", "Bayern Monachium", "BAY"],
      ["int", "Inter Mediolan", "INT"],
      ["ars", "Arsenal", "ARS"],
      ["liv", "Liverpool", "LIV"],
      ["mci", "Manchester City", "MCI"],
      ["che", "Chelsea", "CHE"],
    ]) {
      const res = await client.query(
        "INSERT INTO teams (name, short_name) VALUES ($1, $2) RETURNING id",
        [name, shortName]
      );
      t[key] = res.rows[0].id;
    }

    const matches = [
      // rozegrane
      [cl, t.rma, t.bay, at(-3 * DAY), "Faza ligowa", "FINISHED", 2, 1],
      [pl, t.ars, t.liv, at(-2 * DAY), "12. kolejka", "FINISHED", 1, 1],
      // trwa – typowanie zamknięte, wyniku jeszcze nie ma
      [cl, t.bar, t.int, at(-0.5 * HOUR), "Faza ligowa", "SCHEDULED", null, null],
      // nadchodzące
      [cl, t.bay, t.bar, at(1 * DAY), "Faza ligowa", "SCHEDULED", null, null],
      [cl, t.int, t.rma, at(1 * DAY + 3 * HOUR), "Faza ligowa", "SCHEDULED", null, null],
      [pl, t.mci, t.che, at(2 * DAY), "13. kolejka", "SCHEDULED", null, null],
      [pl, t.liv, t.ars, at(3 * DAY), "13. kolejka", "SCHEDULED", null, null],
      [pl, t.che, t.mci, at(7 * DAY), "14. kolejka", "SCHEDULED", null, null],
    ];
    for (const m of matches) {
      await client.query(
        `INSERT INTO matches (competition_id, home_team_id, away_team_id, kickoff_at, stage, status, home_score, away_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        m
      );
    }
    await client.query("COMMIT");
    logger.info("[demo] dodano przykładowe rozgrywki, drużyny i mecze");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function insertCompetition(client, name, code, season) {
  const res = await client.query(
    "INSERT INTO competitions (name, code, season) VALUES ($1, $2, $3) RETURNING id",
    [name, code, season]
  );
  return res.rows[0].id;
}

module.exports = { seedDemoData };

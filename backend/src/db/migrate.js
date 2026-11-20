const fs = require("node:fs");
const path = require("node:path");

const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "migrations");

// Prosty mechanizm migracji: pliki migrations/NNN_nazwa.sql wykonywane po kolei, każdy raz.
// Lista wykonanych migracji jest w tabeli schema_migrations.
async function runMigrations(pool, logger = console) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  const { rows } = await pool.query("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.name));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      logger.info(`[migrate] wykonano ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Migracja ${file} nie powiodła się: ${err.message}`);
    } finally {
      client.release();
    }
  }
}

module.exports = { runMigrations };

// npm run migrate – uruchomienie ręczne (migracje wykonują się też przy starcie serwera)
if (require.main === module) {
  const { loadEnvFile, loadConfig } = require("../config");
  const { createPool } = require("./pool");
  loadEnvFile();
  const pool = createPool(loadConfig().db);
  runMigrations(pool)
    .then(() => console.log("[migrate] baza aktualna"))
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

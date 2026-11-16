const { Pool, types } = require("pg");

// COUNT(...) w Postgresie zwraca bigint, a SUM(...) numeric – pg domyślnie oddaje je jako tekst.
// Nasze liczby są małe, więc zamieniamy je od razu na zwykłe number.
types.setTypeParser(20, Number);
types.setTypeParser(1700, Number);

function createPool(dbConfig) {
  return new Pool({ ...dbConfig, max: 10 });
}

// Uruchamia fn w jednej transakcji. fn dostaje klienta z metodą query(), tak samo jak pool.
async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createPool, withTransaction };

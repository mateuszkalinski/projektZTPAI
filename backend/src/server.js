const { loadEnvFile, loadConfig } = require("./config");
const { createPool } = require("./db/pool");
const { runMigrations } = require("./db/migrate");
const { seedDemoData } = require("./db/demoData");
const { createApp } = require("./app");

async function main() {
  loadEnvFile();
  const config = loadConfig();
  const pool = createPool(config.db);

  await runMigrations(pool);
  if (config.loadDemoData) await seedDemoData(pool);

  const { app, services } = createApp({ pool, config });
  await services.usersService.ensureAdmin(config.admin);

  const server = app.listen(config.port, () => {
    console.log(`Pogwizdek API: http://localhost:${config.port}/api  (Swagger: /api/docs)`);
  });

  const shutdown = () => server.close(() => pool.end());
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

const { loadEnvFile, loadConfig } = require("./config");
const { createPool } = require("./db/pool");
const { runMigrations } = require("./db/migrate");
const { seedDemoData } = require("./db/demoData");
const { createApp } = require("./app");
const { startSyncScheduler } = require("./modules/sync/sync.scheduler");

async function main() {
  loadEnvFile();
  const config = loadConfig();
  const pool = createPool(config.db);
  const syncEnabled = Boolean(config.footballData.token);

  await runMigrations(pool);
  // przy włączonej synchronizacji prawdziwe mecze przychodzą z API, dane demo są zbędne
  if (config.loadDemoData && !syncEnabled) await seedDemoData(pool);

  const { app, services } = createApp({ pool, config });
  await services.usersService.ensureAdmin(config.admin);

  const server = app.listen(config.port, () => {
    console.log(`Pogwizdek API: http://localhost:${config.port}/api  (Swagger: /api/docs)`);
  });

  const stopSync = syncEnabled
    ? startSyncScheduler({ syncService: services.syncService, intervalMinutes: config.footballData.intervalMinutes })
    : (console.log("[sync] wyłączona – brak FOOTBALL_DATA_TOKEN w .env (działają dane demo)"), () => {});

  const shutdown = () => {
    stopSync();
    server.close(() => pool.end());
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

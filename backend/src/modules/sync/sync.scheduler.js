/**
 * Harmonogram: pierwsza synchronizacja zaraz po starcie serwera (nadrabia to, co działo się,
 * gdy aplikacja była wyłączona), potem co `intervalMinutes` minut.
 * @returns funkcja zatrzymująca harmonogram
 */
function startSyncScheduler({ syncService, intervalMinutes, logger = console }) {
  const run = () => syncService.syncAll().catch((err) => logger.error("[sync] nieoczekiwany błąd", err));

  const first = setTimeout(run, 0);
  const timer = setInterval(run, intervalMinutes * 60 * 1000);
  logger.info(`[sync] synchronizacja z football-data.org co ${intervalMinutes} min`);

  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}

module.exports = { startSyncScheduler };

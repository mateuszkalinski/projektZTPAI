const { EVENTS } = require("../../events");

/**
 * Mechanizm asynchroniczny: po wpisaniu wyniku moduł meczów emituje MATCH_FINISHED,
 * a tutaj – poza obsługą tamtego requestu (setImmediate) – liczymy punkty wszystkich typów.
 * Admin dostaje odpowiedź od razu i nie czeka na rozliczenie.
 */
function registerScoringListener({ events, predictionsService, logger = console }) {
  events.on(EVENTS.MATCH_FINISHED, ({ matchId }) => {
    setImmediate(async () => {
      try {
        const count = await predictionsService.scoreMatch(matchId);
        logger.info(`[scoring] rozliczono ${count} typów dla meczu ${matchId}`);
        events.emit(EVENTS.PREDICTIONS_SCORED, { matchId, count });
      } catch (err) {
        logger.error(`[scoring] błąd rozliczania meczu ${matchId}`, err);
      }
    });
  });
}

module.exports = { registerScoringListener };

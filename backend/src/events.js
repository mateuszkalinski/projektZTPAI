const { EventEmitter } = require("node:events");

// Wbudowany w Node system zdarzeń – mechanizm asynchroniczny wymagany na 5.0.
// Moduł meczów tylko ogłasza "mecz zakończony", a moduł typów sam reaguje i liczy punkty.
const EVENTS = Object.freeze({
  MATCH_FINISHED: "match.finished",       // { matchId }
  PREDICTIONS_SCORED: "predictions.scored", // { matchId, count }
});

function createEventBus() {
  return new EventEmitter();
}

module.exports = { EVENTS, createEventBus };

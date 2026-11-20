const { EventEmitter } = require("node:events");

// Szyna zdarzeń aplikacji (EventEmitter z Node).
// Moduł meczów ogłasza zakończenie meczu, a moduł typów reaguje na nie i liczy punkty.
const EVENTS = Object.freeze({
  MATCH_FINISHED: "match.finished",       // { matchId }
  PREDICTIONS_SCORED: "predictions.scored", // { matchId, count }
});

function createEventBus() {
  return new EventEmitter();
}

module.exports = { EVENTS, createEventBus };

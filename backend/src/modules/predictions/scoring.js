// Punktacja 3/1/0 (docelowa punktacja jeszcze do ustalenia – wystarczy podmienić tę funkcję):
// 3 – dokładny wynik, 1 – trafiony rezultat (zwycięzca albo remis), 0 – pudło.
const POINTS = Object.freeze({ EXACT: 3, OUTCOME: 1, MISS: 0 });

function scorePrediction(predicted, actual) {
  if (predicted.home === actual.home && predicted.away === actual.away) return POINTS.EXACT;
  if (Math.sign(predicted.home - predicted.away) === Math.sign(actual.home - actual.away)) return POINTS.OUTCOME;
  return POINTS.MISS;
}

module.exports = { scorePrediction, POINTS };

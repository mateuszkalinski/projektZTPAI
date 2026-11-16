const { test } = require("node:test");
const assert = require("node:assert/strict");
const { scorePrediction } = require("../../src/modules/predictions/scoring");

const cases = [
  // [typ, wynik, punkty, opis]
  [[2, 1], [2, 1], 3, "dokładny wynik"],
  [[0, 0], [0, 0], 3, "dokładny remis 0:0"],
  [[3, 0], [1, 0], 1, "trafione zwycięstwo gospodarzy"],
  [[1, 1], [2, 2], 1, "trafiony remis"],
  [[0, 2], [1, 3], 1, "trafione zwycięstwo gości"],
  [[2, 0], [0, 1], 0, "pudło"],
  [[1, 1], [1, 0], 0, "remis zamiast wygranej"],
];

for (const [[ph, pa], [ah, aa], expected, label] of cases) {
  test(`punktacja: ${label} (${ph}:${pa} vs ${ah}:${aa}) -> ${expected} pkt`, () => {
    assert.equal(scorePrediction({ home: ph, away: pa }, { home: ah, away: aa }), expected);
  });
}

const express = require("express");
const { body, query, parseId, pageQuery } = require("../../common/validation");

const predictionSchema = {
  homeScore: { type: "int", required: true, min: 0, max: 30 },
  awayScore: { type: "int", required: true, min: 0, max: 30 },
};

// Montowany pod /api/leagues/:leagueId (mergeParams daje dostęp do :leagueId)
function createPredictionsRouter({ predictionsService: service }) {
  const router = express.Router({ mergeParams: true });
  const leagueId = (req) => parseId(req.params.leagueId, "leagueId");
  const matchId = (req) => parseId(req.params.matchId, "matchId");

  router.get(
    "/fixtures",
    query({
      ...pageQuery,
      status: { type: "enum", values: ["SCHEDULED", "FINISHED", "POSTPONED", "CANCELLED"] },
      from: { type: "date" },
      to: { type: "date" },
    }),
    async (req, res) => {
      res.json(await service.fixtures(req.user, leagueId(req), req.validQuery));
    }
  );

  router.put("/matches/:matchId/prediction", body(predictionSchema), async (req, res) => {
    res.json(await service.upsert(req.user, leagueId(req), matchId(req), req.body));
  });

  router.delete("/matches/:matchId/prediction", async (req, res) => {
    await service.remove(req.user, leagueId(req), matchId(req));
    res.status(204).end();
  });

  router.get("/matches/:matchId/predictions", async (req, res) => {
    res.json(await service.matchPredictions(req.user, leagueId(req), matchId(req)));
  });

  router.post(
    "/predictions/copy",
    body({ sourceLeagueId: { type: "int", required: true, min: 1 }, overwrite: { type: "boolean", default: false } }),
    async (req, res) => {
      res.json(await service.copyFrom(req.user, leagueId(req), req.body));
    }
  );

  return router;
}

module.exports = { createPredictionsRouter };

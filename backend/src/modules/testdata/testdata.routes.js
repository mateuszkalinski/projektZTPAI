const express = require("express");
const { body } = require("../../common/validation");
const { requireRole } = require("../../middleware/auth");

// /api/test-data – narzędzia admina do Ligi Warzyw (testy ręczne i demo)
function createTestDataRouter({ testDataService }) {
  const router = express.Router();
  router.use(requireRole("ADMIN"));

  router.post(
    "/round",
    body({
      minutes: { type: "int", min: 1, max: 1440, default: 3 },
      matches: { type: "int", min: 1, max: 5, default: 5 },
    }),
    async (req, res) => {
      res.status(201).json(await testDataService.createRound(req.body));
    }
  );

  router.post("/results", async (req, res) => {
    res.json(await testDataService.finishStartedMatches());
  });

  return router;
}

module.exports = { createTestDataRouter };

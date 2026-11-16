const express = require("express");
const { body, query, parseId, pageQuery } = require("../../common/validation");
const { requireRole } = require("../../middleware/auth");

const STATUSES = ["SCHEDULED", "FINISHED", "POSTPONED", "CANCELLED"];

const matchSchema = {
  competitionId: { type: "int", required: true, min: 1 },
  homeTeamId: { type: "int", required: true, min: 1 },
  awayTeamId: { type: "int", required: true, min: 1 },
  kickoffAt: { type: "date", required: true },
  stage: { type: "string", max: 50 },
};

const resultSchema = {
  homeScore: { type: "int", required: true, min: 0, max: 99 },
  awayScore: { type: "int", required: true, min: 0, max: 99 },
};

// Terminarz z filtrami i stronicowaniem, np. /api/matches?competitionId=1&status=SCHEDULED&page=0&size=20
const listQuery = {
  ...pageQuery,
  competitionId: { type: "intArray" },
  status: { type: "enum", values: STATUSES },
  teamId: { type: "int", min: 1 },
  from: { type: "date" },
  to: { type: "date" },
};

function createMatchesRouter({ matchesService: service }) {
  const router = express.Router();
  const admin = requireRole("ADMIN");

  router.get("/", query(listQuery), async (req, res) => {
    const { page, size, competitionId, ...filter } = req.validQuery;
    res.json(await service.list({ ...filter, competitionIds: competitionId }, { page, size }));
  });

  router.get("/:id", async (req, res) => res.json(await service.get(parseId(req.params.id))));

  router.post("/", admin, body(matchSchema), async (req, res) => {
    res.status(201).json(await service.create(req.body));
  });

  router.put("/:id", admin, body(matchSchema), async (req, res) => {
    res.json(await service.update(parseId(req.params.id), req.body));
  });

  router.delete("/:id", admin, async (req, res) => {
    await service.remove(parseId(req.params.id));
    res.status(204).end();
  });

  router.put("/:id/result", admin, body(resultSchema), async (req, res) => {
    res.json(await service.setResult(parseId(req.params.id), req.body));
  });

  // zakończenie meczu idzie przez /result, tu tylko przełożenie/odwołanie/przywrócenie
  router.patch(
    "/:id/status",
    admin,
    body({ status: { type: "enum", required: true, values: ["SCHEDULED", "POSTPONED", "CANCELLED"] } }),
    async (req, res) => {
      res.json(await service.changeStatus(parseId(req.params.id), req.body.status));
    }
  );

  return router;
}

module.exports = { createMatchesRouter };

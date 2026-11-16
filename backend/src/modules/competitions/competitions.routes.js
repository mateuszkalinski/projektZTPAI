const express = require("express");
const { body, query, parseId, pageQuery } = require("../../common/validation");
const { requireRole } = require("../../middleware/auth");

const competitionSchema = {
  name: { type: "string", required: true, max: 100 },
  code: { type: "string", required: true, max: 20, pattern: /^[A-Za-z0-9_]+$/, patternMessage: "litery, cyfry, _" },
  season: { type: "string", max: 20 },
};

const teamSchema = {
  name: { type: "string", required: true, max: 100 },
  shortName: { type: "string", max: 20 },
  crestUrl: { type: "string", max: 500 },
};

// /api/competitions – odczyt dla zalogowanych, zapis tylko ADMIN
function createCompetitionsRouter({ competitionsService: service }) {
  const router = express.Router();
  const admin = requireRole("ADMIN");

  router.get("/", async (req, res) => res.json(await service.listCompetitions()));
  router.get("/:id", async (req, res) => res.json(await service.getCompetition(parseId(req.params.id))));
  router.post("/", admin, body(competitionSchema), async (req, res) => {
    res.status(201).json(await service.createCompetition(req.body));
  });
  router.put("/:id", admin, body(competitionSchema), async (req, res) => {
    res.json(await service.updateCompetition(parseId(req.params.id), req.body));
  });
  router.delete("/:id", admin, async (req, res) => {
    await service.deleteCompetition(parseId(req.params.id));
    res.status(204).end();
  });

  return router;
}

// /api/teams
function createTeamsRouter({ competitionsService: service }) {
  const router = express.Router();
  const admin = requireRole("ADMIN");

  router.get("/", query({ ...pageQuery, q: { type: "string", max: 100 } }), async (req, res) => {
    res.json(await service.listTeams(req.validQuery));
  });
  router.get("/:id", async (req, res) => res.json(await service.getTeam(parseId(req.params.id))));
  router.post("/", admin, body(teamSchema), async (req, res) => {
    res.status(201).json(await service.createTeam(req.body));
  });
  router.put("/:id", admin, body(teamSchema), async (req, res) => {
    res.json(await service.updateTeam(parseId(req.params.id), req.body));
  });
  router.delete("/:id", admin, async (req, res) => {
    await service.deleteTeam(parseId(req.params.id));
    res.status(204).end();
  });

  return router;
}

module.exports = { createCompetitionsRouter, createTeamsRouter };

const express = require("express");
const { body, query, parseId, pageQuery } = require("../../common/validation");

const leagueSchema = {
  name: { type: "string", required: true, max: 100 },
  description: { type: "string", max: 500 },
  competitionIds: { type: "intArray", required: true, min: 1, minMessage: "liga musi obejmować przynajmniej jedne rozgrywki" },
};

function createLeaguesRouter({ leaguesService: service, predictionsRouter }) {
  const router = express.Router();

  router.get("/", async (req, res) => res.json(await service.myLeagues(req.user)));

  router.post("/", body(leagueSchema), async (req, res) => {
    res.status(201).json(await service.create(req.user, req.body));
  });

  router.post("/join", body({ inviteCode: { type: "string", required: true, max: 12 } }), async (req, res) => {
    res.json(await service.join(req.user, req.body.inviteCode));
  });

  router.get("/:id", async (req, res) => res.json(await service.get(req.user, parseId(req.params.id))));

  router.put("/:id", body(leagueSchema), async (req, res) => {
    res.json(await service.update(req.user, parseId(req.params.id), req.body));
  });

  router.delete("/:id", async (req, res) => {
    await service.remove(req.user, parseId(req.params.id));
    res.status(204).end();
  });

  router.post("/:id/leave", async (req, res) => {
    await service.leave(req.user, parseId(req.params.id));
    res.status(204).end();
  });

  router.post("/:id/invite-code", async (req, res) => {
    res.json(await service.regenerateInviteCode(req.user, parseId(req.params.id)));
  });

  router.get("/:id/members", async (req, res) => {
    res.json(await service.members(req.user, parseId(req.params.id)));
  });

  router.delete("/:id/members/:userId", async (req, res) => {
    await service.removeMember(req.user, parseId(req.params.id), parseId(req.params.userId, "userId"));
    res.status(204).end();
  });

  router.post("/:id/transfer-ownership", body({ newOwnerId: { type: "int", required: true, min: 1 } }), async (req, res) => {
    res.json(await service.transferOwnership(req.user, parseId(req.params.id), req.body.newOwnerId));
  });

  router.get("/:id/leaderboard", query(pageQuery), async (req, res) => {
    res.json(await service.leaderboard(req.user, parseId(req.params.id), req.validQuery));
  });

  // typy w lidze: /api/leagues/:leagueId/fixtures, /matches/:matchId/prediction, ...
  router.use("/:leagueId", predictionsRouter);

  return router;
}

module.exports = { createLeaguesRouter };

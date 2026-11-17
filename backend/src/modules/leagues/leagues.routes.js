const express = require("express");
const { body, query, parseId, pageQuery } = require("../../common/validation");

const createSchema = {
  name: { type: "string", required: true, max: 100 },
  description: { type: "string", max: 500 },
  isPublic: { type: "boolean", default: false },
  competitionIds: { type: "intArray", required: true, min: 1, minMessage: "liga musi obejmować przynajmniej jedne rozgrywki" },
};

// przy edycji rozgrywek nie zmieniamy (tabela straciłaby sens w trakcie sezonu)
const updateSchema = {
  name: { type: "string", required: true, max: 100 },
  description: { type: "string", max: 500 },
  isPublic: { type: "boolean", default: false },
};

const searchQuery = { ...pageQuery, q: { type: "string", max: 100 } };

function createLeaguesRouter({ leaguesService: service, predictionsRouter }) {
  const router = express.Router();
  const id = (req) => parseId(req.params.id);
  const userId = (req) => parseId(req.params.userId, "userId");

  router.get("/", async (req, res) => res.json(await service.myLeagues(req.user)));

  // lista lig publicznych, od największych; ?q= szuka po nazwie
  router.get("/public", query(searchQuery), async (req, res) => {
    res.json(await service.publicLeagues(req.user, req.validQuery));
  });

  router.post("/", body(createSchema), async (req, res) => {
    res.status(201).json(await service.create(req.user, req.body));
  });

  // dołączenie kodem (liga prywatna albo publiczna)
  router.post("/join", body({ inviteCode: { type: "string", required: true, max: 12 } }), async (req, res) => {
    res.json(await service.join(req.user, req.body.inviteCode));
  });

  router.get("/:id", async (req, res) => res.json(await service.get(req.user, id(req))));

  router.put("/:id", body(updateSchema), async (req, res) => {
    res.json(await service.update(req.user, id(req), req.body));
  });

  router.delete("/:id", async (req, res) => {
    await service.remove(req.user, id(req));
    res.status(204).end();
  });

  // dołączenie do ligi publicznej bez kodu
  router.post("/:id/join", async (req, res) => {
    res.json(await service.joinPublic(req.user, id(req)));
  });

  router.post("/:id/leave", async (req, res) => {
    await service.leave(req.user, id(req));
    res.status(204).end();
  });

  router.post("/:id/invite-code", async (req, res) => {
    res.json(await service.regenerateInviteCode(req.user, id(req)));
  });

  router.get("/:id/members", async (req, res) => {
    res.json(await service.members(req.user, id(req)));
  });

  // usunięcie gracza z ligi = ban
  router.delete("/:id/members/:userId", async (req, res) => {
    await service.banMember(req.user, id(req), userId(req));
    res.status(204).end();
  });

  router.get("/:id/bans", async (req, res) => {
    res.json(await service.bans(req.user, id(req)));
  });

  router.delete("/:id/bans/:userId", async (req, res) => {
    await service.unban(req.user, id(req), userId(req));
    res.status(204).end();
  });

  router.post("/:id/transfer-ownership", body({ newOwnerId: { type: "int", required: true, min: 1 } }), async (req, res) => {
    res.json(await service.transferOwnership(req.user, id(req), req.body.newOwnerId));
  });

  // tabela: ?size=10 dla topki, ?q= szuka gracza po nicku
  router.get("/:id/leaderboard", query(searchQuery), async (req, res) => {
    res.json(await service.leaderboard(req.user, id(req), req.validQuery));
  });

  // typy w lidze: /api/leagues/:leagueId/fixtures, /rounds, /matches/:matchId/prediction, ...
  router.use("/:leagueId", predictionsRouter);

  return router;
}

module.exports = { createLeaguesRouter };

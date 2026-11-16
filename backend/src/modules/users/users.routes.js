const express = require("express");
const { body, query, parseId, pageQuery } = require("../../common/validation");
const { requireRole } = require("../../middleware/auth");

function createUsersRouter({ usersService }) {
  const router = express.Router();

  router.get("/me", async (req, res) => {
    res.json(await usersService.get(req.user.id));
  });

  router.get("/", requireRole("ADMIN"), query({ ...pageQuery, q: { type: "string", max: 50 } }), async (req, res) => {
    res.json(await usersService.list(req.validQuery));
  });

  router.patch(
    "/:id/role",
    requireRole("ADMIN"),
    body({ role: { type: "enum", required: true, values: ["USER", "ADMIN"] } }),
    async (req, res) => {
      res.json(await usersService.changeRole(req.user, parseId(req.params.id), req.body.role));
    }
  );

  return router;
}

module.exports = { createUsersRouter };

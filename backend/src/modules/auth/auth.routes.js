const express = require("express");
const { body } = require("../../common/validation");

const registerSchema = {
  username: {
    type: "string",
    required: true,
    min: 3,
    max: 50,
    pattern: /^[A-Za-z0-9_.-]+$/,
    patternMessage: "dozwolone litery, cyfry oraz _ . -",
  },
  email: { type: "email", required: true, max: 255 },
  password: { type: "string", required: true, min: 8, max: 100, trim: false },
};

const loginSchema = {
  username: { type: "string", required: true },
  password: { type: "string", required: true, trim: false },
};

function createAuthRouter({ authService }) {
  const router = express.Router();

  router.post("/register", body(registerSchema), async (req, res) => {
    res.status(201).json(await authService.register(req.body));
  });

  router.post("/login", body(loginSchema), async (req, res) => {
    res.json(await authService.login(req.body));
  });

  return router;
}

module.exports = { createAuthRouter };

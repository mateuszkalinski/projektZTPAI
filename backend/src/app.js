const express = require("express");
const swaggerUi = require("swagger-ui-express");

const { createEventBus } = require("./events");
const { requestLogger } = require("./middleware/requestLogger");
const { authenticate } = require("./middleware/auth");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const openapi = require("./docs/openapi");

const { createUsersRepository } = require("./modules/users/users.repository");
const { createUsersService } = require("./modules/users/users.service");
const { createUsersRouter } = require("./modules/users/users.routes");
const { createAuthService } = require("./modules/auth/auth.service");
const { createAuthRouter } = require("./modules/auth/auth.routes");
const { createCompetitionsRepository } = require("./modules/competitions/competitions.repository");
const { createCompetitionsService } = require("./modules/competitions/competitions.service");
const { createCompetitionsRouter, createTeamsRouter } = require("./modules/competitions/competitions.routes");
const { createMatchesRepository } = require("./modules/matches/matches.repository");
const { createMatchesService } = require("./modules/matches/matches.service");
const { createMatchesRouter } = require("./modules/matches/matches.routes");
const { createLeaguesRepository } = require("./modules/leagues/leagues.repository");
const { createLeaguesService } = require("./modules/leagues/leagues.service");
const { createLeaguesRouter } = require("./modules/leagues/leagues.routes");
const { createPredictionsRepository } = require("./modules/predictions/predictions.repository");
const { createPredictionsService } = require("./modules/predictions/predictions.service");
const { createPredictionsRouter } = require("./modules/predictions/predictions.routes");
const { registerScoringListener } = require("./modules/predictions/scoring.listener");

/**
 * Składa aplikację: repository -> service -> router. Nie uruchamia serwera (to robi server.js),
 * dzięki czemu testy mogą podać własną bazę, zegar i logger.
 */
function createApp({ pool, config, now = () => new Date(), events = createEventBus(), logger = console }) {
  // ---------- dostęp do danych ----------
  const usersRepository = createUsersRepository(pool);
  const competitionsRepository = createCompetitionsRepository(pool);
  const matchesRepository = createMatchesRepository(pool);
  const leaguesRepository = createLeaguesRepository(pool);
  const predictionsRepository = createPredictionsRepository(pool);

  // ---------- logika biznesowa ----------
  const usersService = createUsersService({ usersRepository });
  const authService = createAuthService({ usersRepository, jwtSecret: config.jwtSecret, jwtExpiresIn: config.jwtExpiresIn });
  const competitionsService = createCompetitionsService({ competitionsRepository });
  const matchesService = createMatchesService({ matchesRepository, competitionsService, events, now });
  const leaguesService = createLeaguesService({ leaguesRepository, competitionsRepository });
  const predictionsService = createPredictionsService({
    predictionsRepository,
    matchesRepository,
    leaguesService,
    leaguesRepository,
    now,
  });
  registerScoringListener({ events, predictionsService, logger });

  // ---------- HTTP ----------
  const app = express();
  app.disable("x-powered-by");
  app.set("json spaces", 2);
  app.use(requestLogger(logger));
  app.use(express.json());

  const auth = authenticate({ jwtSecret: config.jwtSecret, usersRepository });

  app.get("/api/health", (req, res) => res.json({ status: "ok" }));
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapi));
  app.get("/api/openapi.json", (req, res) => res.json(openapi));

  app.use("/api/auth", createAuthRouter({ authService }));
  app.use("/api/users", auth, createUsersRouter({ usersService }));
  app.use("/api/competitions", auth, createCompetitionsRouter({ competitionsService }));
  app.use("/api/teams", auth, createTeamsRouter({ competitionsService }));
  app.use("/api/matches", auth, createMatchesRouter({ matchesService }));
  app.use(
    "/api/leagues",
    auth,
    createLeaguesRouter({ leaguesService, predictionsRouter: createPredictionsRouter({ predictionsService }) })
  );

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return { app, events, services: { usersService, authService, matchesService, leaguesService, predictionsService } };
}

module.exports = { createApp };

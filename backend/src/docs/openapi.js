// Dokumentacja REST API (OpenAPI 3) – podgląd w Swagger UI pod /api/docs
const json = (schema) => ({ content: { "application/json": { schema } } });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const ok = (description, schema) => ({ description, ...(schema ? json(schema) : {}) });
const errors = (...codes) =>
  Object.fromEntries(codes.map((c) => [c, ok({ 400: "Błąd walidacji", 401: "Brak logowania", 403: "Brak uprawnień", 404: "Nie znaleziono", 409: "Naruszenie reguły biznesowej" }[c], ref("Error"))]));
const idParam = (name = "id") => ({ name, in: "path", required: true, schema: { type: "integer" } });
const pageParams = [
  { name: "page", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
  { name: "size", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
];
const page = (item) => ({
  type: "object",
  properties: {
    content: { type: "array", items: item },
    page: { type: "integer" },
    size: { type: "integer" },
    totalElements: { type: "integer" },
    totalPages: { type: "integer" },
  },
});
const body = (schema) => ({ required: true, ...json(schema) });
const adminOnly = " (tylko ADMIN)";

module.exports = {
  openapi: "3.0.3",
  info: {
    title: "Pogwizdek API",
    version: "0.1.0",
    description: "Typowanie wyników meczów w prywatnych ligach znajomych. Zaloguj się, skopiuj accessToken i kliknij Authorize.",
  },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    schemas: {
      Error: {
        type: "object",
        properties: {
          timestamp: { type: "string", format: "date-time" },
          status: { type: "integer" },
          code: { type: "string", example: "PREDICTIONS_CLOSED" },
          message: { type: "string" },
          path: { type: "string" },
          fieldErrors: { type: "object", additionalProperties: { type: "string" } },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "integer" },
          username: { type: "string" },
          email: { type: "string" },
          role: { type: "string", enum: ["USER", "ADMIN"] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      UserSummary: { type: "object", properties: { id: { type: "integer" }, username: { type: "string" } } },
      AuthResponse: {
        type: "object",
        properties: {
          accessToken: { type: "string" },
          tokenType: { type: "string", example: "Bearer" },
          expiresIn: { type: "integer", description: "sekundy" },
          user: ref("User"),
        },
      },
      Competition: {
        type: "object",
        properties: { id: { type: "integer" }, name: { type: "string" }, code: { type: "string" }, season: { type: "string" } },
      },
      CompetitionInput: {
        type: "object",
        required: ["name", "code"],
        properties: { name: { type: "string" }, code: { type: "string", example: "SA" }, season: { type: "string" } },
      },
      Team: {
        type: "object",
        properties: { id: { type: "integer" }, name: { type: "string" }, shortName: { type: "string" }, crestUrl: { type: "string" } },
      },
      TeamInput: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" }, shortName: { type: "string" }, crestUrl: { type: "string" } },
      },
      Match: {
        type: "object",
        properties: {
          id: { type: "integer" },
          competition: ref("Competition"),
          homeTeam: ref("Team"),
          awayTeam: ref("Team"),
          kickoffAt: { type: "string", format: "date-time" },
          stage: { type: "string" },
          status: { type: "string", enum: ["SCHEDULED", "FINISHED", "POSTPONED", "CANCELLED"] },
          homeScore: { type: "integer", nullable: true },
          awayScore: { type: "integer", nullable: true },
          started: { type: "boolean" },
        },
      },
      MatchInput: {
        type: "object",
        required: ["competitionId", "homeTeamId", "awayTeamId", "kickoffAt"],
        properties: {
          competitionId: { type: "integer" },
          homeTeamId: { type: "integer" },
          awayTeamId: { type: "integer" },
          kickoffAt: { type: "string", format: "date-time" },
          stage: { type: "string" },
        },
      },
      Score: {
        type: "object",
        required: ["homeScore", "awayScore"],
        properties: { homeScore: { type: "integer", minimum: 0 }, awayScore: { type: "integer", minimum: 0 } },
      },
      League: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          description: { type: "string", nullable: true },
          isPublic: { type: "boolean", description: "publiczna = na liście lig publicznych, dołączenie bez kodu" },
          inviteCode: { type: "string", nullable: true, description: "widoczny tylko dla członków" },
          owner: ref("UserSummary"),
          competitions: { type: "array", items: ref("Competition") },
          memberCount: { type: "integer" },
          myRole: { type: "string", enum: ["OWNER", "MEMBER"], nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      LeagueInput: {
        type: "object",
        required: ["name", "competitionIds"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          isPublic: { type: "boolean", default: false },
          competitionIds: { type: "array", items: { type: "integer" }, minItems: 1 },
        },
      },
      LeagueUpdate: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" }, description: { type: "string" }, isPublic: { type: "boolean" } },
      },
      Member: {
        type: "object",
        properties: { user: ref("UserSummary"), role: { type: "string" }, joinedAt: { type: "string", format: "date-time" } },
      },
      LeaderboardEntry: {
        type: "object",
        properties: {
          position: { type: "integer", description: "miejsce w całej lidze (remis = to samo miejsce)" },
          userId: { type: "integer" },
          username: { type: "string" },
          role: { type: "string", enum: ["OWNER", "MEMBER"] },
          joinedAt: { type: "string", format: "date-time" },
          points: { type: "integer" },
          scoredPredictions: { type: "integer" },
          roundPoints: {
            type: "array",
            items: { type: "integer", nullable: true },
            description: "punkty w kolejnych pozycjach z listy rounds (null = brak typów)",
          },
        },
      },
      Prediction: {
        type: "object",
        properties: {
          id: { type: "integer" },
          matchId: { type: "integer" },
          leagueId: { type: "integer" },
          user: ref("UserSummary"),
          homeScore: { type: "integer" },
          awayScore: { type: "integer" },
          points: { type: "integer", nullable: true, description: "null = mecz nierozliczony" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Fixture: {
        type: "object",
        properties: { match: ref("Match"), myPrediction: { ...ref("Prediction"), nullable: true }, canPredict: { type: "boolean" } },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Rejestracja",
        security: [],
        requestBody: body({
          type: "object",
          required: ["username", "email", "password"],
          properties: { username: { type: "string" }, email: { type: "string" }, password: { type: "string", minLength: 8 } },
        }),
        responses: { 201: ok("Konto utworzone", ref("AuthResponse")), ...errors(400, 409) },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Logowanie – zwraca token JWT",
        security: [],
        requestBody: body({ type: "object", required: ["username", "password"], properties: { username: { type: "string" }, password: { type: "string" } } }),
        responses: { 200: ok("Zalogowano", ref("AuthResponse")), ...errors(400, 401) },
      },
    },
    "/api/users/me": { get: { tags: ["Users"], summary: "Zalogowany użytkownik", responses: { 200: ok("OK", ref("User")), ...errors(401) } } },
    "/api/users": {
      get: {
        tags: ["Users"],
        summary: "Lista użytkowników" + adminOnly,
        parameters: [...pageParams, { name: "q", in: "query", schema: { type: "string" } }],
        responses: { 200: ok("OK", page(ref("User"))), ...errors(401, 403) },
      },
    },
    "/api/users/{id}/role": {
      patch: {
        tags: ["Users"],
        summary: "Zmiana roli" + adminOnly,
        parameters: [idParam()],
        requestBody: body({ type: "object", properties: { role: { type: "string", enum: ["USER", "ADMIN"] } } }),
        responses: { 200: ok("OK", ref("User")), ...errors(400, 403, 404, 409) },
      },
    },
    "/api/competitions": {
      get: { tags: ["Competitions"], summary: "Lista rozgrywek", responses: { 200: ok("OK", { type: "array", items: ref("Competition") }) } },
      post: {
        tags: ["Competitions"],
        summary: "Nowe rozgrywki" + adminOnly,
        requestBody: body(ref("CompetitionInput")),
        responses: { 201: ok("Utworzono", ref("Competition")), ...errors(400, 403, 409) },
      },
    },
    "/api/competitions/{id}": {
      get: { tags: ["Competitions"], summary: "Szczegóły", parameters: [idParam()], responses: { 200: ok("OK", ref("Competition")), ...errors(404) } },
      put: {
        tags: ["Competitions"],
        summary: "Edycja" + adminOnly,
        parameters: [idParam()],
        requestBody: body(ref("CompetitionInput")),
        responses: { 200: ok("OK", ref("Competition")), ...errors(400, 403, 404, 409) },
      },
      delete: { tags: ["Competitions"], summary: "Usunięcie" + adminOnly, parameters: [idParam()], responses: { 204: ok("Usunięto"), ...errors(403, 404, 409) } },
    },
    "/api/teams": {
      get: {
        tags: ["Teams"],
        summary: "Lista drużyn (wyszukiwanie po nazwie)",
        parameters: [...pageParams, { name: "q", in: "query", schema: { type: "string" } }],
        responses: { 200: ok("OK", page(ref("Team"))) },
      },
      post: { tags: ["Teams"], summary: "Nowa drużyna" + adminOnly, requestBody: body(ref("TeamInput")), responses: { 201: ok("Utworzono", ref("Team")), ...errors(400, 403) } },
    },
    "/api/teams/{id}": {
      get: { tags: ["Teams"], summary: "Szczegóły", parameters: [idParam()], responses: { 200: ok("OK", ref("Team")), ...errors(404) } },
      put: { tags: ["Teams"], summary: "Edycja" + adminOnly, parameters: [idParam()], requestBody: body(ref("TeamInput")), responses: { 200: ok("OK", ref("Team")), ...errors(400, 403, 404) } },
      delete: { tags: ["Teams"], summary: "Usunięcie" + adminOnly, parameters: [idParam()], responses: { 204: ok("Usunięto"), ...errors(403, 404, 409) } },
    },
    "/api/matches": {
      get: {
        tags: ["Matches"],
        summary: "Terminarz z filtrami i stronicowaniem",
        parameters: [
          ...pageParams,
          { name: "competitionId", in: "query", schema: { type: "array", items: { type: "integer" } }, explode: true },
          { name: "status", in: "query", schema: { type: "string", enum: ["SCHEDULED", "FINISHED", "POSTPONED", "CANCELLED"] } },
          { name: "teamId", in: "query", schema: { type: "integer" } },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
        ],
        responses: { 200: ok("OK", page(ref("Match"))), ...errors(400) },
      },
      post: { tags: ["Matches"], summary: "Nowy mecz" + adminOnly, requestBody: body(ref("MatchInput")), responses: { 201: ok("Utworzono", ref("Match")), ...errors(400, 403, 404, 409) } },
    },
    "/api/matches/{id}": {
      get: { tags: ["Matches"], summary: "Szczegóły meczu", parameters: [idParam()], responses: { 200: ok("OK", ref("Match")), ...errors(404) } },
      put: { tags: ["Matches"], summary: "Edycja" + adminOnly, parameters: [idParam()], requestBody: body(ref("MatchInput")), responses: { 200: ok("OK", ref("Match")), ...errors(400, 403, 404, 409) } },
      delete: { tags: ["Matches"], summary: "Usunięcie" + adminOnly, parameters: [idParam()], responses: { 204: ok("Usunięto"), ...errors(403, 404) } },
    },
    "/api/matches/{id}/result": {
      put: {
        tags: ["Matches"],
        summary: "Wpisanie wyniku" + adminOnly + " – punkty liczą się asynchronicznie",
        parameters: [idParam()],
        requestBody: body(ref("Score")),
        responses: { 200: ok("OK", ref("Match")), ...errors(400, 403, 404, 409) },
      },
    },
    "/api/matches/{id}/status": {
      patch: {
        tags: ["Matches"],
        summary: "Przełożenie / odwołanie" + adminOnly,
        parameters: [idParam()],
        requestBody: body({ type: "object", properties: { status: { type: "string", enum: ["SCHEDULED", "POSTPONED", "CANCELLED"] } } }),
        responses: { 200: ok("OK", ref("Match")), ...errors(400, 403, 404, 409) },
      },
    },
    "/api/leagues": {
      get: { tags: ["Leagues"], summary: "Moje ligi", responses: { 200: ok("OK", { type: "array", items: ref("League") }), ...errors(401) } },
      post: { tags: ["Leagues"], summary: "Nowa liga (zostajesz właścicielem)", requestBody: body(ref("LeagueInput")), responses: { 201: ok("Utworzono", ref("League")), ...errors(400, 404) } },
    },
    "/api/leagues/join": {
      post: {
        tags: ["Leagues"],
        summary: "Dołączenie kodem zaproszenia",
        requestBody: body({ type: "object", properties: { inviteCode: { type: "string", example: "K7M2QX9A" } } }),
        responses: { 200: ok("Dołączono", ref("League")), ...errors(400, 404, 409) },
      },
    },
    "/api/leagues/public": {
      get: {
        tags: ["Leagues"],
        summary: "Ligi publiczne, od największych (wyszukiwanie po nazwie)",
        parameters: [...pageParams, { name: "q", in: "query", schema: { type: "string" } }],
        responses: { 200: ok("OK", page(ref("League"))) },
      },
    },
    "/api/leagues/{id}/join": {
      post: {
        tags: ["Leagues"],
        summary: "Dołączenie do ligi publicznej bez kodu",
        parameters: [idParam()],
        responses: { 200: ok("Dołączono", ref("League")), ...errors(403, 404, 409) },
      },
    },
    "/api/leagues/{id}/bans": {
      get: {
        tags: ["Leagues"],
        summary: "Zbanowani gracze (założyciel / admin)",
        parameters: [idParam()],
        responses: { 200: ok("OK", { type: "array", items: { type: "object" } }), ...errors(403, 404) },
      },
    },
    "/api/leagues/{id}/bans/{userId}": {
      delete: {
        tags: ["Leagues"],
        summary: "Przywrócenie zbanowanego gracza (założyciel / admin)",
        parameters: [idParam(), idParam("userId")],
        responses: { 204: ok("Przywrócono"), ...errors(403, 404) },
      },
    },
    "/api/leagues/{id}": {
      get: { tags: ["Leagues"], summary: "Szczegóły ligi (tylko członkowie)", parameters: [idParam()], responses: { 200: ok("OK", ref("League")), ...errors(403, 404) } },
      put: { tags: ["Leagues"], summary: "Edycja nazwy, opisu i widoczności (założyciel / admin)", parameters: [idParam()], requestBody: body(ref("LeagueUpdate")), responses: { 200: ok("OK", ref("League")), ...errors(400, 403, 404) } },
      delete: { tags: ["Leagues"], summary: "Usunięcie (właściciel)", parameters: [idParam()], responses: { 204: ok("Usunięto"), ...errors(403, 404) } },
    },
    "/api/leagues/{id}/leave": {
      post: { tags: ["Leagues"], summary: "Opuszczenie ligi", parameters: [idParam()], responses: { 204: ok("Opuszczono"), ...errors(403, 409) } },
    },
    "/api/leagues/{id}/invite-code": {
      post: { tags: ["Leagues"], summary: "Nowy kod zaproszenia (właściciel)", parameters: [idParam()], responses: { 200: ok("OK", ref("League")), ...errors(403, 404) } },
    },
    "/api/leagues/{id}/members": {
      get: { tags: ["Leagues"], summary: "Członkowie ligi", parameters: [idParam()], responses: { 200: ok("OK", { type: "array", items: ref("Member") }), ...errors(403, 404) } },
    },
    "/api/leagues/{id}/members/{userId}": {
      delete: { tags: ["Leagues"], summary: "Usunięcie gracza z ligi = ban (założyciel / admin)", parameters: [idParam(), idParam("userId")], responses: { 204: ok("Usunięto"), ...errors(403, 404, 409) } },
    },
    "/api/leagues/{id}/transfer-ownership": {
      post: {
        tags: ["Leagues"],
        summary: "Przekazanie ligi innemu członkowi",
        parameters: [idParam()],
        requestBody: body({ type: "object", properties: { newOwnerId: { type: "integer" } } }),
        responses: { 200: ok("OK", ref("League")), ...errors(403, 404, 409) },
      },
    },
    "/api/leagues/{id}/leaderboard": {
      get: {
        tags: ["Leagues"],
        summary: "Tabela ligi + punkty z 5 ostatnich kolejek (wyszukiwanie po nicku)",
        parameters: [idParam(), ...pageParams, { name: "q", in: "query", schema: { type: "string" } }],
        responses: {
          200: ok("OK", {
            allOf: [
              page(ref("LeaderboardEntry")),
              {
                type: "object",
                properties: {
                  rounds: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { competitionId: { type: "integer" }, competitionName: { type: "string" }, stage: { type: "string" } },
                    },
                  },
                },
              },
            ],
          }),
          ...errors(403, 404),
        },
      },
    },
    "/api/leagues/{leagueId}/rounds": {
      get: {
        tags: ["Predictions"],
        summary: "Kolejki ligi pogrupowane po rozgrywkach + bieżąca kolejka (pierwsza z nierozstrzygniętymi meczami)",
        parameters: [idParam("leagueId")],
        responses: {
          200: ok("OK", {
            type: "array",
            items: {
              type: "object",
              properties: {
                competition: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" } } },
                currentStage: { type: "string" },
                rounds: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      stage: { type: "string", example: "Faza ligowa, 5. kolejka" },
                      startsAt: { type: "string", format: "date-time" },
                      endsAt: { type: "string", format: "date-time" },
                      matches: { type: "integer" },
                      settled: { type: "integer" },
                    },
                  },
                },
              },
            },
          }),
          ...errors(403),
        },
      },
    },
    "/api/leagues/{leagueId}/fixtures": {
      get: {
        tags: ["Predictions"],
        summary: "Terminarz ligi z moimi typami (zwykle jedna kolejka: competitionId + stage)",
        parameters: [
          idParam("leagueId"),
          ...pageParams,
          { name: "competitionId", in: "query", schema: { type: "integer" } },
          { name: "stage", in: "query", schema: { type: "string" }, description: "nazwa kolejki z /rounds; '-' = mecze bez etapu" },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
        ],
        responses: { 200: ok("OK", page(ref("Fixture"))), ...errors(403) },
      },
    },
    "/api/leagues/{leagueId}/matches/{matchId}/prediction": {
      put: {
        tags: ["Predictions"],
        summary: "Dodanie lub zmiana typu (tylko przed rozpoczęciem meczu)",
        parameters: [idParam("leagueId"), idParam("matchId")],
        requestBody: body(ref("Score")),
        responses: { 200: ok("OK", ref("Prediction")), ...errors(400, 403, 404, 409) },
      },
      delete: { tags: ["Predictions"], summary: "Usunięcie typu", parameters: [idParam("leagueId"), idParam("matchId")], responses: { 204: ok("Usunięto"), ...errors(403, 404, 409) } },
    },
    "/api/leagues/{leagueId}/matches/{matchId}/predictions": {
      get: {
        tags: ["Predictions"],
        summary: "Typy członków na mecz (cudze widać dopiero po rozpoczęciu)",
        parameters: [idParam("leagueId"), idParam("matchId")],
        responses: { 200: ok("OK", { type: "array", items: ref("Prediction") }), ...errors(403, 404) },
      },
    },
    "/api/sync": {
      post: {
        tags: ["Sync"],
        summary: "Ręczna synchronizacja meczów i wyników z football-data.org" + adminOnly,
        responses: {
          200: ok("Wynik synchronizacji dla każdych rozgrywek", {
            type: "object",
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    competition: { type: "string" },
                    matches: { type: "integer" },
                    newlyFinished: { type: "integer" },
                    error: { type: "string" },
                  },
                },
              },
            },
          }),
          ...errors(403, 409),
        },
      },
    },
    "/api/sync/status": {
      get: {
        tags: ["Sync"],
        summary: "Stan synchronizacji: czy włączona, kiedy ostatnio i z jakim wynikiem" + adminOnly,
        responses: { 200: ok("OK"), ...errors(403) },
      },
    },
    "/api/leagues/{leagueId}/predictions/copy": {
      post: {
        tags: ["Predictions"],
        summary: "Kopiowanie moich typów z innej ligi",
        parameters: [idParam("leagueId")],
        requestBody: body({ type: "object", required: ["sourceLeagueId"], properties: { sourceLeagueId: { type: "integer" }, overwrite: { type: "boolean", default: false } } }),
        responses: {
          200: ok("OK", { type: "object", properties: { copied: { type: "integer" }, overwritten: { type: "integer" }, skipped: { type: "integer" } } }),
          ...errors(403, 409),
        },
      },
    },
  },
};

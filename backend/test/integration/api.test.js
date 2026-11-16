const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const { parseEnv } = require("node:util");
const { Client } = require("pg");

const { loadConfig } = require("../../src/config");
const { createPool } = require("../../src/db/pool");
const { runMigrations } = require("../../src/db/migrate");
const { seedDemoData } = require("../../src/db/demoData");
const { createApp } = require("../../src/app");
const { EVENTS } = require("../../src/events");

/**
 * Testy integracyjne REST API: prawdziwy serwer HTTP + prawdziwy PostgreSQL.
 * Wymagają działającej bazy z docker-compose (`docker compose up -d db`).
 * Używają osobnej bazy <POSTGRES_DB>_test, tworzonej od zera przy każdym uruchomieniu.
 */

const rootEnvFile = path.join(__dirname, "..", "..", "..", ".env");
const fileEnv = fs.existsSync(rootEnvFile) ? parseEnv(fs.readFileSync(rootEnvFile, "utf8")) : {};
const env = { ...fileEnv, ...process.env };
const TEST_DB = `${env.POSTGRES_DB || "pogwizdek"}_test`;

const config = loadConfig({
  ...env,
  POSTGRES_DB: TEST_DB,
  JWT_SECRET: "test-secret-test-secret-test-secret-123456",
  ADMIN_USERNAME: "admin",
  ADMIN_EMAIL: "admin@test.local",
  ADMIN_PASSWORD: "admin-test-password",
});
const silentLogger = { info() {}, error() {} };

let pool;
let server;
let baseUrl;
let events;

before(async () => {
  // świeża baza testowa
  const admin = new Client({ ...config.db, database: "postgres" });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${TEST_DB}"`);
  await admin.end();

  pool = createPool(config.db);
  await runMigrations(pool, silentLogger);
  await seedDemoData(pool, { logger: silentLogger });

  const created = createApp({ pool, config, logger: silentLogger });
  events = created.events;
  await created.services.usersService.ensureAdmin(config.admin, silentLogger);

  server = created.app.listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server?.close();
  await pool?.end();
});

// ---------- pomocnicze ----------

async function call(method, url, { token, body } = {}) {
  const res = await fetch(baseUrl + url, {
    method,
    headers: {
      ...(body !== undefined && { "Content-Type": "application/json" }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

let counter = 0;
async function newUser() {
  const username = `gracz${Date.now() % 100000}${counter++}`;
  const res = await call("POST", "/auth/register", {
    body: { username, email: `${username}@test.pl`, password: "haslo12345" },
  });
  assert.equal(res.status, 201);
  return res.body.accessToken;
}

async function login(username, password) {
  const res = await call("POST", "/auth/login", { body: { username, password } });
  assert.equal(res.status, 200);
  return res.body.accessToken;
}

// ---------- testy ----------

test("rejestracja, logowanie i odczyt własnego profilu", async () => {
  const reg = await call("POST", "/auth/register", {
    body: { username: "jan_kowalski", email: "jan@test.pl", password: "haslo12345" },
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.user.role, "USER");
  assert.equal(reg.body.user.passwordHash, undefined);

  const token = await login("jan_kowalski", "haslo12345");
  const me = await call("GET", "/users/me", { token });
  assert.equal(me.status, 200);
  assert.equal(me.body.username, "jan_kowalski");

  const wrong = await call("POST", "/auth/login", { body: { username: "jan_kowalski", password: "zlehaslo1" } });
  assert.equal(wrong.status, 401);
});

test("brak tokenu daje 401, błędne dane 400 z listą pól", async () => {
  const noToken = await call("GET", "/leagues");
  assert.equal(noToken.status, 401);
  assert.equal(noToken.body.code, "UNAUTHORIZED");

  const invalid = await call("POST", "/auth/register", { body: { username: "x", email: "zly-email", password: "123" } });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, "VALIDATION_ERROR");
  assert.ok(invalid.body.fieldErrors.email);
  assert.ok(invalid.body.fieldErrors.password);
});

test("tylko ADMIN może dodawać rozgrywki", async () => {
  const userToken = await newUser();
  const competition = { name: "Serie A", code: "SA", season: "2026/27" };

  const asUser = await call("POST", "/competitions", { token: userToken, body: competition });
  assert.equal(asUser.status, 403);

  const adminToken = await login("admin", "admin-test-password");
  const asAdmin = await call("POST", "/competitions", { token: adminToken, body: competition });
  assert.equal(asAdmin.status, 201);
  assert.equal(asAdmin.body.code, "SA");
});

test("liga: dołączanie, typowanie przed meczem, blokada po rozpoczęciu, punkty po wyniku", async () => {
  const owner = await newUser();
  const friend = await newUser();
  const adminToken = await login("admin", "admin-test-password");

  // liga na Ligę Mistrzów (id 1 z danych demo)
  const league = await call("POST", "/leagues", { token: owner, body: { name: "Znajomi", competitionIds: [1] } });
  assert.equal(league.status, 201);
  const leagueId = league.body.id;

  // dołączenie kodem; drugi raz już nie
  const join = await call("POST", "/leagues/join", { token: friend, body: { inviteCode: league.body.inviteCode } });
  assert.equal(join.status, 200);
  const again = await call("POST", "/leagues/join", { token: friend, body: { inviteCode: league.body.inviteCode } });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, "ALREADY_MEMBER");

  // terminarz ligi: mecz otwarty i mecz, który już trwa
  const fixtures = await call("GET", `/leagues/${leagueId}/fixtures?size=50`, { token: friend });
  assert.equal(fixtures.status, 200);
  const open = fixtures.body.content.find((f) => f.canPredict);
  const live = fixtures.body.content.find((f) => f.match.started && f.match.status === "SCHEDULED");
  assert.ok(open && live, "dane demo powinny zawierać mecz otwarty i trwający");

  // typ na otwarty mecz – OK; na trwający – 409
  const ok = await call("PUT", `/leagues/${leagueId}/matches/${open.match.id}/prediction`, {
    token: friend,
    body: { homeScore: 2, awayScore: 1 },
  });
  assert.equal(ok.status, 200);
  const closed = await call("PUT", `/leagues/${leagueId}/matches/${live.match.id}/prediction`, {
    token: friend,
    body: { homeScore: 0, awayScore: 0 },
  });
  assert.equal(closed.status, 409);
  assert.equal(closed.body.code, "PREDICTIONS_CLOSED");

  // przed meczem właściciel nie widzi typu znajomego
  const hidden = await call("GET", `/leagues/${leagueId}/matches/${open.match.id}/predictions`, { token: owner });
  assert.equal(hidden.body.length, 0);

  // właściciel nie może opuścić ligi
  const leave = await call("POST", `/leagues/${leagueId}/leave`, { token: owner });
  assert.equal(leave.status, 409);

  // wynik trwającego meczu -> zdarzenie -> asynchroniczne przeliczenie punktów
  const scored = once(events, EVENTS.PREDICTIONS_SCORED);
  const result = await call("PUT", `/matches/${live.match.id}/result`, {
    token: adminToken,
    body: { homeScore: 1, awayScore: 0 },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.status, "FINISHED");
  await scored;

  const table = await call("GET", `/leagues/${leagueId}/leaderboard`, { token: owner });
  assert.equal(table.status, 200);
  assert.equal(table.body.totalElements, 2);
});

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { createLeaguesService } = require("../../src/modules/leagues/leagues.service");
const { AppError } = require("../../src/common/errors");

// Reguły członkostwa w lidze – repozytorium podmienione na atrapę w pamięci.
const owner = { id: 1, username: "wlasciciel", role: "USER" };
const friend = { id: 2, username: "kumpel", role: "USER" };

let memberships;
let service;

beforeEach(() => {
  memberships = [{ id: 1, leagueId: 5, userId: 1, role: "OWNER" }];
  const league = { id: 5, name: "Znajomi", inviteCode: "ABCD2345", owner: { id: 1, username: "wlasciciel" } };

  service = createLeaguesService({
    competitionsRepository: { countCompetitions: async (ids) => ids.length },
    leaguesRepository: {
      findById: async (id) => (id === 5 ? league : null),
      findIdByInviteCode: async (code) => (code === "ABCD2345" ? 5 : null),
      findMembership: async (leagueId, userId) =>
        memberships.find((m) => m.leagueId === leagueId && m.userId === userId) ?? null,
      insertMembership: async (leagueId, userId, role) =>
        memberships.push({ id: memberships.length + 1, leagueId, userId, role }),
      deleteMembership: async (id) => (memberships = memberships.filter((m) => m.id !== id)),
    },
  });
});

const rejectsWith = (promise, code) => assert.rejects(promise, (err) => err instanceof AppError && err.code === code);

test("dołączenie kodem zaproszenia (wielkość liter i spacje nie mają znaczenia)", async () => {
  const league = await service.join(friend, "  abcd2345 ");
  assert.equal(league.myRole, "MEMBER");
  assert.equal(memberships.length, 2);
});

test("nie można dołączyć do tej samej ligi drugi raz (ALREADY_MEMBER)", async () => {
  await service.join(friend, "ABCD2345");
  await rejectsWith(service.join(friend, "ABCD2345"), "ALREADY_MEMBER");
});

test("zły kod zaproszenia daje 404", async () => {
  await assert.rejects(service.join(friend, "ZZZZZZZZ"), (err) => err.status === 404);
});

test("właściciel nie może opuścić własnej ligi (OWNER_CANNOT_LEAVE)", async () => {
  await rejectsWith(service.leave(owner, 5), "OWNER_CANNOT_LEAVE");
});

test("zwykły członek może opuścić ligę", async () => {
  await service.join(friend, "ABCD2345");
  await service.leave(friend, 5);
  assert.equal(memberships.length, 1);
});

test("kod zaproszenia widzą tylko członkowie", async () => {
  const admin = { id: 9, username: "admin", role: "ADMIN" };
  const asAdmin = await service.get(admin, 5);
  const asOwner = await service.get(owner, 5);
  assert.equal(asAdmin.inviteCode, null);
  assert.equal(asOwner.inviteCode, "ABCD2345");
  await rejectsWith(service.get(friend, 5), "NOT_A_MEMBER");
});

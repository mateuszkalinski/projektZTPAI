const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { createLeaguesService } = require("../../src/modules/leagues/leagues.service");
const { AppError } = require("../../src/common/errors");

// Reguły członkostwa w lidze – repozytorium podmienione na atrapę w pamięci.
const owner = { id: 1, username: "wlasciciel", role: "USER" };
const friend = { id: 2, username: "kumpel", role: "USER" };
const admin = { id: 9, username: "admin", role: "ADMIN" };

let memberships;
let bans;
let leagues;
let service;

beforeEach(() => {
  memberships = [
    { id: 1, leagueId: 5, userId: 1, role: "OWNER" },
    { id: 100, leagueId: 6, userId: 1, role: "OWNER" },
  ];
  bans = new Set();
  leagues = {
    5: { id: 5, name: "Znajomi", isPublic: false, inviteCode: "ABCD2345", owner: { id: 1, username: "wlasciciel" } },
    6: { id: 6, name: "Otwarta", isPublic: true, inviteCode: "PUBL2345", owner: { id: 1, username: "wlasciciel" } },
  };

  const repo = {
    transaction: (fn) => fn(repo),
    findById: async (id) => leagues[id] ?? null,
    findIdByInviteCode: async (code) => Object.values(leagues).find((l) => l.inviteCode === code)?.id ?? null,
    findMembership: async (leagueId, userId) =>
      memberships.find((m) => m.leagueId === leagueId && m.userId === userId) ?? null,
    insertMembership: async (leagueId, userId, role) =>
      memberships.push({ id: memberships.length + 1, leagueId, userId, role }),
    deleteMembership: async (id) => (memberships = memberships.filter((m) => m.id !== id)),
    isBanned: async (leagueId, userId) => bans.has(`${leagueId}:${userId}`),
    insertBan: async (leagueId, userId) => bans.add(`${leagueId}:${userId}`),
    deleteBan: async (leagueId, userId) => bans.delete(`${leagueId}:${userId}`),
  };

  service = createLeaguesService({ leaguesRepository: repo, competitionsRepository: {}, matchesRepository: {} });
});

const rejectsWith = (promise, code) => assert.rejects(promise, (err) => err instanceof AppError && err.code === code);

test("dołączenie kodem zaproszenia (wielkość liter i spacje nie mają znaczenia)", async () => {
  const league = await service.join(friend, "  abcd2345 ");
  assert.equal(league.myRole, "MEMBER");
  assert.equal(memberships.filter((m) => m.leagueId === 5).length, 2);
});

test("nie można dołączyć do tej samej ligi drugi raz (ALREADY_MEMBER)", async () => {
  await service.join(friend, "ABCD2345");
  await rejectsWith(service.join(friend, "ABCD2345"), "ALREADY_MEMBER");
});

test("zły kod zaproszenia daje 404", async () => {
  await assert.rejects(service.join(friend, "ZZZZZZZZ"), (err) => err.status === 404);
});

test("założyciel nie może opuścić własnej ligi (OWNER_CANNOT_LEAVE)", async () => {
  await rejectsWith(service.leave(owner, 5), "OWNER_CANNOT_LEAVE");
});

test("zwykły członek może opuścić ligę", async () => {
  await service.join(friend, "ABCD2345");
  await service.leave(friend, 5);
  assert.equal(memberships.filter((m) => m.leagueId === 5).length, 1);
});

test("kod zaproszenia widzą tylko członkowie", async () => {
  const asAdmin = await service.get(admin, 5);
  const asOwner = await service.get(owner, 5);
  assert.equal(asAdmin.inviteCode, null);
  assert.equal(asOwner.inviteCode, "ABCD2345");
  await rejectsWith(service.get(friend, 5), "NOT_A_MEMBER");
});

test("usunięty z ligi gracz (ban) nie wróci kodem, dopóki nie zostanie przywrócony", async () => {
  await service.join(friend, "ABCD2345");
  await service.banMember(owner, 5, friend.id);
  assert.equal(memberships.filter((m) => m.leagueId === 5).length, 1);
  await rejectsWith(service.join(friend, "ABCD2345"), "BANNED");

  await service.unban(owner, 5, friend.id);
  const back = await service.join(friend, "ABCD2345");
  assert.equal(back.myRole, "MEMBER");
});

test("zwykły członek nie może banować, a założyciela nie da się zbanować", async () => {
  await service.join(friend, "ABCD2345");
  await rejectsWith(service.banMember(friend, 5, owner.id), "NOT_OWNER");
  await rejectsWith(service.banMember(admin, 5, owner.id), "CANNOT_REMOVE_OWNER");
});

test("do ligi publicznej dołącza się bez kodu, do prywatnej nie", async () => {
  const joined = await service.joinPublic(friend, 6);
  assert.equal(joined.myRole, "MEMBER");
  await rejectsWith(service.joinPublic(friend, 5), "LEAGUE_PRIVATE");
});

test("ban obowiązuje też w lidze publicznej", async () => {
  await service.joinPublic(friend, 6);
  await service.banMember(owner, 6, friend.id);
  await rejectsWith(service.joinPublic(friend, 6), "BANNED");
});

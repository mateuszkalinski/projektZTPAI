const crypto = require("node:crypto");
const { conflict, forbidden, notFound } = require("../../common/errors");
const { toPage } = require("../../common/validation");

// bez 0/O i 1/I/L, żeby kod łatwo było przepisać z telefonu
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

function randomInviteCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

const notMember = () => forbidden("NOT_A_MEMBER", "Nie należysz do tej ligi");
const notOwner = () => forbidden("NOT_OWNER", "Tylko właściciel ligi może to zrobić");
const isAdmin = (user) => user.role === "ADMIN";

function createLeaguesService({ leaguesRepository: repo, competitionsRepository, generateCode = randomInviteCode }) {
  async function getLeague(id) {
    const league = await repo.findById(id);
    if (!league) throw notFound(`Liga o id ${id} nie istnieje`);
    return league;
  }

  // kod zaproszenia widzą tylko członkowie ligi
  function present(league, myRole) {
    return { ...league, inviteCode: myRole ? league.inviteCode : null, myRole: myRole ?? null };
  }

  async function requireMember(leagueId, userId) {
    const membership = await repo.findMembership(leagueId, userId);
    if (!membership) throw notMember();
    return membership;
  }

  async function requireMemberOrAdmin(leagueId, user) {
    if (!(await repo.exists(leagueId))) throw notFound(`Liga o id ${leagueId} nie istnieje`);
    if (isAdmin(user)) return;
    await requireMember(leagueId, user.id);
  }

  async function requireOwnerOrAdmin(leagueId, user) {
    const membership = await repo.findMembership(leagueId, user.id);
    if (membership?.role !== "OWNER" && !isAdmin(user)) throw notOwner();
    return membership?.role ?? null;
  }

  async function checkCompetitions(ids) {
    if ((await competitionsRepository.countCompetitions(ids)) !== ids.length) {
      throw notFound("Co najmniej jedne z podanych rozgrywek nie istnieją");
    }
  }

  async function newInviteCode() {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = generateCode();
      if (!(await repo.existsInviteCode(code))) return code;
    }
    throw new Error("Nie udało się wygenerować unikalnego kodu zaproszenia");
  }

  return {
    getLeague,
    requireMember,

    myLeagues: (user) => repo.listForUser(user.id),

    async get(user, leagueId) {
      const league = await getLeague(leagueId);
      const membership = await repo.findMembership(leagueId, user.id);
      if (!membership && !isAdmin(user)) throw notMember();
      return present(league, membership?.role);
    },

    async create(user, { name, description, competitionIds }) {
      await checkCompetitions(competitionIds);
      const inviteCode = await newInviteCode();
      // liga + powiązania z rozgrywkami + członkostwo właściciela – wszystko albo nic
      const id = await repo.transaction(async (tx) => {
        const leagueId = await tx.insert({ name, description, inviteCode, ownerId: user.id });
        await tx.setCompetitions(leagueId, competitionIds);
        await tx.insertMembership(leagueId, user.id, "OWNER");
        return leagueId;
      });
      return present(await getLeague(id), "OWNER");
    },

    async update(user, leagueId, { name, description, competitionIds }) {
      await getLeague(leagueId);
      const myRole = await requireOwnerOrAdmin(leagueId, user);
      await checkCompetitions(competitionIds);
      await repo.transaction(async (tx) => {
        await tx.update(leagueId, { name, description });
        await tx.setCompetitions(leagueId, competitionIds);
      });
      return present(await getLeague(leagueId), myRole);
    },

    async remove(user, leagueId) {
      await getLeague(leagueId);
      await requireOwnerOrAdmin(leagueId, user);
      await repo.delete(leagueId);
    },

    async regenerateInviteCode(user, leagueId) {
      await getLeague(leagueId);
      const myRole = await requireOwnerOrAdmin(leagueId, user);
      await repo.setInviteCode(leagueId, await newInviteCode());
      return present(await getLeague(leagueId), myRole);
    },

    /** Reguła: do ligi dołącza się wyłącznie kodem zaproszenia i tylko raz. */
    async join(user, inviteCode) {
      const leagueId = await repo.findIdByInviteCode(inviteCode.trim().toUpperCase());
      if (!leagueId) throw notFound("Nie znaleziono ligi o takim kodzie zaproszenia");
      if (await repo.findMembership(leagueId, user.id)) {
        throw conflict("ALREADY_MEMBER", "Należysz już do tej ligi");
      }
      await repo.insertMembership(leagueId, user.id, "MEMBER");
      return present(await getLeague(leagueId), "MEMBER");
    },

    /** Reguła: właściciel nie może opuścić ligi – najpierw ją przekazuje albo usuwa. */
    async leave(user, leagueId) {
      const membership = await requireMember(leagueId, user.id);
      if (membership.role === "OWNER") {
        throw conflict("OWNER_CANNOT_LEAVE", "Właściciel nie może opuścić ligi. Przekaż ją innemu członkowi albo usuń ligę.");
      }
      await repo.deleteMembership(membership.id);
    },

    async members(user, leagueId) {
      await requireMemberOrAdmin(leagueId, user);
      return repo.listMembers(leagueId);
    },

    async removeMember(user, leagueId, userId) {
      await requireOwnerOrAdmin(leagueId, user);
      const target = await repo.findMembership(leagueId, userId);
      if (!target) throw notFound("Ten użytkownik nie należy do ligi");
      if (target.role === "OWNER") throw conflict("CANNOT_REMOVE_OWNER", "Nie można usunąć właściciela ligi");
      await repo.deleteMembership(target.id);
    },

    async transferOwnership(user, leagueId, newOwnerId) {
      const league = await getLeague(leagueId);
      if (league.owner.id !== user.id && !isAdmin(user)) throw notOwner();
      if (newOwnerId === league.owner.id) throw conflict("ALREADY_OWNER", "Ten użytkownik jest już właścicielem");
      const next = await repo.findMembership(leagueId, newOwnerId);
      if (!next) throw conflict("NOT_A_MEMBER", "Ligę można przekazać tylko jej członkowi");
      const current = await repo.findMembership(leagueId, league.owner.id);

      await repo.transaction(async (tx) => {
        await tx.setMembershipRole(current.id, "MEMBER");
        await tx.setMembershipRole(next.id, "OWNER");
        await tx.setOwner(leagueId, newOwnerId);
      });
      const mine = await repo.findMembership(leagueId, user.id);
      return present(await getLeague(leagueId), mine?.role);
    },

    async leaderboard(user, leagueId, { page, size }) {
      await requireMemberOrAdmin(leagueId, user);
      const { rows, total } = await repo.leaderboard(leagueId, { page, size });
      const content = rows.map((row, i) => ({ position: page * size + i + 1, ...row }));
      return toPage(content, total, { page, size });
    },
  };
}

module.exports = { createLeaguesService, randomInviteCode };

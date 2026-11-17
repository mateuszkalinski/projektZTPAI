const crypto = require("node:crypto");
const { conflict, forbidden, notFound } = require("../../common/errors");
const { toPage } = require("../../common/validation");

// bez 0/O i 1/I/L, żeby kod łatwo było przepisać z telefonu
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
// ile ostatnich kolejek pokazujemy w pełnej tabeli
const RECENT_ROUNDS = 5;

function randomInviteCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

const notMember = () => forbidden("NOT_A_MEMBER", "Nie należysz do tej ligi");
const notOwner = () => forbidden("NOT_OWNER", "Tylko założyciel ligi albo administrator może to zrobić");
const banned = () => forbidden("BANNED", "Zostałeś usunięty z tej ligi i nie możesz do niej dołączyć");
const isAdmin = (user) => user.role === "ADMIN";

function createLeaguesService({
  leaguesRepository: repo,
  competitionsRepository,
  matchesRepository,
  generateCode = randomInviteCode,
}) {
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

  /** Wspólne reguły dołączania: zbanowany nie wróci, a do tej samej ligi dołącza się raz. */
  async function addMember(user, leagueId) {
    if (await repo.isBanned(leagueId, user.id)) throw banned();
    if (await repo.findMembership(leagueId, user.id)) throw conflict("ALREADY_MEMBER", "Należysz już do tej ligi");
    await repo.insertMembership(leagueId, user.id, "MEMBER");
    return present(await getLeague(leagueId), "MEMBER");
  }

  return {
    getLeague,
    requireMember,

    myLeagues: (user) => repo.listForUser(user.id),

    async publicLeagues(user, { q, page, size }) {
      const { rows, total } = await repo.findPublicPage({ q, page, size, userId: user.id });
      return toPage(rows, total, { page, size });
    },

    async get(user, leagueId) {
      const league = await getLeague(leagueId);
      const membership = await repo.findMembership(leagueId, user.id);
      if (!membership && !isAdmin(user)) throw notMember();
      return present(league, membership?.role);
    },

    async create(user, { name, description, isPublic = false, competitionIds }) {
      await checkCompetitions(competitionIds);
      const inviteCode = await newInviteCode();
      // liga + powiązania z rozgrywkami + członkostwo założyciela – wszystko albo nic
      const id = await repo.transaction(async (tx) => {
        const leagueId = await tx.insert({ name, description, isPublic, inviteCode, ownerId: user.id });
        await tx.setCompetitions(leagueId, competitionIds);
        await tx.insertMembership(leagueId, user.id, "OWNER");
        return leagueId;
      });
      return present(await getLeague(id), "OWNER");
    },

    /** Edycja nazwy, opisu i widoczności. Rozgrywek nie zmieniamy, żeby tabela nie traciła sensu w trakcie sezonu. */
    async update(user, leagueId, { name, description, isPublic = false }) {
      await getLeague(leagueId);
      const myRole = await requireOwnerOrAdmin(leagueId, user);
      await repo.update(leagueId, { name, description, isPublic });
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

    /** Reguła: do ligi prywatnej dołącza się wyłącznie kodem zaproszenia. */
    async join(user, inviteCode) {
      const leagueId = await repo.findIdByInviteCode(inviteCode.trim().toUpperCase());
      if (!leagueId) throw notFound("Nie znaleziono ligi o takim kodzie zaproszenia");
      return addMember(user, leagueId);
    },

    /** Do ligi publicznej można dołączyć bez kodu, prosto z listy lig publicznych. */
    async joinPublic(user, leagueId) {
      const league = await getLeague(leagueId);
      if (!league.isPublic) {
        throw forbidden("LEAGUE_PRIVATE", "To liga prywatna – dołączyć można tylko kodem zaproszenia");
      }
      return addMember(user, leagueId);
    },

    /** Reguła: założyciel nie może opuścić ligi – najpierw ją przekazuje albo usuwa. */
    async leave(user, leagueId) {
      const membership = await requireMember(leagueId, user.id);
      if (membership.role === "OWNER") {
        throw conflict("OWNER_CANNOT_LEAVE", "Założyciel nie może opuścić ligi. Przekaż ją innemu graczowi albo usuń ligę.");
      }
      await repo.deleteMembership(membership.id);
    },

    async members(user, leagueId) {
      await requireMemberOrAdmin(leagueId, user);
      return repo.listMembers(leagueId);
    },

    /** Usunięcie gracza z ligi = ban: nie wróci ani kodem, ani z listy lig publicznych. */
    async banMember(user, leagueId, userId) {
      await getLeague(leagueId);
      await requireOwnerOrAdmin(leagueId, user);
      if (userId === user.id) throw conflict("CANNOT_BAN_SELF", "Nie możesz usunąć z ligi samego siebie");
      const target = await repo.findMembership(leagueId, userId);
      if (!target) throw notFound("Ten gracz nie należy do ligi");
      if (target.role === "OWNER") throw conflict("CANNOT_REMOVE_OWNER", "Nie można usunąć założyciela ligi");
      await repo.transaction(async (tx) => {
        await tx.deleteMembership(target.id);
        await tx.insertBan(leagueId, userId, user.id);
      });
    },

    async bans(user, leagueId) {
      await getLeague(leagueId);
      await requireOwnerOrAdmin(leagueId, user);
      return repo.listBans(leagueId);
    },

    /** Przywrócenie gracza – może znowu dołączyć (kodem albo z listy publicznych). */
    async unban(user, leagueId, userId) {
      await getLeague(leagueId);
      await requireOwnerOrAdmin(leagueId, user);
      if (!(await repo.deleteBan(leagueId, userId))) throw notFound("Ten gracz nie jest zbanowany w tej lidze");
    },

    async transferOwnership(user, leagueId, newOwnerId) {
      const league = await getLeague(leagueId);
      if (league.owner.id !== user.id && !isAdmin(user)) throw notOwner();
      if (newOwnerId === league.owner.id) throw conflict("ALREADY_OWNER", "Ten gracz jest już założycielem");
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

    /**
     * Tabela ligi (z wyszukiwaniem po nicku) + punkty każdego gracza w ostatnich kolejkach z wynikami.
     * Kolejki z różnych rozgrywek (np. LM i Premier League) idą w kolejności rozgrywania.
     */
    async leaderboard(user, leagueId, { q, page, size }) {
      await requireMemberOrAdmin(leagueId, user);
      const { rows, total } = await repo.standings(leagueId, { q, page, size });

      const competitionIds = await repo.competitionIds(leagueId);
      const rounds = (await matchesRepository.listRounds(competitionIds))
        .filter((r) => r.finished > 0)
        .slice(-RECENT_ROUNDS)
        .map(({ competitionId, competitionName, stage }) => ({ competitionId, competitionName, stage }));

      const points = await repo.roundPoints(leagueId, rows.map((r) => r.userId), rounds);
      const key = (userId, competitionId, stage) => `${userId}|${competitionId}|${stage}`;
      const byKey = new Map(points.map((p) => [key(p.userId, p.competitionId, p.stage), p.points]));

      const content = rows.map((row) => ({
        ...row,
        roundPoints: rounds.map((r) => byKey.get(key(row.userId, r.competitionId, r.stage)) ?? null),
      }));
      return { ...toPage(content, total, { page, size }), rounds };
    },
  };
}

module.exports = { createLeaguesService, randomInviteCode };

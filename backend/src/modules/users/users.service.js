const { conflict, notFound } = require("../../common/errors");
const { toPage } = require("../../common/validation");
const { hashPassword } = require("../../common/password");

function createUsersService({ usersRepository }) {
  return {
    async get(id) {
      const user = await usersRepository.findById(id);
      if (!user) throw notFound(`Użytkownik o id ${id} nie istnieje`);
      return user;
    },

    async list({ q, page, size }) {
      const { rows, total } = await usersRepository.findPage({ q, page, size });
      return toPage(rows, total, { page, size });
    },

    async changeRole(actor, userId, role) {
      if (actor.id === userId && role !== "ADMIN") {
        throw conflict("CANNOT_DEMOTE_SELF", "Nie możesz odebrać sobie roli administratora");
      }
      const user = await usersRepository.updateRole(userId, role);
      if (!user) throw notFound(`Użytkownik o id ${userId} nie istnieje`);
      return user;
    },

    // Konto admina tworzone z ustawień ADMIN_* (.env).
    async ensureAdmin({ username, email, password }, logger = console) {
      if (!username || !email || !password) return false;
      if (await usersRepository.existsUsername(username)) return false;
      await usersRepository.insert({
        username,
        email: email.toLowerCase(),
        passwordHash: await hashPassword(password),
        role: "ADMIN",
      });
      logger.info(`[admin] utworzono konto administratora "${username}"`);
      return true;
    },
  };
}

module.exports = { createUsersService };

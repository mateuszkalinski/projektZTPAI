const jwt = require("jsonwebtoken");
const { conflict, unauthorized } = require("../../common/errors");
const { hashPassword, verifyPassword } = require("../../common/password");

function createAuthService({ usersRepository, jwtSecret, jwtExpiresIn }) {
  function issueToken(user) {
    const accessToken = jwt.sign({ sub: String(user.id), username: user.username, role: user.role }, jwtSecret, {
      expiresIn: jwtExpiresIn,
    });
    const { iat, exp } = jwt.decode(accessToken);
    const { passwordHash, ...publicUser } = user; // eslint-disable-line no-unused-vars
    return { accessToken, tokenType: "Bearer", expiresIn: exp - iat, user: publicUser };
  }

  return {
    async register({ username, email, password }) {
      if (await usersRepository.existsUsername(username)) {
        throw conflict("USERNAME_TAKEN", "Nazwa użytkownika jest już zajęta");
      }
      if (await usersRepository.existsEmail(email)) {
        throw conflict("EMAIL_TAKEN", "Konto z tym adresem e-mail już istnieje");
      }
      const user = await usersRepository.insert({
        username,
        email: email.toLowerCase(),
        passwordHash: await hashPassword(password),
      });
      return issueToken(user);
    },

    async login({ username, password }) {
      const user = await usersRepository.findForLogin(username);
      // ten sam komunikat dla złego loginu i złego hasła – nie zdradzamy, które konta istnieją
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        throw unauthorized("Nieprawidłowy login lub hasło");
      }
      return issueToken(user);
    },
  };
}

module.exports = { createAuthService };

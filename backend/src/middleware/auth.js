const jwt = require("jsonwebtoken");
const { unauthorized, forbidden } = require("../common/errors");

// Sprawdza nagłówek "Authorization: Bearer <token>" i ustawia req.user.
// Użytkownik jest doczytywany z bazy, więc zmiana roli albo usunięcie konta działa od razu.
function authenticate({ jwtSecret, usersRepository }) {
  return async (req, res, next) => {
    const header = req.get("authorization") || "";
    if (!header.startsWith("Bearer ")) throw unauthorized();

    let payload;
    try {
      payload = jwt.verify(header.slice("Bearer ".length), jwtSecret);
    } catch {
      throw unauthorized("Token jest nieprawidłowy albo wygasł");
    }

    const user = await usersRepository.findById(Number(payload.sub));
    if (!user) throw unauthorized();
    req.user = user;
    next();
  };
}

// Ograniczenie endpointu do roli globalnej, np. requireRole("ADMIN")
function requireRole(role) {
  return (req, res, next) => (req.user?.role === role ? next() : next(forbidden()));
}

module.exports = { authenticate, requireRole };

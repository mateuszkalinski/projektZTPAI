// Publiczne kolumny użytkownika – hash hasła nigdy nie wychodzi poza repozytorium (poza logowaniem).
const COLUMNS = `id, username, email, role, created_at AS "createdAt"`;

function createUsersRepository(db) {
  return {
    async findById(id) {
      const { rows } = await db.query(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
      return rows[0] ?? null;
    },

    async findForLogin(username) {
      const { rows } = await db.query(
        `SELECT ${COLUMNS}, password_hash AS "passwordHash" FROM users WHERE lower(username) = lower($1)`,
        [username]
      );
      return rows[0] ?? null;
    },

    async existsUsername(username) {
      const { rowCount } = await db.query("SELECT 1 FROM users WHERE lower(username) = lower($1)", [username]);
      return rowCount > 0;
    },

    async existsEmail(email) {
      const { rowCount } = await db.query("SELECT 1 FROM users WHERE lower(email) = lower($1)", [email]);
      return rowCount > 0;
    },

    async insert({ username, email, passwordHash, role = "USER" }) {
      const { rows } = await db.query(
        `INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
        [username, email, passwordHash, role]
      );
      return rows[0];
    },

    async findPage({ q, page, size }) {
      const where = q ? "WHERE username ILIKE $1" : "";
      const params = q ? [`%${q}%`] : [];
      const total = (await db.query(`SELECT count(*) AS count FROM users ${where}`, params)).rows[0].count;
      const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM users ${where} ORDER BY username
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, size, page * size]
      );
      return { rows, total };
    },

    async updateRole(id, role) {
      const { rows } = await db.query(`UPDATE users SET role = $2 WHERE id = $1 RETURNING ${COLUMNS}`, [id, role]);
      return rows[0] ?? null;
    },
  };
}

module.exports = { createUsersRepository };

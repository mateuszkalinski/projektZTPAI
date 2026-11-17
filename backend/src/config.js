const fs = require("node:fs");
const path = require("node:path");

// Lokalnie czytamy plik .env z katalogu głównego projektu (albo z backend/).
// W Dockerze zmienne przychodzą z docker-compose, pliku .env w obrazie nie ma.
function loadEnvFile() {
  if (process.env.NODE_ENV === "test") return;
  const candidates = [path.join(__dirname, "..", "..", ".env"), path.join(__dirname, "..", ".env")];
  const file = candidates.find((p) => fs.existsSync(p));
  if (file) process.loadEnvFile(file);
}

// Jedyne miejsce w aplikacji, które czyta process.env.
function loadConfig(env = process.env) {
  const errors = [];
  const required = (key) => {
    if (!env[key]) errors.push(`${key} jest wymagane`);
    return env[key];
  };

  const config = {
    env: env.NODE_ENV || "development",
    port: Number(env.PORT || 8080),
    db: {
      host: env.DB_HOST || "localhost",
      port: Number(env.DB_PORT || 5432),
      database: required("POSTGRES_DB"),
      user: required("POSTGRES_USER"),
      password: required("POSTGRES_PASSWORD"),
    },
    jwtSecret: required("JWT_SECRET"),
    jwtExpiresIn: env.JWT_EXPIRES_IN || "24h",
    admin: {
      username: env.ADMIN_USERNAME || "",
      email: env.ADMIN_EMAIL || "",
      password: env.ADMIN_PASSWORD || "",
    },
    loadDemoData: (env.LOAD_DEMO_DATA ?? "true") === "true",
    footballData: {
      // bez tokenu synchronizacja jest wyłączona, a aplikacja działa na danych demo
      token: env.FOOTBALL_DATA_TOKEN || "",
      competitions: (env.FOOTBALL_DATA_COMPETITIONS || "CL,PL")
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean),
      intervalMinutes: Number(env.FOOTBALL_DATA_INTERVAL_MINUTES || 10),
    },
  };

  if (config.jwtSecret && config.jwtSecret.length < 32) {
    errors.push("JWT_SECRET musi mieć co najmniej 32 znaki");
  }
  if (errors.length) {
    throw new Error(`Błędna konfiguracja (.env): ${errors.join("; ")}`);
  }
  return Object.freeze(config);
}

module.exports = { loadEnvFile, loadConfig };

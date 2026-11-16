const { randomUUID } = require("node:crypto");

// Każdy request dostaje id (nagłówek X-Request-Id) i jest logowany z czasem trwania.
function requestLogger(logger = console) {
  return (req, res, next) => {
    req.id = req.get("x-request-id") || randomUUID();
    res.set("X-Request-Id", req.id);
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      logger.info(`[${req.id}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms.toFixed(1)} ms)`);
    });
    next();
  };
}

module.exports = { requestLogger };

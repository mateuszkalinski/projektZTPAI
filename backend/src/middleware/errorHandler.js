const { AppError } = require("../common/errors");

function errorBody(req, status, code, message, fieldErrors) {
  const body = { timestamp: new Date().toISOString(), status, code, message, path: req.originalUrl };
  if (fieldErrors) body.fieldErrors = fieldErrors;
  return body;
}

// Nieznany adres -> 404 w tym samym formacie co reszta błędów
function notFoundHandler(req, res) {
  res.status(404).json(errorBody(req, 404, "NOT_FOUND", "Nie ma takiego endpointu"));
}

// Globalna obsługa błędów – zawsze na końcu łańcucha middleware.
function errorHandler(logger = console) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json(errorBody(req, err.status, err.code, err.message, err.fieldErrors));
    }
    // niepoprawny JSON w body
    if (err.type === "entity.parse.failed") {
      return res.status(400).json(errorBody(req, 400, "BAD_REQUEST", "Nieczytelny JSON w treści żądania"));
    }
    // ograniczenia bazy danych: UNIQUE (23505), klucz obcy (23503)
    if (err.code === "23505" || err.code === "23503") {
      return res.status(409).json(errorBody(req, 409, "DATA_CONFLICT", "Operacja narusza spójność danych"));
    }

    logger.error(`[${req.id}] Nieobsłużony błąd`, err);
    res.status(500).json(errorBody(req, 500, "INTERNAL_ERROR", "Wewnętrzny błąd serwera"));
  };
}

module.exports = { notFoundHandler, errorHandler };

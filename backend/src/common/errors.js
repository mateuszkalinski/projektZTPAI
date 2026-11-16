// Zamiast pisać wszędzie res.status(...), w kodzie rzucamy błąd z odpowiednim statusem.
// Globalny errorHandler zamienia go na jednolitą odpowiedź JSON.
class AppError extends Error {
  constructor(status, code, message, fieldErrors) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

const validationError = (fieldErrors) =>
  new AppError(400, "VALIDATION_ERROR", "Niepoprawne dane wejściowe", fieldErrors);
const unauthorized = (message = "Wymagane zalogowanie") => new AppError(401, "UNAUTHORIZED", message);
const forbidden = (code = "FORBIDDEN", message = "Brak uprawnień do tego zasobu") => new AppError(403, code, message);
const notFound = (message) => new AppError(404, "NOT_FOUND", message);
// naruszenie reguły biznesowej, np. typowanie po rozpoczęciu meczu
const conflict = (code, message) => new AppError(409, code, message);

module.exports = { AppError, validationError, unauthorized, forbidden, notFound, conflict };

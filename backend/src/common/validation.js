const { validationError } = require("./errors");

// Walidacja danych wejściowych.
// Schemat to obiekt { pole: reguła }, np. { name: { type: "string", required: true, max: 100 } }.
// Obsługiwane typy: string, email, int, boolean, enum, date, intArray.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseField(rule, raw, coerce) {
  if (raw === undefined || raw === null || raw === "") {
    return rule.required ? { error: "pole wymagane" } : { value: rule.default };
  }

  switch (rule.type) {
    case "string":
    case "email": {
      if (typeof raw !== "string") return { error: "musi być tekstem" };
      const v = rule.trim === false ? raw : raw.trim(); // hasła nie przycinamy
      if (rule.min && v.length < rule.min) return { error: `min. ${rule.min} znaki` };
      if (rule.max && v.length > rule.max) return { error: `maks. ${rule.max} znaków` };
      if (rule.type === "email" && !EMAIL.test(v)) return { error: "niepoprawny adres e-mail" };
      if (rule.pattern && !rule.pattern.test(v)) return { error: rule.patternMessage || "niepoprawny format" };
      return { value: v };
    }
    case "int": {
      const n = coerce && typeof raw === "string" ? Number(raw) : raw;
      if (!Number.isInteger(n)) return { error: "musi być liczbą całkowitą" };
      if (rule.min !== undefined && n < rule.min) return { error: `min. ${rule.min}` };
      if (rule.max !== undefined && n > rule.max) return { error: `maks. ${rule.max}` };
      return { value: n };
    }
    case "boolean": {
      const b = coerce && typeof raw === "string" ? { true: true, false: false }[raw] : raw;
      if (typeof b !== "boolean") return { error: "musi być true albo false" };
      return { value: b };
    }
    case "enum":
      if (!rule.values.includes(raw)) return { error: `dozwolone: ${rule.values.join(", ")}` };
      return { value: raw };
    case "date": {
      const d = new Date(raw);
      if (typeof raw !== "string" || Number.isNaN(d.getTime())) return { error: "niepoprawna data (ISO 8601)" };
      return { value: d };
    }
    case "intArray": {
      const list = [].concat(raw).map((x) => (coerce && typeof x === "string" ? Number(x) : x));
      if (!list.every((x) => Number.isInteger(x) && x > 0)) return { error: "musi być listą identyfikatorów" };
      if (rule.min && list.length < rule.min) return { error: rule.minMessage || `min. ${rule.min} element(y)` };
      return { value: [...new Set(list)] };
    }
    default:
      throw new Error(`Nieznany typ walidacji: ${rule.type}`);
  }
}

function validate(schema, input, { coerce = false, strict = false } = {}) {
  const value = {};
  const errors = {};
  for (const [key, rule] of Object.entries(schema)) {
    const result = parseField(rule, input[key], coerce);
    if (result.error) errors[key] = result.error;
    else if (result.value !== undefined) value[key] = result.value;
  }
  if (strict) {
    for (const key of Object.keys(input)) if (!(key in schema)) errors[key] = "nieznane pole";
  }
  return { value, errors };
}

// Middleware: waliduje body i podmienia je na oczyszczone wartości.
function body(schema) {
  return (req, res, next) => {
    const input = req.body ?? {};
    if (typeof input !== "object" || Array.isArray(input)) {
      return next(validationError({ body: "oczekiwano obiektu JSON" }));
    }
    const { value, errors } = validate(schema, input, { strict: true });
    if (Object.keys(errors).length) return next(validationError(errors));
    req.body = value;
    next();
  };
}

// Middleware: waliduje query string (wartości to tekst, więc zamieniamy je na liczby/daty).
// W Express 5 req.query jest tylko do odczytu, dlatego wynik trafia do req.validQuery.
function query(schema) {
  return (req, res, next) => {
    const { value, errors } = validate(schema, req.query ?? {}, { coerce: true });
    if (Object.keys(errors).length) return next(validationError(errors));
    req.validQuery = value;
    next();
  };
}

// Id z adresu, np. /api/leagues/5 -> 5
function parseId(raw, name = "id") {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw validationError({ [name]: "niepoprawny identyfikator" });
  return id;
}

// Wspólne parametry stronicowania: ?page=0&size=20
const pageQuery = {
  page: { type: "int", min: 0, default: 0 },
  size: { type: "int", min: 1, max: 100, default: 20 },
};

function toPage(content, total, { page, size }) {
  return { content, page, size, totalElements: total, totalPages: Math.ceil(total / size) };
}

module.exports = { validate, body, query, parseId, pageQuery, toPage };

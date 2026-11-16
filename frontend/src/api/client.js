// Cienka warstwa nad fetch: dokleja token JWT, parsuje JSON i zamienia błędy API na ApiError.

const TOKEN_KEY = 'pogwizdek.token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // brak dostępu do localStorage – token zostanie tylko w pamięci
  }
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || `Błąd ${status}`)
    this.status = status
    this.code = body?.code
    this.fieldErrors = body?.fieldErrors || {}
  }
}

let onUnauthorized = () => {}
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

export async function api(path, { method = 'GET', body, query } = {}) {
  const url = new URL(`/api${path}`, window.location.origin)
  if (query) {
    Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .forEach(([k, v]) => url.searchParams.append(k, v))
  }

  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  } catch {
    throw new ApiError(0, { message: 'Brak połączenia z serwerem' })
  }

  if (response.status === 204) return null
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401 && token) onUnauthorized()
    throw new ApiError(response.status, data)
  }
  return data
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, getToken, setToken, setUnauthorizedHandler } from '../api/client.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(getToken()))

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  // wygasły token -> wyloguj
  useEffect(() => setUnauthorizedHandler(logout), [logout])

  // po odświeżeniu strony odtwarzamy użytkownika z tokenu
  useEffect(() => {
    if (!getToken()) return
    api('/users/me')
      .then(setUser)
      .catch(logout)
      .finally(() => setLoading(false))
  }, [logout])

  const handleAuth = useCallback((response) => {
    setToken(response.accessToken)
    setUser(response.user)
    return response.user
  }, [])

  const login = useCallback(
    (username, password) => api('/auth/login', { method: 'POST', body: { username, password } }).then(handleAuth),
    [handleAuth],
  )

  const register = useCallback(
    (form) => api('/auth/register', { method: 'POST', body: form }).then(handleAuth),
    [handleAuth],
  )

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

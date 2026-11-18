import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext.jsx'
import ErrorMessage from '../components/ErrorMessage.jsx'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(form.username, form.password)
      navigate(location.state?.from?.pathname || '/leagues', { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="frame narrow stack">
      <h1>Logowanie</h1>
      <form onSubmit={onSubmit} className="stack">
        <label>
          Login
          <input value={form.username} autoComplete="username" required
                 onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </label>
        <label>
          Hasło
          <input type="password" value={form.password} autoComplete="current-password" required
                 onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        <ErrorMessage error={error} />
        <button disabled={busy}>{busy ? 'Logowanie…' : 'Zaloguj'}</button>
      </form>
      <p className="muted">Nie masz konta? <Link to="/register">Załóż je</Link></p>
    </section>
  )
}

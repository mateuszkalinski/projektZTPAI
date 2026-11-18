import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext.jsx'
import ErrorMessage from '../components/ErrorMessage.jsx'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  async function onSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await register(form)
      navigate('/leagues', { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="frame narrow stack">
      <h1>Załóż konto</h1>
      <form onSubmit={onSubmit} className="stack">
        <label>
          Login
          <input value={form.username} onChange={set('username')} autoComplete="username" required minLength={3} />
        </label>
        <label>
          E-mail
          <input type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
        </label>
        <label>
          Hasło (min. 8 znaków)
          <input type="password" value={form.password} onChange={set('password')}
                 autoComplete="new-password" required minLength={8} />
        </label>
        <ErrorMessage error={error} />
        <button disabled={busy}>{busy ? 'Zakładanie…' : 'Załóż konto'}</button>
      </form>
      <p className="muted">Masz już konto? <Link to="/login">Zaloguj się</Link></p>
    </section>
  )
}

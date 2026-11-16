import { Link, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthContext.jsx'

export default function Layout() {
  const { user, logout } = useAuth()

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">Pogwizdek</Link>
        <nav>
          {user ? (
            <>
              <Link to="/leagues">Moje ligi</Link>
              <span className="muted">{user.username}{user.role === 'ADMIN' ? ' (admin)' : ''}</span>
              <button className="link" onClick={logout}>Wyloguj</button>
            </>
          ) : (
            <>
              <Link to="/login">Zaloguj</Link>
              <Link to="/register">Załóż konto</Link>
            </>
          )}
        </nav>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}

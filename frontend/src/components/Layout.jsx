import { Link, NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthContext.jsx'
import WhistleIcon from './WhistleIcon.jsx'

export default function Layout() {
  const { user, logout } = useAuth()

  return (
    <div className="app">
      <nav className="topbar" aria-label="Konto">
        {user ? (
          <>
            <NavLink to="/leagues" end>Moje ligi</NavLink>
            {user.role === 'ADMIN' && <NavLink to="/admin">Panel admina</NavLink>}
            <span className="who">
              {user.username}
              {user.role === 'ADMIN' && <span className="badge">admin</span>}
            </span>
            <button className="link" onClick={logout}>Wyloguj</button>
          </>
        ) : (
          <>
            <NavLink to="/login">Zaloguj</NavLink>
            <NavLink to="/register">Załóż konto</NavLink>
          </>
        )}
      </nav>

      {/* winieta jak w starej gazecie: tytuł i gwizdek w czerwonym krążku */}
      <header className="masthead">
        <div className="masthead-row">
          <Link to="/" className="flag">
            <span className="flag-kicker">Typer piłkarski</span>
            <span className="flag-name">Pogwizdek</span>
          </Link>
          <div className="ear-roundel">
            <WhistleIcon />
          </div>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <footer className="footer">
        Football data provided by the{' '}
        <a href="https://www.football-data.org" target="_blank" rel="noreferrer">Football-Data.org</a> API
      </footer>
    </div>
  )
}

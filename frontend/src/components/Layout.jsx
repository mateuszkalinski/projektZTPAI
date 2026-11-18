import { Link, NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthContext.jsx'
import WhistleIcon from './WhistleIcon.jsx'

const longDate = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

// numer "wydania" = numer tygodnia w roku (ISO 8601), jak numer kolejnego wydania tygodnika
function issueNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

export default function Layout() {
  const { user, logout } = useAuth()
  const now = new Date()

  return (
    <div className="app">
      <nav className="topbar" aria-label="Konto">
        {user ? (
          <>
            <NavLink to="/leagues" end>Moje ligi</NavLink>
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

      {/* winieta jak w starej gazecie: "uszy" po bokach, tytuł, linia z datą */}
      <header className="masthead">
        <div className="masthead-row">
          <div className="ear">
            Cena numeru
            <strong>0 zł</strong>
          </div>
          <Link to="/" className="flag">
            <span className="flag-kicker">Typer piłkarski</span>
            <span className="flag-name">Pogwizdek</span>
          </Link>
          <div className="ear-roundel">
            <WhistleIcon />
          </div>
        </div>
        <div className="dateline">
          <span>Rok I.</span>
          <span>{longDate.format(now)} r.</span>
          <span>Nr {issueNumber(now)}.</span>
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

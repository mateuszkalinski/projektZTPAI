import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../api/client.js'
import ErrorMessage from '../components/ErrorMessage.jsx'

export default function LeaguesPage() {
  const navigate = useNavigate()
  const [leagues, setLeagues] = useState(null)
  const [competitions, setCompetitions] = useState([])
  const [error, setError] = useState(null)

  const [newLeague, setNewLeague] = useState({ name: '', description: '', isPublic: false, competitionIds: [] })
  const [createError, setCreateError] = useState(null)
  const [inviteCode, setInviteCode] = useState('')
  const [joinError, setJoinError] = useState(null)

  const load = useCallback(() => {
    api('/leagues').then(setLeagues).catch(setError)
  }, [])

  useEffect(() => {
    load()
    api('/competitions').then(setCompetitions).catch(setError)
  }, [load])

  function toggleCompetition(id) {
    const ids = newLeague.competitionIds
    setNewLeague({ ...newLeague, competitionIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] })
  }

  async function createLeague(e) {
    e.preventDefault()
    setCreateError(null)
    try {
      const league = await api('/leagues', { method: 'POST', body: newLeague })
      navigate(`/leagues/${league.id}`)
    } catch (err) {
      setCreateError(err)
    }
  }

  async function joinLeague(e) {
    e.preventDefault()
    setJoinError(null)
    try {
      const league = await api('/leagues/join', { method: 'POST', body: { inviteCode } })
      navigate(`/leagues/${league.id}`)
    } catch (err) {
      setJoinError(err)
    }
  }

  return (
    <div className="stack">
      <h1>Moje ligi</h1>
      <ErrorMessage error={error} />

      {leagues === null ? (
        <p>Ładowanie…</p>
      ) : leagues.length === 0 ? (
        <p className="muted">Nie należysz jeszcze do żadnej ligi. Załóż własną, dołącz kodem od znajomego albo wybierz ligę publiczną.</p>
      ) : (
        <ul className="list">
          {leagues.map((l) => (
            <li key={l.id}>
              <Link to={`/leagues/${l.id}`}><strong>{l.name}</strong></Link>
              <span className="muted">
                {l.competitions.map((c) => c.name).join(', ')} · {l.memberCount} os.
                {l.isPublic ? ' · publiczna' : ''}
                {l.myRole === 'OWNER' ? ' · założyciel' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      <PublicLeagues />

      <div className="grid2">
        <form className="card stack" onSubmit={createLeague}>
          <h2>Nowa liga</h2>
          <label>
            Nazwa
            <input value={newLeague.name} required maxLength={100}
                   onChange={(e) => setNewLeague({ ...newLeague, name: e.target.value })} />
          </label>
          <label>
            Opis (opcjonalnie)
            <input value={newLeague.description} maxLength={500}
                   onChange={(e) => setNewLeague({ ...newLeague, description: e.target.value })} />
          </label>
          <fieldset>
            <legend>Rozgrywki</legend>
            {competitions.map((c) => (
              <label key={c.id} className="inline">
                <input type="checkbox" checked={newLeague.competitionIds.includes(c.id)}
                       onChange={() => toggleCompetition(c.id)} />
                {c.name}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Widoczność</legend>
            <label className="inline">
              <input type="radio" name="visibility" checked={!newLeague.isPublic}
                     onChange={() => setNewLeague({ ...newLeague, isPublic: false })} />
              Prywatna – dołączenie tylko kodem zaproszenia
            </label>
            <label className="inline">
              <input type="radio" name="visibility" checked={newLeague.isPublic}
                     onChange={() => setNewLeague({ ...newLeague, isPublic: true })} />
              Publiczna – widoczna na liście lig, każdy może dołączyć
            </label>
          </fieldset>
          <ErrorMessage error={createError} />
          <button>Załóż ligę</button>
        </form>

        <form className="card stack" onSubmit={joinLeague}>
          <h2>Dołącz kodem</h2>
          <label>
            Kod zaproszenia
            <input value={inviteCode} required maxLength={12} placeholder="np. K7M2QX9A"
                   onChange={(e) => setInviteCode(e.target.value.toUpperCase())} />
          </label>
          <ErrorMessage error={joinError} />
          <button>Dołącz</button>
        </form>
      </div>
    </div>
  )
}

const TOP = 5
const PAGE_SIZE = 20

/** Ligi publiczne: top 5 największych, po rozwinięciu pełna lista z wyszukiwaniem po nazwie */
function PublicLeagues() {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const params = expanded ? { q: search, page, size: PAGE_SIZE } : { size: TOP }
    api('/leagues/public', { query: params }).then(setData).catch(setError)
  }, [expanded, search, page])

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  async function join(league) {
    setError(null)
    try {
      await api(`/leagues/${league.id}/join`, { method: 'POST' })
      navigate(`/leagues/${league.id}`)
    } catch (err) {
      setError(err)
    }
  }

  if (data && data.totalElements === 0 && !search) return null

  return (
    <section className="card stack">
      <h2>Ligi publiczne</h2>
      {expanded && (
        <input type="search" placeholder="Szukaj ligi po nazwie…" value={query}
               onChange={(e) => setQuery(e.target.value)} aria-label="Szukaj ligi" />
      )}
      <ErrorMessage error={error} />

      {data === null ? (
        <p>Ładowanie…</p>
      ) : data.content.length === 0 ? (
        <p className="muted">Brak lig pasujących do „{search}”.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Liga</th><th>Rozgrywki</th><th className="num">Gracze</th><th /></tr>
          </thead>
          <tbody>
            {data.content.map((l) => (
              <tr key={l.id}>
                <td><strong>{l.name}</strong></td>
                <td className="muted">{l.competitions.map((c) => c.name).join(', ')}</td>
                <td className="num">{l.memberCount}</td>
                <td className="actions">
                  {l.isMember
                    ? <Link to={`/leagues/${l.id}`}>Otwórz</Link>
                    : <button className="link" onClick={() => join(l)}>Dołącz</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {expanded && data && data.totalPages > 1 && (
        <div className="pager">
          <button className="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Poprzednia</button>
          <span>{data.page + 1} / {data.totalPages}</span>
          <button className="secondary" disabled={page + 1 >= data.totalPages} onClick={() => setPage(page + 1)}>Następna ›</button>
        </div>
      )}

      {!expanded && data && data.totalElements > TOP && (
        <button className="link" onClick={() => setExpanded(true)}>
          Pokaż wszystkie ({data.totalElements}) i szukaj ›
        </button>
      )}
      {expanded && (
        <button className="link" onClick={() => { setExpanded(false); setQuery('') }}>‹ Zwiń do top {TOP}</button>
      )}
    </section>
  )
}

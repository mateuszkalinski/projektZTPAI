import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../api/client.js'
import ErrorMessage from '../components/ErrorMessage.jsx'

export default function LeaguesPage() {
  const navigate = useNavigate()
  const [leagues, setLeagues] = useState(null)
  const [competitions, setCompetitions] = useState([])
  const [error, setError] = useState(null)

  const [newLeague, setNewLeague] = useState({ name: '', description: '', competitionIds: [] })
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
        <p className="muted">Nie należysz jeszcze do żadnej ligi. Załóż własną albo dołącz kodem od znajomego.</p>
      ) : (
        <ul className="list">
          {leagues.map((l) => (
            <li key={l.id}>
              <Link to={`/leagues/${l.id}`}><strong>{l.name}</strong></Link>
              <span className="muted">
                {l.competitions.map((c) => c.name).join(', ')} · {l.memberCount} os.
                {l.myRole === 'OWNER' ? ' · właściciel' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

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
          <ErrorMessage error={createError} />
          <button>Załóż ligę</button>
        </form>

        <form className="card stack" onSubmit={joinLeague}>
          <h2>Dołącz do ligi</h2>
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

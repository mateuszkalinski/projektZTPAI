import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { api } from '../api/client.js'
import ErrorMessage from '../components/ErrorMessage.jsx'

const dateFormat = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' })

export default function LeaguePage() {
  const { leagueId } = useParams()
  const [league, setLeague] = useState(null)
  const [fixtures, setFixtures] = useState(null)
  const [page, setPage] = useState(0)
  const [leaderboard, setLeaderboard] = useState([])
  const [otherLeagues, setOtherLeagues] = useState([])
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  const loadFixtures = useCallback(() => {
    api(`/leagues/${leagueId}/fixtures`, { query: { page, size: 10 } }).then(setFixtures).catch(setError)
  }, [leagueId, page])

  const loadLeaderboard = useCallback(() => {
    api(`/leagues/${leagueId}/leaderboard`, { query: { size: 50 } })
      .then((p) => setLeaderboard(p.content))
      .catch(setError)
  }, [leagueId])

  useEffect(() => {
    setError(null)
    api(`/leagues/${leagueId}`).then(setLeague).catch(setError)
    api('/leagues')
      .then((all) => setOtherLeagues(all.filter((l) => String(l.id) !== String(leagueId))))
      .catch(setError)
    loadLeaderboard()
  }, [leagueId, loadLeaderboard])

  useEffect(loadFixtures, [loadFixtures])

  async function copyFrom(sourceLeagueId) {
    setInfo(null)
    try {
      const r = await api(`/leagues/${leagueId}/predictions/copy`, {
        method: 'POST',
        body: { sourceLeagueId: Number(sourceLeagueId), overwrite: false },
      })
      setInfo(`Skopiowano ${r.copied} typów, pominięto ${r.skipped}.`)
      loadFixtures()
    } catch (err) {
      setError(err)
    }
  }

  if (error && !league) return <ErrorMessage error={error} />
  if (!league) return <p>Ładowanie…</p>

  return (
    <div className="stack">
      <div>
        <h1>{league.name}</h1>
        {league.description && <p>{league.description}</p>}
        <p className="muted">
          {league.competitions.map((c) => c.name).join(', ')} · {league.memberCount} os.
          {league.inviteCode && <> · kod zaproszenia: <code>{league.inviteCode}</code></>}
        </p>
      </div>

      <CopyPredictions leagues={otherLeagues} onCopy={copyFrom} />
      {info && <p className="success">{info}</p>}
      <ErrorMessage error={error} />

      <div className="grid2 wide-left">
        <section className="card">
          <h2>Terminarz</h2>
          {fixtures === null ? (
            <p>Ładowanie…</p>
          ) : (
            <>
              <ul className="list">
                {fixtures.content.map((f) => (
                  <FixtureRow key={f.match.id} leagueId={leagueId} fixture={f} onSaved={loadFixtures} />
                ))}
              </ul>
              <div className="pager">
                <button disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Poprzednie</button>
                <span>{fixtures.page + 1} / {Math.max(fixtures.totalPages, 1)}</span>
                <button disabled={page + 1 >= fixtures.totalPages} onClick={() => setPage(page + 1)}>Następne ›</button>
              </div>
            </>
          )}
        </section>

        <section className="card">
          <h2>Tabela</h2>
          <table>
            <thead>
              <tr><th>#</th><th>Gracz</th><th>Pkt</th></tr>
            </thead>
            <tbody>
              {leaderboard.map((row) => (
                <tr key={row.userId}>
                  <td>{row.position}</td>
                  <td>{row.username}</td>
                  <td>{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}

/** "Skopiuj moje typy z ligi…" – przycisk z nazwą, gdy jest jedna inna liga, lista rozwijana, gdy jest ich więcej */
function CopyPredictions({ leagues, onCopy }) {
  const [selected, setSelected] = useState('')
  if (leagues.length === 0) return null

  if (leagues.length === 1) {
    return (
      <div>
        <button className="secondary" onClick={() => onCopy(leagues[0].id)}>
          Skopiuj moje typy z ligi „{leagues[0].name}”
        </button>
      </div>
    )
  }
  return (
    <div className="inline">
      <span>Skopiuj moje typy z ligi:</span>
      <select value={selected} onChange={(e) => setSelected(e.target.value)}>
        <option value="">— wybierz —</option>
        {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <button className="secondary" disabled={!selected} onClick={() => onCopy(selected)}>Kopiuj</button>
    </div>
  )
}

function FixtureRow({ leagueId, fixture, onSaved }) {
  const { match, myPrediction, canPredict } = fixture
  const [home, setHome] = useState(myPrediction?.homeScore ?? '')
  const [away, setAway] = useState(myPrediction?.awayScore ?? '')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setHome(myPrediction?.homeScore ?? '')
    setAway(myPrediction?.awayScore ?? '')
  }, [myPrediction?.homeScore, myPrediction?.awayScore])

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api(`/leagues/${leagueId}/matches/${match.id}/prediction`, {
        method: 'PUT',
        body: { homeScore: Number(home), awayScore: Number(away) },
      })
      onSaved()
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  const finished = match.status === 'FINISHED'

  return (
    <li className="fixture">
      <div className="muted small">
        {dateFormat.format(new Date(match.kickoffAt))} · {match.competition.name}{match.stage ? ` · ${match.stage}` : ''}
      </div>
      <div className="teams">
        <span>{match.homeTeam.name}</span>
        <strong>{finished ? `${match.homeScore} : ${match.awayScore}` : 'vs'}</strong>
        <span>{match.awayTeam.name}</span>
      </div>

      {canPredict ? (
        <form className="inline" onSubmit={save}>
          <input type="number" min={0} max={30} value={home} required className="score"
                 onChange={(e) => setHome(e.target.value)} aria-label="Gole gospodarzy" />
          <span>:</span>
          <input type="number" min={0} max={30} value={away} required className="score"
                 onChange={(e) => setAway(e.target.value)} aria-label="Gole gości" />
          <button disabled={saving}>{myPrediction ? 'Zmień typ' : 'Typuj'}</button>
        </form>
      ) : (
        <div className="small">
          {myPrediction
            ? <>Twój typ: {myPrediction.homeScore} : {myPrediction.awayScore}
                {myPrediction.points !== null && <> · <strong>{myPrediction.points} pkt</strong></>}</>
            : <span className="muted">Brak typu – typowanie zamknięte</span>}
        </div>
      )}
      <ErrorMessage error={error} />
    </li>
  )
}

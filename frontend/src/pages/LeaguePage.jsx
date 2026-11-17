import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import ErrorMessage from '../components/ErrorMessage.jsx'

const dateTime = new Intl.DateTimeFormat('pl-PL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const dayMonth = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' })

const NO_STAGE = '-'
const stageName = (stage) => (stage === NO_STAGE ? 'Pozostałe mecze' : stage)

function roundDates(round) {
  const start = dayMonth.format(new Date(round.startsAt))
  const end = dayMonth.format(new Date(round.endsAt))
  return start === end ? start : `${start} – ${end}`
}

// rozgrywki, od których zaczynamy: ta, której bieżąca kolejka startuje najwcześniej
function pickDefault(groups) {
  let best = null
  for (const g of groups) {
    const round = g.rounds.find((r) => r.stage === g.currentStage)
    if (round && (!best || new Date(round.startsAt) < new Date(best.round.startsAt))) best = { group: g, round }
  }
  return best ? { competitionId: best.group.competition.id, stage: best.round.stage } : null
}

export default function LeaguePage() {
  const { leagueId } = useParams()
  const [league, setLeague] = useState(null)
  const [groups, setGroups] = useState(null) // kolejki pogrupowane po rozgrywkach
  const [selected, setSelected] = useState(null) // { competitionId, stage }
  const [fixtures, setFixtures] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [myLeagues, setMyLeagues] = useState([])
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  const loadLeaderboard = useCallback(() => {
    api(`/leagues/${leagueId}/leaderboard`, { query: { size: 10 } })
      .then((p) => setLeaderboard(p.content))
      .catch(setError)
  }, [leagueId])

  useEffect(() => {
    setError(null)
    setSelected(null)
    setFixtures(null)
    api(`/leagues/${leagueId}`).then(setLeague).catch(setError)
    api(`/leagues/${leagueId}/rounds`)
      .then((data) => {
        setGroups(data)
        setSelected(pickDefault(data))
      })
      .catch(setError)
    api('/leagues').then(setMyLeagues).catch(setError)
    loadLeaderboard()
  }, [leagueId, loadLeaderboard])

  const loadFixtures = useCallback(() => {
    if (!selected) return
    api(`/leagues/${leagueId}/fixtures`, { query: { ...selected, size: 100 } })
      .then(setFixtures)
      .catch(setError)
  }, [leagueId, selected])

  useEffect(loadFixtures, [loadFixtures])

  // do kopiowania nadają się tylko ligi, które mają z tą ligą wspólne rozgrywki
  const copySources = useMemo(() => {
    if (!league) return []
    const mine = new Set(league.competitions.map((c) => c.id))
    return myLeagues.filter(
      (l) => String(l.id) !== String(leagueId) && l.competitions.some((c) => mine.has(c.id)),
    )
  }, [league, myLeagues, leagueId])

  async function copyFrom(sourceLeagueId) {
    setInfo(null)
    try {
      const r = await api(`/leagues/${leagueId}/predictions/copy`, {
        method: 'POST',
        body: { sourceLeagueId: Number(sourceLeagueId), overwrite: false },
      })
      setInfo(`Skopiowane typy: ${r.copied}, pominięte: ${r.skipped}.`)
      loadFixtures()
    } catch (err) {
      setError(err)
    }
  }

  if (error && !league) return <ErrorMessage error={error} />
  if (!league) return <p>Ładowanie…</p>

  const group = groups?.find((g) => g.competition.id === selected?.competitionId)

  return (
    <div className="stack">
      <div>
        <h1>{league.name}</h1>
        {league.description && <p>{league.description}</p>}
        <p className="muted">
          <span className="badge">{league.isPublic ? 'publiczna' : 'prywatna'}</span>{' '}
          {league.competitions.map((c) => c.name).join(', ')} · {league.memberCount} os.
          {league.inviteCode && <> · kod zaproszenia: <code>{league.inviteCode}</code></>}
        </p>
      </div>

      <CopyPredictions leagues={copySources} onCopy={copyFrom} />
      {info && <p className="success">{info}</p>}
      <ErrorMessage error={error} />

      <div className="grid2 wide-left">
        <section className="card stack">
          <h2>Terminarz</h2>

          {groups === null ? (
            <p>Ładowanie…</p>
          ) : groups.length === 0 ? (
            <p className="muted">Brak meczów w rozgrywkach tej ligi.</p>
          ) : (
            <>
              {groups.length > 1 && (
                <div className="tabs" role="tablist">
                  {groups.map((g) => (
                    <button
                      key={g.competition.id}
                      role="tab"
                      aria-selected={g.competition.id === selected?.competitionId}
                      className={g.competition.id === selected?.competitionId ? 'tab active' : 'tab'}
                      onClick={() => setSelected({ competitionId: g.competition.id, stage: g.currentStage })}
                    >
                      {g.competition.name}
                    </button>
                  ))}
                </div>
              )}

              {group && (
                <RoundPicker
                  group={group}
                  stage={selected.stage}
                  onChange={(stage) => setSelected({ competitionId: group.competition.id, stage })}
                />
              )}

              {fixtures === null ? (
                <p>Ładowanie…</p>
              ) : (
                <ul className="list">
                  {fixtures.content.map((f) => (
                    <FixtureRow key={f.match.id} leagueId={leagueId} fixture={f} onSaved={loadFixtures} />
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <div className="stack">
          <section className="card stack">
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
            <Link to={`/leagues/${leagueId}/table`} className="small">
              {league.memberCount > 10 ? `Pełna tabela (${league.memberCount} graczy) ›` : 'Pełna tabela ›'}
            </Link>
          </section>

          <LeagueActions league={league} onUpdated={setLeague} />
        </div>
      </div>
    </div>
  )
}

/**
 * Wyjście z ligi (członek) albo usunięcie ligi (założyciel lub admin).
 * Założyciel nie może wyjść z własnej ligi – to reguła biznesowa backendu.
 */
function LeagueActions({ league, onUpdated }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)

  const isOwner = league.myRole === 'OWNER'
  const canDelete = isOwner || user?.role === 'ADMIN'
  const canLeave = league.myRole === 'MEMBER'

  async function run(question, request) {
    if (!window.confirm(question)) return
    setBusy(true)
    setError(null)
    try {
      await request()
      navigate('/leagues', { replace: true })
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  const leave = () =>
    run(`Na pewno chcesz wyjść z ligi „${league.name}”? Wrócić możesz tylko z kodem zaproszenia.`, () =>
      api(`/leagues/${league.id}/leave`, { method: 'POST' }),
    )

  const remove = () =>
    run(`Usunąć ligę „${league.name}” razem z typami wszystkich graczy? Tej operacji nie da się cofnąć.`, () =>
      api(`/leagues/${league.id}`, { method: 'DELETE' }),
    )

  if (!canLeave && !canDelete) return null

  return (
    <section className="card stack">
      <h2>Liga</h2>
      {editing ? (
        <EditLeagueForm
          league={league}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            onUpdated(updated)
            setEditing(false)
          }}
        />
      ) : (
        <>
          {isOwner && (
            <p className="muted small">
              Jesteś założycielem tej ligi, więc nie możesz z niej wyjść – możesz ją przekazać innemu
              graczowi (w pełnej tabeli) albo usunąć.
            </p>
          )}
          <div className="inline">
            {canDelete && (
              <>
                <button className="secondary" disabled={busy} onClick={() => setEditing(true)}>Edytuj</button>
                <Link to={`/leagues/${league.id}/table`} className="button secondary">Zarządzaj graczami</Link>
              </>
            )}
            {canLeave && (
              <button className="secondary" disabled={busy} onClick={leave}>Wyjdź z ligi</button>
            )}
            {canDelete && (
              <button className="danger" disabled={busy} onClick={remove}>Usuń ligę</button>
            )}
          </div>
        </>
      )}
      <ErrorMessage error={error} />
    </section>
  )
}

/** Edycja nazwy, opisu i widoczności ligi (rozgrywek nie zmieniamy w trakcie sezonu) */
function EditLeagueForm({ league, onCancel, onSaved }) {
  const [form, setForm] = useState({
    name: league.name,
    description: league.description ?? '',
    isPublic: league.isPublic,
  })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onSaved(await api(`/leagues/${league.id}`, { method: 'PUT', body: form }))
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={save}>
      <label>
        Nazwa
        <input value={form.name} required maxLength={100}
               onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <label>
        Opis
        <input value={form.description} maxLength={500}
               onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </label>
      <label className="inline">
        <input type="checkbox" checked={form.isPublic}
               onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} />
        Liga publiczna (widoczna na liście, dołączenie bez kodu)
      </label>
      <ErrorMessage error={error} />
      <div className="inline">
        <button disabled={busy}>Zapisz</button>
        <button type="button" className="secondary" onClick={onCancel}>Anuluj</button>
      </div>
    </form>
  )
}

/** Wybór kolejki: strzałki poprzednia/następna + lista wszystkich kolejek */
function RoundPicker({ group, stage, onChange }) {
  const index = group.rounds.findIndex((r) => r.stage === stage)
  const prev = group.rounds[index - 1]
  const next = group.rounds[index + 1]

  return (
    <div className="round-picker">
      <button className="secondary" disabled={!prev} onClick={() => onChange(prev.stage)} aria-label="Poprzednia kolejka">‹</button>
      <select value={stage} onChange={(e) => onChange(e.target.value)} aria-label="Kolejka">
        {group.rounds.map((r) => (
          <option key={r.stage} value={r.stage}>
            {stageName(r.stage)} ({roundDates(r)}){r.stage === group.currentStage ? ' • bieżąca' : ''}
          </option>
        ))}
      </select>
      <button className="secondary" disabled={!next} onClick={() => onChange(next.stage)} aria-label="Następna kolejka">›</button>
    </div>
  )
}

/** "Skopiuj moje typy z ligi…" – przycisk z nazwą, gdy jest jedna pasująca liga, lista, gdy jest ich więcej */
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
  const statusNote = { POSTPONED: 'przełożony', CANCELLED: 'odwołany' }[match.status]

  return (
    <li className="fixture">
      <div className="muted small">
        {dateTime.format(new Date(match.kickoffAt))}
        {statusNote && <> · <strong>{statusNote}</strong></>}
        {!finished && !statusNote && match.started && <> · <strong>trwa</strong></>}
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

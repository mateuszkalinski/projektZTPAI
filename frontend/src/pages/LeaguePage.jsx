import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import ErrorMessage from '../components/ErrorMessage.jsx'

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
  const { user } = useAuth()
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
      <header className="frame page-head">
        <h1>{league.name}</h1>
        {league.description && <p>{league.description}</p>}
        <div className="page-meta">
          <span>Liga <strong>{league.isPublic ? 'publiczna' : 'prywatna'}</strong></span>
          <span>Rozgrywki: <strong>{league.competitions.map((c) => c.name).join(', ')}</strong></span>
          <span>Graczy: <strong>{league.memberCount}</strong></span>
          {league.inviteCode && <span>Kod zaproszenia: <code>{league.inviteCode}</code></span>}
        </div>
      </header>

      {info && <p className="success">{info}</p>}
      <ErrorMessage error={error} />

      <div className="columns">
        <section className="stack">
          <div className="band red">
            <h2>Kupon</h2>
            <CopyPredictions leagues={copySources} onCopy={copyFrom} />
          </div>

          {groups === null ? (
            <p>Ładowanie…</p>
          ) : groups.length === 0 ? (
            <p className="muted">W rozgrywkach tej ligi nie ma jeszcze meczów.</p>
          ) : (
            <div className="stack">
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
                <ol className="coupon">
                  {fixtures.content.map((f, i) => (
                    <FixtureRow key={f.match.id} number={i + 1} leagueId={leagueId} fixture={f} onSaved={loadFixtures} />
                  ))}
                </ol>
              )}
            </div>
          )}
        </section>

        <aside className="stack">
          <section className="stack">
            <div className="band">
              <h2>Tabela</h2>
              <Link to={`/leagues/${leagueId}/table`} className="small">
                {league.memberCount > 10 ? `Pełna tabela (${league.memberCount})` : 'Pełna tabela'}
              </Link>
            </div>
            <table>
              <thead>
                <tr><th>Miejsce</th><th>Gracz</th><th className="pts">Pkt</th></tr>
              </thead>
              <tbody>
                {leaderboard.map((row) => (
                  <tr key={row.userId} className={row.userId === user?.id ? 'me' : undefined}>
                    <td className="pos"><span className="box-num">{row.position}</span></td>
                    <td className="player">{row.username}</td>
                    <td className="pts">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <LeagueActions league={league} onUpdated={setLeague} />
        </aside>
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
    <section className="stack">
      <div className="band teal"><h2>Liga</h2></div>
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
              Jako założyciel nie możesz wyjść z ligi. Możesz ją przekazać innemu graczowi
              w pełnej tabeli albo usunąć.
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
            {stageName(r.stage)}, {roundDates(r)}{r.stage === group.currentStage ? ' (bieżąca)' : ''}
          </option>
        ))}
      </select>
      <button className="secondary" disabled={!next} onClick={() => onChange(next.stage)} aria-label="Następna kolejka">›</button>
    </div>
  )
}

/** "Skopiuj typy z ligi…" – przycisk z nazwą, gdy pasuje jedna liga, lista, gdy więcej */
function CopyPredictions({ leagues, onCopy }) {
  const [selected, setSelected] = useState('')
  if (leagues.length === 0) return null

  if (leagues.length === 1) {
    return (
      <button className="link small" onClick={() => onCopy(leagues[0].id)}>
        Skopiuj typy z ligi „{leagues[0].name}”
      </button>
    )
  }
  return (
    <div className="inline small">
      <select className="small" value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Skopiuj typy z ligi">
        <option value="">Skopiuj typy z ligi…</option>
        {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <button className="coupon-save" disabled={!selected} onClick={() => onCopy(selected)}>Kopiuj</button>
    </div>
  )
}

const timeOnly = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' })
const dayOnly = new Intl.DateTimeFormat('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })

function FixtureRow({ number, leagueId, fixture, onSaved }) {
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

  const kickoff = new Date(match.kickoffAt)
  const finished = match.status === 'FINISHED'
  const statusNote = { POSTPONED: 'Mecz przełożony', CANCELLED: 'Mecz odwołany' }[match.status]
  const live = !finished && !statusNote && match.started
  const unchanged =
    myPrediction && String(myPrediction.homeScore) === String(home) && String(myPrediction.awayScore) === String(away)
  const filled = home !== '' && away !== ''
  const formId = `typ-${match.id}`

  return (
    <li className="coupon-row">
      <div className="coupon-meta">
        <span className="box-num" aria-hidden="true">{number}</span>
        <div className="coupon-time">
          <strong>{timeOnly.format(kickoff)}</strong>
          <span>{dayOnly.format(kickoff)}</span>
        </div>
      </div>
      <span className="coupon-team home">{match.homeTeam.name}</span>

      <div className="coupon-middle">
        {canPredict ? (
          <form id={formId} className="coupon-middle" onSubmit={save}>
            <input type="number" min={0} max={30} value={home} required className="score" inputMode="numeric"
                   onChange={(e) => setHome(e.target.value)} aria-label={`Gole: ${match.homeTeam.name}`} />
            <span className="sep">:</span>
            <input type="number" min={0} max={30} value={away} required className="score" inputMode="numeric"
                   onChange={(e) => setAway(e.target.value)} aria-label={`Gole: ${match.awayTeam.name}`} />
          </form>
        ) : finished ? (
          <span className="coupon-result">{match.homeScore}:{match.awayScore}</span>
        ) : (
          <span className="coupon-vs">v</span>
        )}
      </div>

      <span className="coupon-team away">{match.awayTeam.name}</span>

      <div className="coupon-foot">
        {canPredict ? (
          <>
            {myPrediction && unchanged && <span className="saved">Typ zapisany</span>}
            {filled && !unchanged && (
              <button form={formId} className="coupon-save" disabled={saving}>
                {myPrediction ? 'Zapisz zmianę' : 'Zapisz typ'}
              </button>
            )}
          </>
        ) : (
          <>
            {live && <span className="live">Trwa</span>}
            {statusNote && <span className="live">{statusNote}</span>}
            {myPrediction ? (
              <span>Twój typ: <strong>{myPrediction.homeScore}:{myPrediction.awayScore}</strong></span>
            ) : (
              !statusNote && <span className="muted">Bez typu</span>
            )}
            {myPrediction?.points != null && (
              <span className={myPrediction.points > 0 ? 'stamp' : 'stamp zero'}>+{myPrediction.points}</span>
            )}
          </>
        )}
        <ErrorMessage error={error} />
      </div>
    </li>
  )
}

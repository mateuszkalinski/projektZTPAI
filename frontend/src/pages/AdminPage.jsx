import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client.js'
import ErrorMessage from '../components/ErrorMessage.jsx'

const timeOnly = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' })
const dayOnly = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' })
const TEST_CODE = 'WARZYWA'
const SHOWN_ROUNDS = 3

/**
 * Panel admina: testowa "Liga Warzyw" do demo i ręcznego testowania.
 * Admin dodaje kolejkę z meczami za kilka minut, gracze typują, a po rozpoczęciu
 * admin wpisuje wynik (ręcznie albo losowo) – punkty liczą się same w tle.
 */
export default function AdminPage() {
  const [matches, setMatches] = useState(null)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [minutes, setMinutes] = useState(3)
  const [count, setCount] = useState(5)

  const load = useCallback(async () => {
    try {
      const competitions = await api('/competitions')
      const test = competitions.find((c) => c.code === TEST_CODE)
      if (!test) return setMatches([])
      const page = await api('/matches', { query: { competitionId: test.id, size: 100 } })
      setMatches(page.content)
    } catch (err) {
      setError(err)
    }
  }, [])

  // odświeżanie co 15 s, żeby mecz sam przeszedł w "trwa" po godzinie rozpoczęcia
  useEffect(() => {
    load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [load])

  async function run(action, describe) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      setMessage(describe(await action()))
      await load()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  function addRound(e) {
    e.preventDefault()
    run(
      () => api('/test-data/round', { method: 'POST', body: { minutes: Number(minutes), matches: Number(count) } }),
      (r) => `Dodano: ${r.stage}, ${r.matches.length} mecz(e), początek o ${timeOnly.format(new Date(r.kickoffAt))}.`
    )
  }

  function randomResults() {
    run(
      () => api('/test-data/results', { method: 'POST' }),
      (r) => (r.finished ? `Wpisano losowe wyniki: ${r.finished} mecz(e). Punkty liczą się w tle.` : 'Brak rozpoczętych meczów bez wyniku.')
    )
  }

  // grupowanie po kolejkach, najnowsza na górze
  const rounds = []
  for (const m of matches ?? []) {
    const round = rounds.find((r) => r.stage === m.stage)
    if (round) round.matches.push(m)
    else rounds.push({ stage: m.stage, matches: [m] })
  }
  rounds.reverse()
  const waiting = (matches ?? []).filter((m) => m.started && m.status === 'SCHEDULED').length

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Panel admina</h1>
        <p className="muted">
          Liga Warzyw to rozgrywki testowe. Dodaj kolejkę, załóż ligę z Ligą Warzyw i obstaw mecze.
          Gdy mecze się zaczną, typowanie się zamyka i możesz wpisać wyniki.
        </p>
      </header>

      <section className="frame teal stack">
        <form className="inline" onSubmit={addRound}>
          <label className="inline">
            Początek za{' '}
            <input type="number" min={1} max={1440} value={minutes} required className="score"
                   onChange={(e) => setMinutes(e.target.value)} /> min
          </label>
          <label className="inline">
            Mecze{' '}
            <input type="number" min={1} max={5} value={count} required className="score"
                   onChange={(e) => setCount(e.target.value)} />
          </label>
          <button disabled={busy}>Dodaj kolejkę</button>
        </form>
        <div className="inline">
          <button className="secondary" onClick={randomResults} disabled={busy || waiting === 0}>
            Losowe wyniki ({waiting})
          </button>
          <span className="muted small">dla rozpoczętych meczów bez wyniku</span>
        </div>
        {message && <p className="saved">{message}</p>}
        <ErrorMessage error={error} />
      </section>

      {matches === null ? (
        <p>Ładowanie…</p>
      ) : rounds.length === 0 ? (
        <p className="muted">Liga Warzyw nie ma jeszcze meczów. Dodaj pierwszą kolejkę.</p>
      ) : (
        rounds.slice(0, SHOWN_ROUNDS).map((round) => (
          <section key={round.stage} className="stack">
            <div className="band red"><h2>{round.stage}</h2></div>
            <ol className="coupon">
              {round.matches.map((m, i) => (
                <ResultRow key={m.id} number={i + 1} match={m} onSaved={load} />
              ))}
            </ol>
          </section>
        ))
      )}
    </div>
  )
}

function ResultRow({ number, match, onSaved }) {
  const [home, setHome] = useState('')
  const [away, setAway] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const kickoff = new Date(match.kickoffAt)
  const finished = match.status === 'FINISHED'
  const canEnter = match.started && match.status === 'SCHEDULED'
  const formId = `wynik-${match.id}`

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api(`/matches/${match.id}/result`, {
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
        {canEnter ? (
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
        {canEnter && <span className="live">Trwa</span>}
        {canEnter && home !== '' && away !== '' && (
          <button form={formId} className="coupon-save" disabled={saving}>Zapisz wynik</button>
        )}
        {!match.started && <span className="muted">Typowanie otwarte do {timeOnly.format(kickoff)}</span>}
        <ErrorMessage error={error} />
      </div>
    </li>
  )
}

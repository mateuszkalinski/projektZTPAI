import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import ErrorMessage from '../components/ErrorMessage.jsx'

const date = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })
const PAGE_SIZE = 20

// "Faza ligowa, 5. kolejka" -> "5. kol." (pełna nazwa w podpowiedzi po najechaniu)
function shortStage(stage) {
  const round = stage.match(/(\d+)\. kolejka/)
  return round ? `${round[1]}. kol.` : stage
}

/**
 * Pełna tabela ligi: miejsce, nick, punkty, data dołączenia i punkty z 5 ostatnich kolejek.
 * Założyciel i admin mają tu też zarządzanie graczami (usunięcie = ban, przekazanie ligi)
 * oraz zakładkę ze zbanowanymi.
 */
export default function LeagueTablePage() {
  const { leagueId } = useParams()
  const { user } = useAuth()
  const [league, setLeague] = useState(null)
  const [tab, setTab] = useState('players')
  const [error, setError] = useState(null)

  const loadLeague = useCallback(() => {
    api(`/leagues/${leagueId}`).then(setLeague).catch(setError)
  }, [leagueId])

  useEffect(loadLeague, [loadLeague])

  if (error && !league) return <ErrorMessage error={error} />
  if (!league) return <p>Ładowanie…</p>

  const canManage = league.myRole === 'OWNER' || user?.role === 'ADMIN'

  return (
    <div className="stack">
      <header className="page-head">
        <Link to={`/leagues/${leagueId}`} className="back">‹ {league.name}</Link>
        <h1>Tabela ligi</h1>
      </header>

      {canManage && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'players'} className={tab === 'players' ? 'tab active' : 'tab'}
                  onClick={() => setTab('players')}>Gracze</button>
          <button role="tab" aria-selected={tab === 'bans'} className={tab === 'bans' ? 'tab active' : 'tab'}
                  onClick={() => setTab('bans')}>Zbanowani</button>
        </div>
      )}

      {tab === 'players'
        ? <Standings league={league} canManage={canManage} onLeagueChanged={loadLeague} />
        : <Bans leagueId={leagueId} />}
    </div>
  )
}

function Standings({ league, canManage, onLeagueChanged }) {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  const load = useCallback(() => {
    api(`/leagues/${league.id}/leaderboard`, { query: { q: search, page, size: PAGE_SIZE } })
      .then(setData)
      .catch(setError)
  }, [league.id, search, page])

  useEffect(load, [load])

  // wyszukiwanie po chwili od przestania pisania, zawsze od pierwszej strony
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  async function action(question, request, done) {
    if (!window.confirm(question)) return
    setError(null)
    setInfo(null)
    try {
      await request()
      setInfo(done)
      load()
      onLeagueChanged()
    } catch (err) {
      setError(err)
    }
  }

  const ban = (row) =>
    action(
      `Usunąć gracza ${row.username} z ligi? Nie będzie mógł wrócić, dopóki go nie przywrócisz (zakładka „Zbanowani”).`,
      () => api(`/leagues/${league.id}/members/${row.userId}`, { method: 'DELETE' }),
      `${row.username} został usunięty z ligi.`,
    )

  const transfer = (row) =>
    action(
      `Przekazać ligę graczowi ${row.username}? Stracisz uprawnienia założyciela.`,
      () => api(`/leagues/${league.id}/transfer-ownership`, { method: 'POST', body: { newOwnerId: row.userId } }),
      `${row.username} jest teraz założycielem ligi.`,
    )

  return (
    <section className="stack">
      <input type="search" placeholder="Szukaj gracza po nicku…" value={query}
             onChange={(e) => setQuery(e.target.value)} aria-label="Szukaj gracza" />
      {info && <p className="success">{info}</p>}
      <ErrorMessage error={error} />

      {data === null ? (
        <p>Ładowanie…</p>
      ) : data.content.length === 0 ? (
        <p className="muted">Brak graczy{search ? ` pasujących do „${search}”` : ''}.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Miejsce</th>
                <th>Gracz</th>
                <th className="pts">Pkt</th>
                <th>Dołączył</th>
                {data.rounds.map((r) => (
                  <th key={`${r.competitionId}|${r.stage}`} className="num" title={`${r.competitionName}: ${r.stage}`}>
                    {shortStage(r.stage)}
                  </th>
                ))}
                {canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {data.content.map((row) => {
                const isOwnerRow = row.role === 'OWNER'
                const isMe = row.userId === user?.id
                return (
                  <tr key={row.userId} className={isMe ? 'me' : undefined}>
                    <td className="pos"><span className="box-num">{row.position}</span></td>
                    <td className="player">
                      {row.username}
                      {isOwnerRow && <span className="badge">założyciel</span>}
                    </td>
                    <td className="pts">{row.points}</td>
                    <td className="muted">{date.format(new Date(row.joinedAt))}</td>
                    {row.roundPoints.map((p, i) => (
                      <td key={i} className="num">{p ?? '–'}</td>
                    ))}
                    {canManage && (
                      <td className="actions">
                        {!isOwnerRow && !isMe && (
                          <>
                            <button className="link" onClick={() => transfer(row)}>Przekaż ligę</button>
                            <button className="link danger-text" onClick={() => ban(row)}>Usuń z ligi</button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div className="pager">
          <button className="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Poprzednia</button>
          <span>{data.page + 1} / {data.totalPages}</span>
          <button className="secondary" disabled={page + 1 >= data.totalPages} onClick={() => setPage(page + 1)}>Następna ›</button>
        </div>
      )}
    </section>
  )
}

function Bans({ leagueId }) {
  const [bans, setBans] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    api(`/leagues/${leagueId}/bans`).then(setBans).catch(setError)
  }, [leagueId])

  useEffect(load, [load])

  async function unban(ban) {
    if (!window.confirm(`Przywrócić gracza ${ban.user.username}? Będzie mógł znowu dołączyć do ligi.`)) return
    try {
      await api(`/leagues/${leagueId}/bans/${ban.user.id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <section className="stack">
      <ErrorMessage error={error} />
      {bans === null ? (
        <p>Ładowanie…</p>
      ) : bans.length === 0 ? (
        <p className="muted">Nikt nie jest zbanowany.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Gracz</th><th>Usunięty</th><th>Przez</th><th /></tr>
          </thead>
          <tbody>
            {bans.map((b) => (
              <tr key={b.user.id}>
                <td>{b.user.username}</td>
                <td className="muted">{date.format(new Date(b.bannedAt))}</td>
                <td className="muted">{b.bannedBy ?? '—'}</td>
                <td className="actions"><button className="link" onClick={() => unban(b)}>Przywróć</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

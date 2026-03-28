import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Activity, Zap, ThumbsUp, ThumbsDown, BarChart2 } from 'lucide-react'
import { getBanditState, sendBanditFeedback, getProjects } from '../services/api'
import { useApp } from '../context/AppContext'

export default function Bandit() {
  const { toast } = useApp() || {}
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState({ epsilon: 0.2, stats: {}, log: [] })
  const [projects, setProjects] = useState([])
  const [sendingKey, setSendingKey] = useState('')

  const projectLookup = useMemo(() => {
    const m = {}
    projects.forEach(p => { m[p.id] = p.name })
    return m
  }, [projects])

  const refresh = async () => {
    try {
      const d = await getBanditState()
      setState({
        epsilon: d?.epsilon ?? 0.2,
        stats: d?.stats || {},
        log: d?.log || [],
      })
    } catch (e) {
      toast?.('Failed to load bandit state', 'warn')
    } finally {
      setLoading(false)
    }
  }

  const loadProjects = async () => {
    try {
      const d = await getProjects()
      setProjects(d?.projects || [])
    } catch (e) {
      toast?.('Projects unavailable', 'warn')
    }
  }

  useEffect(() => {
    refresh()
    loadProjects()
    const id = setInterval(refresh, 6000)
    return () => clearInterval(id)
  }, [])

  const handleFeedback = async (projectId, reward, eventLabel) => {
    setSendingKey(`${projectId}:${eventLabel}`)
    try {
      await sendBanditFeedback(projectId, reward, null, eventLabel)
      toast?.('Feedback sent', 'ok')
      await refresh()
    } catch (e) {
      toast?.('Could not send feedback', 'warn')
    } finally {
      setSendingKey('')
    }
  }

  const arms = useMemo(() => Object.entries(state.stats || {}), [state.stats])
  const totalPlays = useMemo(() => arms.reduce((acc, [, st]) => acc + (st.plays || 0), 0), [arms])
  const totalWins = useMemo(() => arms.reduce((acc, [, st]) => acc + (st.wins || 0), 0), [arms])

  return (
    <div className="pb-16">
      <div className="htag mb-4">Reinforcement / Bandit Prototype</div>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-8">
        <div>
          <h1 className="font-bebas text-[clamp(38px,6vw,72px)] leading-[0.9] uppercase tracking-[0.02em]">Bandit Lab</h1>
          <p className="font-dm text-[13px] text-brand-muted max-w-2xl">
            Live view of the ε-greedy recommender that suggests projects for incoming emails. Use this screen
            to explain exploration vs exploitation and to manually reward or penalize arms during the demo.
          </p>
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-sm border border-brand-border text-brand-muted hover:text-white hover:border-brand-blue/50 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        <div className="p-4 border border-brand-border rounded-sm bg-brand-input/40">
          <div className="flex items-center justify-between mb-1">
            <span className="font-space text-[10px] uppercase tracking-[0.2em] text-brand-muted">Epsilon</span>
            <Zap size={14} className="text-brand-blue" />
          </div>
          <div className="font-bebas text-4xl">{state.epsilon?.toFixed(2)}</div>
          <div className="font-space text-[11px] text-brand-muted">Exploration rate (lower = more exploit)</div>
        </div>
        <div className="p-4 border border-brand-border rounded-sm bg-brand-input/40">
          <div className="flex items-center justify-between mb-1">
            <span className="font-space text-[10px] uppercase tracking-[0.2em] text-brand-muted">Arms</span>
            <Activity size={14} className="text-brand-blue" />
          </div>
          <div className="font-bebas text-4xl">{arms.length}</div>
          <div className="font-space text-[11px] text-brand-muted">Projects currently tracked</div>
        </div>
        <div className="p-4 border border-brand-border rounded-sm bg-brand-input/40">
          <div className="flex items-center justify-between mb-1">
            <span className="font-space text-[10px] uppercase tracking-[0.2em] text-brand-muted">Trials</span>
            <BarChart2 size={14} className="text-brand-blue" />
          </div>
          <div className="font-bebas text-4xl">{totalPlays}</div>
          <div className="font-space text-[11px] text-brand-muted">Suggestions served (plays) · wins {totalWins}</div>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-space text-[10px] uppercase tracking-[0.2em] text-brand-muted">Arms</div>
            <div className="font-bebas text-2xl">Project reward table</div>
          </div>
        </div>
        <div className="overflow-hidden border border-brand-border rounded-sm">
          <table className="w-full text-left">
            <thead className="bg-brand-input/40 text-brand-muted font-space text-[10px] uppercase tracking-[0.2em]">
              <tr>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Plays</th>
                <th className="px-4 py-3">Wins</th>
                <th className="px-4 py-3">Mean</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {arms.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-brand-muted font-space text-[12px]">
                    No bandit activity yet. Trigger a suggestion from Inbox or Unassigned Emails.
                  </td>
                </tr>
              )}
              {arms.map(([projectId, st]) => {
                const plays = st.plays || 0
                const wins = st.wins || 0
                const mean = plays > 0 ? wins / plays : 0
                return (
                  <tr key={projectId} className="text-[13px]">
                    <td className="px-4 py-3">
                      <div className="font-dm text-[14px] text-white">{projectLookup[projectId] || projectId}</div>
                      <div className="font-space text-[10px] text-brand-muted">{projectId}</div>
                    </td>
                    <td className="px-4 py-3 font-space">{plays}</td>
                    <td className="px-4 py-3 font-space">{wins}</td>
                    <td className="px-4 py-3 font-space">{mean.toFixed(3)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => handleFeedback(projectId, 1, 'reward')}
                          disabled={sendingKey === `${projectId}:reward`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-brand-blue text-brand-black font-space text-[10px] uppercase tracking-[0.18em] hover:bg-white transition-colors disabled:opacity-60"
                        >
                          <ThumbsUp size={12} /> Reward
                        </button>
                        <button
                          onClick={() => handleFeedback(projectId, -1, 'penalty')}
                          disabled={sendingKey === `${projectId}:penalty`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-brand-border text-brand-muted hover:text-white hover:border-brand-blue/50 font-space text-[10px] uppercase tracking-[0.18em] transition-colors disabled:opacity-60"
                        >
                          <ThumbsDown size={12} /> Penalize
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-space text-[10px] uppercase tracking-[0.2em] text-brand-muted">Event log</div>
            <div className="font-bebas text-2xl">Recent suggestions</div>
          </div>
        </div>
        <div className="border border-brand-border rounded-sm divide-y divide-brand-border">
          {(state.log || []).length === 0 && (
            <div className="px-4 py-4 font-space text-[12px] text-brand-muted">No events yet.</div>
          )}
          {(state.log || []).map((entry, idx) => (
            <div key={idx} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-dm text-[13px] text-white truncate">
                  {projectLookup[entry.project_id] || entry.project_id}
                </div>
                <div className="font-space text-[10px] text-brand-muted truncate">
                  {entry.action} · eps {entry.epsilon !== undefined ? entry.epsilon.toFixed(2) : '—'} · {entry.reason || ''}
                </div>
                {entry.email_id && (
                  <div className="font-space text-[10px] text-brand-muted/70">email {entry.email_id}</div>
                )}
              </div>
              <div className="font-space text-[10px] text-brand-muted shrink-0">
                {entry.ts ? new Date(entry.ts).toLocaleString() : ''}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

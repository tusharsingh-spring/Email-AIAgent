import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Activity, Zap, ThumbsUp, ThumbsDown, BarChart2, Loader2, Terminal } from 'lucide-react'
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
      {/* Header */}
      <div className="mb-4">
        <div className="htag mb-4 font-space text-[11px] uppercase tracking-widest text-brand-muted">
          Reinforcement / Bandit Prototype
        </div>
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between mb-8">
          <div>
            <h1 className="font-bebas text-[clamp(38px,6vw,72px)] leading-[0.9] uppercase tracking-[0.02em] text-brand-text">
              Bandit Lab
            </h1>
            <p className="font-dm text-[13px] text-brand-muted max-w-2xl mt-3 leading-relaxed">
              Live view of the ε-greedy recommender that suggests projects for incoming emails. Use this screen
              to explain exploration vs exploitation and to manually reward or penalize arms during the demo.
            </p>
          </div>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm border border-brand-border text-brand-muted font-space text-[11px] uppercase tracking-widest hover:text-white hover:border-brand-blue transition-all"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-brand-blue' : ''} />
            Refresh Data
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        <div className="p-5 border border-brand-border rounded-sm bg-[#0a0a0a] hover:border-brand-blue/30 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="font-space text-[10px] uppercase tracking-[0.2em] text-brand-muted">Epsilon</span>
            <Zap size={14} className="text-brand-blue" />
          </div>
          <div className="font-bebas text-5xl text-white">{state.epsilon?.toFixed(2)}</div>
          <div className="font-space text-[10px] text-brand-muted/70 uppercase tracking-widest mt-1">Exploration rate</div>
        </div>
        <div className="p-5 border border-brand-border rounded-sm bg-[#0a0a0a] hover:border-brand-blue/30 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="font-space text-[10px] uppercase tracking-[0.2em] text-brand-muted">Arms</span>
            <Activity size={14} className="text-brand-blue" />
          </div>
          <div className="font-bebas text-5xl text-white">{arms.length}</div>
          <div className="font-space text-[10px] text-brand-muted/70 uppercase tracking-widest mt-1">Projects Tracked</div>
        </div>
        <div className="p-5 border border-brand-border rounded-sm bg-[#0a0a0a] hover:border-brand-blue/30 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="font-space text-[10px] uppercase tracking-[0.2em] text-brand-muted">Trials</span>
            <BarChart2 size={14} className="text-brand-blue" />
          </div>
          <div className="flex items-baseline gap-2">
            <div className="font-bebas text-5xl text-white">{totalPlays}</div>
            <div className="font-space text-[12px] text-brand-yellow">/ {totalWins} WINS</div>
          </div>
          <div className="font-space text-[10px] text-brand-muted/70 uppercase tracking-widest mt-1">Suggestions served</div>
        </div>
      </div>

      {/* Rewards Table */}
      <div className="mb-12">
        <div className="mb-4">
          <div className="font-space text-[10px] uppercase tracking-[0.2em] text-brand-blue mb-1">Arms</div>
          <div className="font-bebas text-3xl text-white">Project Reward Table</div>
        </div>
        
        {/* overflow-x-auto prevents the table from breaking the layout on mobile */}
        <div className="overflow-x-auto border border-brand-border rounded-sm bg-[#050505]">
          <table className="w-full text-left min-w-[700px]">
            <thead className="bg-[#0a0a0a] border-b border-brand-border text-brand-muted font-space text-[10px] uppercase tracking-[0.2em]">
              <tr>
                <th className="px-5 py-4 whitespace-nowrap">Project</th>
                <th className="px-5 py-4 whitespace-nowrap">Plays</th>
                <th className="px-5 py-4 whitespace-nowrap">Wins</th>
                <th className="px-5 py-4 whitespace-nowrap">Mean</th>
                <th className="px-5 py-4 whitespace-nowrap text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/50">
              {arms.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-brand-muted font-space text-[11px] uppercase tracking-widest">
                    No bandit activity yet. Trigger a suggestion from Inbox.
                  </td>
                </tr>
              )}
              {arms.map(([projectId, st]) => {
                const plays = st.plays || 0
                const wins = st.wins || 0
                const mean = plays > 0 ? wins / plays : 0
                return (
                  <tr key={projectId} className="hover:bg-brand-input/10 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-dm text-[14px] text-white truncate max-w-[250px]">{projectLookup[projectId] || projectId}</div>
                      <div className="font-space text-[9px] text-brand-muted/70 uppercase tracking-widest truncate max-w-[250px]">{projectId}</div>
                    </td>
                    <td className="px-5 py-4 font-space text-[13px] text-brand-muted">{plays}</td>
                    <td className="px-5 py-4 font-space text-[13px] text-brand-muted">{wins}</td>
                    <td className="px-5 py-4 font-space text-[13px] text-brand-yellow">{mean.toFixed(3)}</td>
                    <td className="px-5 py-4">
                      {/* Removed flex-wrap to force side-by-side buttons; container scroll handles overflow */}
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleFeedback(projectId, 1, 'reward')}
                          disabled={!!sendingKey}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-sm bg-brand-blue text-brand-black font-space text-[10px] uppercase tracking-[0.18em] hover:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed w-[100px] justify-center"
                        >
                          {sendingKey === `${projectId}:reward` ? <Loader2 size={12} className="animate-spin" /> : <ThumbsUp size={12} />}
                          Reward
                        </button>
                        <button
                          onClick={() => handleFeedback(projectId, -1, 'penalty')}
                          disabled={!!sendingKey}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-sm border border-brand-border text-brand-muted hover:text-white hover:border-red-500/50 hover:bg-red-500/10 font-space text-[10px] uppercase tracking-[0.18em] transition-all disabled:opacity-50 disabled:cursor-not-allowed w-[100px] justify-center"
                        >
                          {sendingKey === `${projectId}:penalty` ? <Loader2 size={12} className="animate-spin" /> : <ThumbsDown size={12} />}
                          Penalize
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

      {/* Terminal / Event Log */}
      <div>
        <div className="mb-4 flex items-center gap-2">
          <Terminal size={18} className="text-brand-muted" />
          <div>
            <div className="font-bebas text-3xl text-white leading-none">Event Log</div>
          </div>
        </div>
        <div className="border border-brand-border rounded-sm bg-[#050505] overflow-hidden">
          <div className="bg-[#0a0a0a] border-b border-brand-border px-4 py-2 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500/50" />
            <div className="w-2 h-2 rounded-full bg-brand-yellow/50" />
            <div className="w-2 h-2 rounded-full bg-brand-blue/50" />
            <span className="ml-2 font-space text-[9px] uppercase tracking-widest text-brand-muted/70">bandit_process.log</span>
          </div>
          
          <div className="divide-y divide-brand-border/30 max-h-[400px] overflow-y-auto">
            {(state.log || []).length === 0 && (
              <div className="px-5 py-6 font-space text-[11px] uppercase tracking-widest text-brand-muted/50 text-center">
                Awaiting events...
              </div>
            )}
            {(state.log || []).map((entry, idx) => (
              <div key={idx} className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-brand-input/10 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="font-dm text-[13px] text-white truncate">
                    {projectLookup[entry.project_id] || entry.project_id}
                  </div>
                  <div className="font-space text-[10px] text-brand-muted flex items-center gap-2 mt-1">
                    <span className={`px-1.5 py-0.5 rounded-sm text-[8px] ${entry.action === 'reward' ? 'bg-brand-blue/20 text-brand-blue' : entry.action === 'penalty' ? 'bg-red-500/20 text-red-400' : 'bg-brand-border text-brand-muted'}`}>
                      {entry.action}
                    </span>
                    <span className="truncate">
                      eps: {entry.epsilon !== undefined ? entry.epsilon.toFixed(2) : '—'} 
                      {entry.reason ? ` · ${entry.reason}` : ''}
                      {entry.email_id ? ` · email: ${entry.email_id.substring(0,8)}...` : ''}
                    </span>
                  </div>
                </div>
                <div className="font-space text-[9px] text-brand-muted/50 shrink-0 uppercase tracking-widest text-right">
                  {entry.ts ? new Date(entry.ts).toLocaleTimeString() : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
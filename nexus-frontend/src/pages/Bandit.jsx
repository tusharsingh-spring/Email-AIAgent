import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Activity, Zap, ThumbsUp, ThumbsDown, BarChart2, Loader2, Terminal, Target } from 'lucide-react'
import { getBanditState, sendBanditFeedback, getProjects } from '../services/api'
import { useApp } from '../context/AppContext'

// Component: Sleek Stat Card
function StatCard({ title, value, subtitle, icon: Icon, colorClass, loading }) {
  return (
    <div className="bg-[#121214] border border-white/5 hover:border-white/10 rounded-2xl p-6 transition-all duration-300 relative overflow-hidden group shadow-sm hover:shadow-lg">
      {/* Subtle top gradient line */}
      <div className={`absolute top-0 left-0 w-full h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-r from-transparent via-${colorClass.split('-')[1]}-500 to-transparent`} />
      
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-white/5 border border-white/5 ${colorClass}`}>
            <Icon size={16} />
          </div>
          <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">{title}</span>
        </div>
      </div>
      
      <div className="flex flex-col">
        <div className="font-sans text-4xl sm:text-5xl font-bold text-white tracking-tight mb-1 truncate">
          {loading ? <Loader2 size={24} className="animate-spin text-zinc-600 my-2" /> : value}
        </div>
        <div className="font-sans text-sm text-zinc-400 font-medium truncate">
          {subtitle}
        </div>
      </div>
    </div>
  )
}

export default function Bandit() {
  const { toast } = useApp() || {}
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState({ epsilon: 0.2, stats: {}, log: [] })
  const [projects, setProjects] = useState([])
  const [sendingKey, setSendingKey] = useState('')
  const [mounted, setMounted] = useState(false)

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
    setMounted(true)
    const id = setInterval(refresh, 6000)
    return () => clearInterval(id)
  }, [])

  const handleFeedback = async (projectId, reward, eventLabel) => {
    setSendingKey(`${projectId}:${eventLabel}`)
    try {
      await sendBanditFeedback(projectId, reward, null, eventLabel)
      toast?.('Feedback recorded successfully', 'ok')
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
    <div className="min-h-screen pb-24 font-sans text-zinc-100 selection:bg-blue-500/30 pt-10">
      
      {/* ── HEADER ── */}
      <div className={`max-w-6xl mx-auto px-6 lg:px-8 mb-10 transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <div className="font-mono text-[11px] text-zinc-500 uppercase tracking-widest mb-3 font-bold flex items-center gap-2">
          <Target size={14} className="text-blue-400" /> Reinforcement Learning
        </div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="font-sans text-4xl sm:text-5xl font-bold tracking-tight text-white mb-3">
              Bandit Router Engine
            </h1>
            <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
              Live view of the ε-greedy recommendation system. Monitor exploration versus exploitation rates, track arm performance, and manually provide reinforcement feedback to tune the model.
            </p>
          </div>
          
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-sm font-semibold text-zinc-300 transition-all disabled:opacity-50 shadow-sm shrink-0"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-blue-400' : 'text-zinc-400'} />
            Synchronize Data
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 lg:px-8 w-full">
        
        {/* ── STATS ROW ── */}
        <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 transition-all duration-700 delay-100 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <StatCard 
            title="Epsilon (ε)" 
            value={state.epsilon?.toFixed(2)} 
            subtitle="Current exploration rate"
            icon={Zap}
            colorClass="text-blue-400"
            loading={loading}
          />
          <StatCard 
            title="Active Arms" 
            value={arms.length} 
            subtitle="Monitored workspaces"
            icon={Activity}
            colorClass="text-purple-400"
            loading={loading}
          />
          <StatCard 
            title="Total Yield" 
            value={totalPlays} 
            subtitle={`${totalWins} successful conversions`}
            icon={BarChart2}
            colorClass="text-emerald-400"
            loading={loading}
          />
        </div>

        {/* ── REWARD TABLE ── */}
        <div className={`mb-12 transition-all duration-700 delay-200 ease-out w-full ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Reward Distribution</h2>
              <p className="text-sm text-zinc-500 mt-1">Performance metrics for currently tracked project arms.</p>
            </div>
          </div>
          
          <div className="bg-[#121214] border border-white/10 rounded-2xl overflow-hidden shadow-xl w-full">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left min-w-[800px]">
                <thead className="bg-white/[0.02] border-b border-white/10">
                  <tr>
                    <th className="px-6 py-4 text-xs font-mono uppercase tracking-widest text-zinc-500 font-semibold w-1/3">Target Workspace</th>
                    <th className="px-6 py-4 text-xs font-mono uppercase tracking-widest text-zinc-500 font-semibold">Trials</th>
                    <th className="px-6 py-4 text-xs font-mono uppercase tracking-widest text-zinc-500 font-semibold">Wins</th>
                    <th className="px-6 py-4 text-xs font-mono uppercase tracking-widest text-zinc-500 font-semibold">Mean Score</th>
                    <th className="px-6 py-4 text-xs font-mono uppercase tracking-widest text-zinc-500 font-semibold text-right">Manual Feedback</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {arms.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-16 text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/5 mb-4">
                          <Activity size={20} className="text-zinc-500" />
                        </div>
                        <div className="text-sm font-medium text-zinc-400">No active tracking data.</div>
                        <div className="text-xs text-zinc-500 mt-1">Initialize pipeline to generate recommendations.</div>
                      </td>
                    </tr>
                  ) : (
                    arms.map(([projectId, st]) => {
                      const plays = st.plays || 0
                      const wins = st.wins || 0
                      const mean = plays > 0 ? wins / plays : 0
                      
                      // Calculate progress bar width
                      const pct = Math.min(100, Math.max(0, mean * 100))

                      return (
                        <tr key={projectId} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="px-6 py-4 min-w-0">
                            <div className="text-sm font-semibold text-white truncate max-w-[280px]">
                              {projectLookup[projectId] || 'Unknown Project'}
                            </div>
                            <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest truncate mt-1">
                              ID: {projectId.slice(0,8)}...
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono text-sm text-zinc-300">{plays}</td>
                          <td className="px-6 py-4 font-mono text-sm text-zinc-300">{wins}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-sm font-semibold text-blue-400 w-12">{mean.toFixed(3)}</span>
                              <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden hidden sm:block">
                                <div 
                                  className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out" 
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleFeedback(projectId, 1, 'reward')}
                                disabled={!!sendingKey}
                                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white border border-emerald-500/20 font-sans text-xs font-semibold transition-all disabled:opacity-50 w-[110px]"
                              >
                                {sendingKey === `${projectId}:reward` ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
                                Reward
                              </button>
                              <button
                                onClick={() => handleFeedback(projectId, -1, 'penalty')}
                                disabled={!!sendingKey}
                                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white border border-rose-500/20 font-sans text-xs font-semibold transition-all disabled:opacity-50 w-[110px]"
                              >
                                {sendingKey === `${projectId}:penalty` ? <Loader2 size={14} className="animate-spin" /> : <ThumbsDown size={14} />}
                                Penalize
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── EVENT LOG ── */}
        <div className={`transition-all duration-700 delay-300 ease-out w-full ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="flex items-center gap-3 mb-6">
            <Terminal size={20} className="text-zinc-500" />
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">System Event Log</h2>
            </div>
          </div>
          
          {/* Strictly contained parent container */}
          <div className="bg-[#121214] border border-white/10 rounded-2xl overflow-hidden shadow-lg w-full flex flex-col">
            {/* Fake Mac Terminal Header */}
            <div className="bg-[#1a1a1c] border-b border-white/5 px-4 py-3 flex items-center gap-2 shrink-0">
              <div className="w-3 h-3 rounded-full bg-rose-500/80" />
              <div className="w-3 h-3 rounded-full bg-amber-500/80" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
              <span className="ml-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500 font-semibold truncate">bandit_kernel.log</span>
            </div>
            
            {/* Scrollable Log Container */}
            <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto overflow-x-hidden custom-scrollbar bg-[#0a0a0a] w-full">
              {(state.log || []).length === 0 ? (
                <div className="px-6 py-12 flex flex-col items-center justify-center">
                  <Terminal size={24} className="text-zinc-600 mb-3" />
                  <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">Awaiting log streams...</span>
                </div>
              ) : (
                (state.log || []).map((entry, idx) => (
                  <div key={idx} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors w-full">
                    {/* Log Content - Enforced min-w-0 to prevent flex blowout */}
                    <div className="min-w-0 flex-1 flex flex-col">
                      <div className="flex items-center gap-3 mb-1.5 min-w-0">
                        <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-widest font-bold ${
                          entry.action === 'reward' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                          entry.action === 'penalty' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 
                          'bg-white/5 text-zinc-400 border border-white/10'
                        }`}>
                          {entry.action}
                        </span>
                        <span className="font-sans text-sm font-semibold text-white truncate">
                          {projectLookup[entry.project_id] || entry.project_id}
                        </span>
                      </div>
                      
                      <div className="font-mono text-[11px] text-zinc-500 flex flex-wrap items-center gap-2 mt-0.5 min-w-0">
                        <span className="text-blue-400/80 shrink-0">ε: {entry.epsilon !== undefined ? entry.epsilon.toFixed(2) : '—'}</span>
                        
                        {entry.reason && (
                          <div className="flex items-center gap-2 min-w-0 max-w-full">
                            <span className="w-1 h-1 rounded-full bg-zinc-700 shrink-0" />
                            <span className="truncate">{entry.reason}</span>
                          </div>
                        )}
                        
                        {entry.email_id && (
                          <div className="flex items-center gap-2 min-w-0 shrink-0">
                            <span className="w-1 h-1 rounded-full bg-zinc-700 shrink-0" />
                            <span className="truncate">REQ_ID: {entry.email_id.substring(0,8)}...</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Timestamp */}
                    <div className="font-mono text-[10px] text-zinc-500 shrink-0 uppercase tracking-widest bg-white/5 px-2 py-1 rounded w-fit self-start sm:self-auto">
                      {entry.ts ? new Date(entry.ts).toLocaleTimeString() : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'
import { Activity, MailQuestion, Calendar as CalIcon, ArrowRight, Layers, Loader2, CheckCircle2, Sparkles, Upload, FolderKanban, Inbox, Map, ChevronRight, AlertTriangle, Cpu, X } from 'lucide-react'
import { getActionsBySections, getPendingClusters, approveAction, editDraft, rejectAction, getStats, getSummary, scanIngest, forceRecluster } from '../services/api'

// --- HELPER: Greeting ---
function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// --- HOOK: Number Counter ---
function useCountUp(target, duration = 800) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!target) return
    let start = 0
    const step = Math.ceil(target / (duration / 16))
    const timer = setInterval(() => {
      start += step
      if (start >= target) { setCount(target); clearInterval(timer) }
      else setCount(start)
    }, 16)
    return () => clearInterval(timer)
  }, [target, duration])
  return count
}

export default function Dashboard() {
  const appState = useApp() || {}
  const { state = { stats: {}, actions: [] }, toast = () => {} } = appState
  const { stats: globalStats } = state
  const navigate = useNavigate()

  const [sections, setSections] = useState({})
  const [clusters, setClusters] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [draftEdits, setDraftEdits] = useState({})
  const [approvingId, setApprovingId] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [dismissing, setDismissing] = useState({})
  const [stats, setStats] = useState({})
  const [ready, setReady] = useState(false)
  const [digest, setDigest] = useState('')
  const [busy, setBusy] = useState({ ingest: false, recluster: false })

  useEffect(() => {
    setTimeout(() => setReady(true), 150)
    getActionsBySections().then(d => setSections(d || {})).catch(console.error)
    getPendingClusters().then(d => setClusters(d || [])).catch(console.error)
    getStats().then(d => setStats(d || {})).catch(() => {})
    getSummary().then(d => setDigest(d?.summary || '')).catch(() => {})
  }, [])

  const allPending = Object.values(sections).filter(Array.isArray).flat()
  const escalations = Array.isArray(sections['Escalation']) ? sections['Escalation'] : []

  const processedCount = useCountUp(stats.total_processed || globalStats?.total_processed || 0)
  const meetingsCount  = useCountUp(stats.total_meetings  || globalStats?.total_meetings  || 0)
  const brdsCount      = useCountUp(stats.brds_generated  || globalStats?.brds_generated  || 0)

  const handleApprove = async (action, originalDraft) => {
    const id = action.action_id
    setApprovingId(id)
    try {
      const finalDraft = draftEdits[id] !== undefined ? draftEdits[id] : originalDraft
      if (draftEdits[id] !== undefined) await editDraft(id, { final_response: finalDraft })
      await approveAction(id, { final_response: finalDraft })
      toast('✓ Reply Sent', 'ok')
      triggerDismiss(id, 'up')
    } catch {
      toast('Failed to approve', 'warn')
    }
    setApprovingId(null)
  }

  const handleReject = async (id) => {
    setRejectingId(id)
    try {
      await rejectAction(id)
      toast('✕ Draft Rejected', 'ok')
      triggerDismiss(id, 'right')
    } catch { console.error('reject failed') }
    setRejectingId(null)
  }

  const triggerDismiss = (id, direction) => {
    setDismissing(prev => ({ ...prev, [id]: direction }))
    setTimeout(() => {
      setSections(prev => {
        const next = { ...prev }
        for (let key in next) next[key] = next[key].filter(a => a.action_id !== id)
        return next
      })
      setExpandedId(null)
      setDismissing(prev => { const n = { ...prev }; delete n[id]; return n })
    }, 320)
  }

  const statTags = [
    { label: 'Processed', value: processedCount, icon: Activity, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20' },
    { label: 'Meetings', value: meetingsCount, icon: CalIcon, color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' },
    ...(brdsCount > 0 ? [{ label: 'BRDs', value: brdsCount, icon: CheckCircle2, color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20' }] : []),
    ...(escalations.length > 0 ? [{ label: 'Urgent', value: escalations.length, icon: MailQuestion, color: 'text-rose-400', bg: 'bg-rose-400/10', border: 'border-rose-400/20' }] : []),
    ...(clusters.length > 0 ? [{ label: 'Clusters', value: clusters.length, icon: Layers, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' }] : []),
  ]

  const quickLinks = [
    { label: 'Inbox', path: '/inbox', icon: Inbox },
    { label: 'Projects', path: '/projects', icon: FolderKanban },
    { label: 'Upload Data', path: '/upload', icon: Upload },
    { label: 'Project Map', path: '/map', icon: Map },
    { label: 'Calendar', path: '/calendar', icon: CalIcon },
  ]

  const handleIngest = async () => {
    setBusy(b => ({ ...b, ingest: true }))
    try { await scanIngest(); toast('Manual ingest triggered', 'ok') } catch { toast('Ingest failed', 'warn') }
    setBusy(b => ({ ...b, ingest: false }))
  }

  const handleRecluster = async () => {
    setBusy(b => ({ ...b, recluster: true }))
    try { await forceRecluster(10); toast('Recluster started', 'ok') } catch { toast('Recluster failed', 'warn') }
    setBusy(b => ({ ...b, recluster: false }))
  }

  return (
    <div className={`min-h-screen pb-24 font-sans text-zinc-100 selection:bg-blue-500/30 transition-all duration-700 ease-out pt-10 ${ready ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      
      <div className="max-w-[1400px] mx-auto px-6 lg:px-8">
        
        {/* ─── HERO SECTION ─── */}
        <div className="mb-14">
          <div className="font-mono text-[11px] text-blue-400 uppercase tracking-widest mb-3 font-bold flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" /> Command Center
          </div>
          
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-4">
            {getGreeting()}
          </h1>
          
          <p className="text-lg text-zinc-400 max-w-3xl mb-8 leading-relaxed">
            {allPending.length > 0
              ? `I've drafted ${allPending.length} ${allPending.length === 1 ? 'reply' : 'replies'} for your review${escalations.length > 0 ? `, flagged ${escalations.length} urgent escalation${escalations.length > 1 ? 's' : ''}` : ''}${clusters.length > 0 ? `, and found ${clusters.length} project cluster${clusters.length > 1 ? 's' : ''}` : ''}.`
              : `All clear. No pending actions right now — you're fully caught up.`
            }
          </p>

          <div className="flex flex-wrap gap-3 mb-10">
            {quickLinks.map(({ label, path, icon: Icon }) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm font-semibold text-zinc-300 hover:bg-white/10 hover:text-white transition-all active:scale-95 shadow-sm"
              >
                <Icon size={16} className="text-blue-400" /> {label}
              </button>
            ))}
          </div>

          {/* Quick Stats Row */}
          <div className="flex flex-wrap gap-4">
            {statTags.map(({ label, value, icon: Icon, color, bg, border }) => (
              <div
                key={label}
                className={`flex items-center gap-4 px-5 py-3 rounded-xl border ${bg} ${border} backdrop-blur-sm group hover:scale-105 transition-transform`}
              >
                <div className={`p-2 rounded-lg bg-black/20 ${color}`}>
                  <Icon size={18} />
                </div>
                <div className="flex flex-col">
                  <span className={`text-xl font-bold ${color} leading-none mb-1`}>{value}</span>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 font-bold">{label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── OPERATIONS BAR ─── */}
        <div className="grid lg:grid-cols-3 gap-6 mb-16">
          
          {/* AI Digest Card */}
          <div className="bg-[#121214] p-8 rounded-2xl border border-white/10 shadow-xl relative overflow-hidden group flex flex-col hover:border-purple-500/30 transition-colors">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500/0 via-purple-500/50 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <Sparkles size={80} className="text-purple-400" />
            </div>
            
            <div className="flex items-center gap-2 mb-4 font-mono text-[11px] uppercase tracking-widest text-purple-400 font-bold">
              <Sparkles size={14} /> AI Digest
            </div>
            <p className="text-sm leading-relaxed text-zinc-300 min-h-[80px] relative z-10 flex-1">
              {digest || 'No summary yet — process a few emails to generate today’s digest.'}
            </p>
            <button
              onClick={() => navigate('/actions')}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-purple-500/10 text-purple-400 hover:bg-purple-500 hover:text-white rounded-lg text-xs font-bold transition-colors w-fit"
            >
              Review Actions <ChevronRight size={14} />
            </button>
          </div>

          {/* Pipeline Controls */}
          <div className="bg-[#121214] p-8 rounded-2xl border border-white/10 shadow-xl flex flex-col hover:border-blue-500/30 transition-colors group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500/0 via-blue-500/50 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center justify-between mb-6">
              <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 font-bold">System Pipelines</span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-emerald-400 font-bold bg-emerald-400/10 px-2 py-1 rounded border border-emerald-400/20">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
              </span>
            </div>
            
            <div className="flex flex-col gap-3 mb-4">
              <button
                onClick={handleIngest}
                disabled={busy.ingest}
                className="w-full flex justify-between items-center py-3 px-5 bg-white/[0.03] hover:bg-blue-500/10 border border-white/5 hover:border-blue-500/30 rounded-xl text-sm font-semibold text-zinc-300 hover:text-white transition-all disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  {busy.ingest ? <Loader2 size={16} className="animate-spin text-blue-400" /> : <Cpu size={16} className="text-blue-400" />} 
                  Ingest Data Streams
                </div>
                <ArrowRight size={16} className="text-zinc-600" />
              </button>
              
              <button
                onClick={handleRecluster}
                disabled={busy.recluster}
                className="w-full flex justify-between items-center py-3 px-5 bg-white/[0.03] hover:bg-amber-500/10 border border-white/5 hover:border-amber-500/30 rounded-xl text-sm font-semibold text-zinc-300 hover:text-white transition-all disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  {busy.recluster ? <Loader2 size={16} className="animate-spin text-amber-400" /> : <Layers size={16} className="text-amber-400" />}
                  Force Recluster
                </div>
                <ArrowRight size={16} className="text-zinc-600" />
              </button>
            </div>
            
            <p className="text-xs text-zinc-500 mt-auto leading-relaxed">
              Manually kick off data ingestion or recluster queued items if the context feels stale.
            </p>
          </div>

          {/* Queue Snapshot */}
          <div className="bg-[#121214] p-8 rounded-2xl border border-white/10 shadow-xl flex flex-col hover:border-emerald-500/30 transition-colors group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500/0 via-emerald-500/50 to-emerald-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 font-bold mb-6 block">Queue Snapshot</span>
            
            <div className="grid grid-cols-2 gap-4 mb-6 flex-1">
              <div className="flex flex-col items-center justify-center p-4 bg-white/[0.03] border border-white/5 rounded-xl">
                <div className="text-3xl font-bold text-white mb-1">{allPending.length}</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Pending</div>
              </div>
              <div className="flex flex-col items-center justify-center p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                <div className="text-3xl font-bold text-rose-400 mb-1">{escalations.length}</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-rose-500 font-bold">Urgent</div>
              </div>
            </div>
            
            <button
              onClick={() => navigate('/escalations')}
              className="mt-auto inline-flex items-center justify-center w-full gap-2 px-4 py-2.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-lg text-xs font-bold transition-colors"
            >
              Open Queues <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* ─── CLUSTER SUGGESTIONS ─── */}
        {clusters.length > 0 && (
          <div className="mb-16">
            <div className="flex items-center gap-4 mb-6">
              <span className="font-mono text-sm text-amber-400 font-bold bg-amber-400/10 border border-amber-400/20 px-3 py-1 rounded-lg">01</span>
              <h2 className="text-2xl font-bold text-white tracking-tight">Project Clusters Found</h2>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              {clusters.map((c, i) => (
                <div
                  key={i}
                  className="bg-[#121214] border border-white/10 p-8 rounded-2xl shadow-xl hover:border-amber-500/50 transition-all group cursor-pointer"
                  onClick={() => navigate('/projects')}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400 font-bold bg-amber-400/10 px-3 py-1.5 rounded-lg border border-amber-400/20">
                      <Sparkles size={12} className="inline mr-2 -mt-0.5" /> Suggested Cluster
                    </div>
                    <span className="font-mono text-xs font-bold text-zinc-500">{c.email_ids?.length || 0} Items</span>
                  </div>
                  
                  <h3 className="text-2xl font-bold text-white mb-6 group-hover:text-amber-400 transition-colors line-clamp-1">
                    {c.suggested_title || 'Untitled Cluster'}
                  </h3>
                  
                  {c.email_ids?.length > 0 && (
                    <div className="flex overflow-x-auto no-scrollbar gap-2 pb-2 mb-6">
                      {c.email_ids.map((id, idx) => (
                        <div key={idx} className="whitespace-nowrap px-3 py-1.5 bg-white/5 text-zinc-400 rounded-md border border-white/5 font-mono text-[10px] uppercase tracking-widest font-bold shrink-0">
                          Thread #{id.slice(0,6)}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="text-sm font-bold text-zinc-500 group-hover:text-amber-400 transition-colors flex items-center gap-2 border-t border-white/5 pt-6">
                    Review in Project Studio <ArrowRight size={16} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── NEEDS APPROVAL ─── */}
        <div className="mb-12">
          <div className="flex items-center gap-4 mb-6">
            <span className="font-mono text-sm text-blue-400 font-bold bg-blue-400/10 border border-blue-400/20 px-3 py-1 rounded-lg">
              {clusters.length > 0 ? '02' : '01'}
            </span>
            <h2 className="text-2xl font-bold text-white tracking-tight">Requires Review</h2>
          </div>

          {allPending.length === 0 ? (
            <div className="bg-[#121214] border border-white/10 rounded-2xl py-24 text-center shadow-xl">
              <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 size={32} className="text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">All Clear</h3>
              <p className="text-sm text-zinc-500">No pending actions require your attention right now.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {Object.entries(sections).map(([sectionName, sectActions]) => {
                if (!Array.isArray(sectActions) || sectActions.length === 0) return null
                const isEscalation = sectionName === 'Escalation'

                return (
                  <div key={sectionName} className="bg-[#121214] border border-white/10 rounded-2xl shadow-xl overflow-hidden">
                    
                    {/* Section Header */}
                    <div className={`px-8 py-5 border-b ${isEscalation ? 'border-rose-500/20 bg-rose-500/5' : 'border-white/5 bg-white/[0.02]'} flex items-center justify-between`}>
                      <div className="flex items-center gap-3">
                        {isEscalation && <AlertTriangle size={18} className="text-rose-400" />}
                        <h3 className={`font-mono text-[12px] uppercase tracking-widest font-bold ${isEscalation ? 'text-rose-400' : 'text-blue-400'}`}>
                          {sectionName}
                        </h3>
                      </div>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5 font-bold">
                        {sectActions.length} Pending
                      </span>
                    </div>

                    <div className="divide-y divide-white/5">
                      {sectActions.map((action, i) => {
                        const intent = action.agent_state?.intent?.category || action.action_type || 'General'
                        const isExpanded = expandedId === action.action_id
                        const isDismissing = dismissing[action.action_id]
                        const draftText = draftEdits[action.action_id] !== undefined
                          ? draftEdits[action.action_id]
                          : (action.agent_state?.final_response || '')
                        const snippet = action.email_context?.body_snippet || action.email_context?.body || ''

                        return (
                          <div
                            key={action.action_id}
                            className={`relative transition-all duration-300 bg-transparent ${isExpanded ? 'bg-white/[0.02]' : 'hover:bg-white/[0.02]'}`}
                            style={{
                              transform: isDismissing === 'up' ? 'translateY(-10px)' : isDismissing === 'right' ? 'translateX(20px)' : 'none',
                              opacity: isDismissing ? 0 : 1,
                            }}
                            onClick={() => !isExpanded && setExpandedId(action.action_id)}
                          >
                            {isEscalation && (
                              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-rose-500" />
                            )}

                            {/* Row Header (Always Visible) */}
                            <div className={`p-6 md:px-8 ${isExpanded ? 'pb-4' : ''} cursor-pointer flex flex-col md:flex-row gap-6`}>
                              
                              <div className="pt-1 w-8 shrink-0 font-mono text-sm text-zinc-600 font-bold">
                                {String(i + 1).padStart(2, '0')}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-4 mb-2 flex-wrap">
                                  <h4 className="text-lg font-bold text-white truncate">
                                    {action.email_context?.sender_name || action.email_context?.sender || 'Unknown Sender'}
                                  </h4>
                                  <span className={`font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-md border font-bold ${
                                    isEscalation ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                                  }`}>
                                    {intent.replace(/_/g, ' ')}
                                  </span>
                                </div>
                                
                                {action.email_context?.subject && (
                                  <div className="text-sm text-zinc-400 font-semibold truncate mb-2">
                                    Sub: {action.email_context.subject}
                                  </div>
                                )}
                                
                                {!isExpanded && snippet && (
                                  <p className="text-sm text-zinc-500 line-clamp-2 mt-2 leading-relaxed max-w-4xl">
                                    {snippet}
                                  </p>
                                )}

                                {!isExpanded && (
                                  <div className="mt-4 font-mono text-[10px] text-blue-400 uppercase tracking-widest font-bold flex items-center gap-2">
                                    Click to review AI draft <ArrowRight size={12} />
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Expanded Content */}
                            <div 
                              className="grid transition-all duration-300 ease-in-out"
                              style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
                            >
                              <div className="overflow-hidden">
                                <div className="pl-6 md:pl-20 pr-6 md:pr-8 pb-8 pt-2 cursor-default" onClick={e => e.stopPropagation()}>
                                  
                                  <div className="grid lg:grid-cols-2 gap-8 mt-4 mb-8">
                                    
                                    {/* Original Context */}
                                    <div>
                                      <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-3 font-bold flex items-center gap-2">
                                        <MailQuestion size={14} /> Received Message
                                      </div>
                                      <div className="font-sans text-sm text-zinc-300 leading-relaxed bg-[#0a0a0a] border border-white/5 p-6 rounded-xl max-h-80 overflow-y-auto custom-scrollbar whitespace-pre-wrap shadow-inner">
                                        {snippet || 'No content available.'}
                                      </div>
                                    </div>

                                    {/* AI Draft Editor */}
                                    <div className="flex flex-col">
                                      <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-400 mb-3 font-bold flex items-center justify-between">
                                        <span className="flex items-center gap-2"><Cpu size={14} /> AI Drafted Response</span>
                                        <span className="text-zinc-500">Editable</span>
                                      </div>
                                      <textarea
                                        className="flex-1 w-full min-h-[200px] bg-[#0a0a0a] font-sans text-sm text-white leading-relaxed border border-white/10 p-6 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-transparent resize-none shadow-inner custom-scrollbar"
                                        value={draftText}
                                        onChange={e => setDraftEdits(prev => ({ ...prev, [action.action_id]: e.target.value }))}
                                      />
                                    </div>
                                  </div>

                                  {isEscalation && (
                                    <div className="mb-8 p-5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-4">
                                      <AlertTriangle size={24} className="text-rose-400 shrink-0" />
                                      <div>
                                        <h5 className="font-sans text-base font-bold text-rose-400 mb-1">Human Judgment Required</h5>
                                        <p className="text-sm text-rose-300/80 leading-relaxed">
                                          The AI flagged this thread because it requires authorization, nuanced tone, or falls outside the standard operating procedure. Please edit the draft above to finalize the response.
                                        </p>
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex items-center justify-between flex-wrap gap-4 pt-6 border-t border-white/5">
                                    <div className="flex items-center gap-4">
                                      <button
                                        onClick={e => { e.stopPropagation(); handleApprove(action, action.agent_state?.final_response || '') }}
                                        disabled={!!approvingId}
                                        className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg text-sm font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50 min-w-[160px]"
                                      >
                                        {approvingId === action.action_id
                                          ? <><Loader2 size={16} className="animate-spin" /> Sending...</>
                                          : <>{isEscalation ? 'Approve & Send' : 'Approve & Send'} <ArrowRight size={16} /></>
                                        }
                                      </button>

                                      <button
                                        onClick={e => { e.stopPropagation(); handleReject(action.action_id) }}
                                        disabled={!!rejectingId}
                                        className="px-6 py-3 text-sm font-bold border border-rose-500/30 text-rose-400 hover:bg-rose-500 hover:text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                                      >
                                        {rejectingId === action.action_id ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                                        Reject
                                      </button>
                                    </div>

                                    <button
                                      onClick={e => { e.stopPropagation(); setExpandedId(null) }}
                                      className="px-6 py-3 text-sm font-bold text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                                    >
                                      Close View
                                    </button>
                                  </div>

                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
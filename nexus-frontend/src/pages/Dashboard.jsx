import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'
import { Activity, MailQuestion, Calendar as CalIcon, ArrowRight, Layers, Loader2, CheckCircle2, XCircle, Sparkles, Upload, FolderKanban, Inbox, Map, ChevronRight, AlertTriangle, Cpu } from 'lucide-react'
import { getActionsBySections, getPendingClusters, approveAction, editDraft, rejectAction, getStats, getSummary, scanIngest, forceRecluster } from '../services/api'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

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
    { label: 'Meetings', value: meetingsCount, icon: CalIcon, color: 'text-teal-400', bg: 'bg-teal-400/10', border: 'border-teal-400/20' },
    ...(brdsCount > 0 ? [{ label: 'BRDs', value: brdsCount, icon: CheckCircle2, color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20' }] : []),
    ...(escalations.length > 0 ? [{ label: 'Escalations', value: escalations.length, icon: MailQuestion, color: 'text-rose-400', bg: 'bg-rose-400/10', border: 'border-rose-400/20' }] : []),
    ...(clusters.length > 0 ? [{ label: 'Clusters', value: clusters.length, icon: Layers, color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' }] : []),
  ]

  const quickLinks = [
    { label: 'Inbox', path: '/inbox', icon: Inbox },
    { label: 'Projects', path: '/projects', icon: FolderKanban },
    { label: 'Upload Context', path: '/upload', icon: Upload },
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
    <div className={`min-h-screen pb-24 font-sans text-zinc-100 selection:bg-blue-500/30 transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'}`}>
      
      <div className="max-w-6xl mx-auto pt-12 px-6 lg:px-8">
        
        {/* ─── HERO ─── */}
        <div className="mb-12">
          <div className="font-mono text-[11px] text-zinc-500 uppercase tracking-widest mb-2 font-medium">Command Center / Daily Briefing</div>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white mb-4">
            {getGreeting()}
          </h1>
          
          <p className="text-lg text-zinc-400 max-w-2xl mb-8 leading-relaxed">
            {allPending.length > 0
              ? `I've drafted ${allPending.length} ${allPending.length === 1 ? 'reply' : 'replies'} for your review${escalations.length > 0 ? `, flagged ${escalations.length} urgent escalation${escalations.length > 1 ? 's' : ''}` : ''}${clusters.length > 0 ? `, and found ${clusters.length} project cluster${clusters.length > 1 ? 's' : ''}` : ''}.`
              : `All clear. No pending actions right now — you're fully caught up.`
            }
          </p>

          <div className="flex flex-wrap gap-3 mb-8">
            {quickLinks.map(({ label, path, icon: Icon }) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm font-medium text-zinc-300 hover:bg-white/10 hover:text-white transition-colors active:scale-95"
              >
                <Icon size={14} className="text-zinc-400" /> {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            {statTags.map(({ label, value, icon: Icon, color, bg, border }) => (
              <div
                key={label}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${bg} ${border} backdrop-blur-sm`}
              >
                <Icon size={16} className={color} />
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-lg font-semibold ${color} leading-none`}>{value}</span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 font-medium">{label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── OPERATIONS BAR ─── */}
        <div className="grid lg:grid-cols-3 gap-6 mb-16">
          
          <div className="bg-[#121214] p-6 rounded-2xl border border-white/10 shadow-xl relative overflow-hidden group flex flex-col">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <Sparkles size={64} className="text-purple-400" />
            </div>
            <div className="flex items-center gap-2 mb-4 font-mono text-[11px] uppercase tracking-widest text-purple-400 font-medium">
              <Sparkles size={14} /> AI Digest
            </div>
            <p className="text-sm leading-relaxed text-zinc-400 min-h-[60px] relative z-10 flex-1">
              {digest || 'No summary yet — process a few emails to generate today’s digest.'}
            </p>
            <button
              onClick={() => navigate('/actions')}
              className="mt-4 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-purple-400 hover:text-purple-300 transition-colors font-medium w-fit"
            >
              Review Actions <ChevronRight size={14} />
            </button>
          </div>

          <div className="bg-[#121214] p-6 rounded-2xl border border-white/10 shadow-xl flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 font-medium">Pipelines</span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-emerald-400 font-medium bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/20">
                Live
              </span>
            </div>
            
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={handleIngest}
                disabled={busy.ingest}
                className="flex-1 flex justify-center items-center gap-2 py-2.5 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-medium text-zinc-300 transition-all disabled:opacity-50"
              >
                {busy.ingest ? <Loader2 size={14} className="animate-spin text-blue-400" /> : <Cpu size={14} className="text-blue-400" />} 
                Ingest Data
              </button>
              <button
                onClick={handleRecluster}
                disabled={busy.recluster}
                className="flex-1 flex justify-center items-center gap-2 py-2.5 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-medium text-zinc-300 transition-all disabled:opacity-50"
              >
                {busy.recluster ? <Loader2 size={14} className="animate-spin text-blue-400" /> : <Layers size={14} className="text-blue-400" />}
                Recluster
              </button>
            </div>
            
            <p className="text-xs text-zinc-500 mt-auto leading-relaxed">
              Manually kick off ingestion or recluster queued items if data feels stale.
            </p>
          </div>

          <div className="bg-[#121214] p-6 rounded-2xl border border-white/10 shadow-xl flex flex-col">
            <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 font-medium mb-4 block">Queue Snapshot</span>
            
            <div className="grid grid-cols-3 gap-3 mb-4 flex-1">
              <div className="flex flex-col items-center justify-center p-3 bg-white/5 border border-white/5 rounded-xl">
                <div className="text-2xl font-semibold text-white">{allPending.length}</div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 mt-1">Pending</div>
              </div>
              <div className="flex flex-col items-center justify-center p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                <div className="text-2xl font-semibold text-rose-400">{escalations.length}</div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-rose-500 mt-1">Urgent</div>
              </div>
              <div className="flex flex-col items-center justify-center p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <div className="text-2xl font-semibold text-emerald-400">{clusters.length}</div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-emerald-500 mt-1">Clusters</div>
              </div>
            </div>
            
            <button
              onClick={() => navigate('/escalations')}
              className="mt-auto inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-zinc-400 hover:text-white transition-colors font-medium w-fit"
            >
              Open Queues <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* ─── CLUSTER SUGGESTIONS ─── */}
        {clusters.length > 0 && (
          <div className="mb-16">
            <div className="flex items-center gap-4 mb-6">
              <span className="font-mono text-sm text-emerald-400 font-semibold bg-emerald-400/10 border border-emerald-400/20 px-2 py-1 rounded">01</span>
              <h2 className="text-2xl font-semibold text-white tracking-tight">Project Clustering</h2>
            </div>
            
            <div className="grid md:grid-cols-2 gap-5">
              {clusters.map((c, i) => (
                <div
                  key={i}
                  className="bg-[#121214] border border-white/10 p-6 rounded-2xl shadow-lg hover:border-emerald-500/30 transition-colors group cursor-pointer"
                  onClick={() => navigate('/projects')}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-400 font-medium bg-emerald-400/10 px-2 py-1 rounded border border-emerald-400/20">
                      <Sparkles size={12} className="inline mr-1 -mt-0.5" /> Suggested Cluster
                    </div>
                    <span className="text-sm font-medium text-zinc-500">{c.email_ids?.length || 0} Items</span>
                  </div>
                  
                  <h3 className="text-xl font-semibold text-white mb-4 group-hover:text-emerald-400 transition-colors">
                    {c.suggested_title || 'Untitled Cluster'}
                  </h3>
                  
                  {c.email_ids?.length > 0 && (
                    <div className="flex overflow-x-auto no-scrollbar gap-2 pb-2 mb-4 -mx-1 px-1 mask-edges">
                      {c.email_ids.map((id, idx) => (
                        <div key={idx} className="whitespace-nowrap px-2.5 py-1 bg-white/5 text-zinc-400 rounded border border-white/5 font-mono text-[10px] uppercase tracking-wider shrink-0">
                          Thread #{id.slice(0,6)}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="text-sm font-medium text-zinc-400 group-hover:text-emerald-400 transition-colors flex items-center gap-1.5 mt-2">
                    Review in Project Studio <ArrowRight size={14} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── NEEDS APPROVAL ─── */}
        <div className="mb-12">
          <div className="flex items-center gap-4 mb-6">
            <span className="font-mono text-sm text-blue-400 font-semibold bg-blue-400/10 border border-blue-400/20 px-2 py-1 rounded">
              {clusters.length > 0 ? '02' : '01'}
            </span>
            <h2 className="text-2xl font-semibold text-white tracking-tight">Needs Approval</h2>
          </div>

          {allPending.length === 0 ? (
            <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl py-24 text-center shadow-xl">
              <div className="w-16 h-16 bg-white/5 border border-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} className="text-zinc-600" />
              </div>
              <h3 className="text-lg font-medium text-zinc-300 mb-1">All Clear</h3>
              <p className="text-sm text-zinc-500">No pending actions require your attention.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {Object.entries(sections).map(([sectionName, sectActions]) => {
                if (!Array.isArray(sectActions) || sectActions.length === 0) return null
                const isEscalation = sectionName === 'Escalation'

                return (
                  <div key={sectionName} className="bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-xl overflow-hidden">
                    
                    <div className={`px-6 py-4 border-b ${isEscalation ? 'border-rose-500/20 bg-rose-500/5' : 'border-white/10 bg-white/[0.02]'} flex items-center justify-between`}>
                      <div className="flex items-center gap-2">
                        {isEscalation && <AlertTriangle size={16} className="text-rose-400" />}
                        <h3 className={`font-mono text-[11px] uppercase tracking-widest font-medium ${isEscalation ? 'text-rose-400' : 'text-zinc-400'}`}>
                          {sectionName}
                        </h3>
                      </div>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 bg-[#121214] px-2 py-1 rounded border border-white/5">
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
                            className={`relative transition-all duration-300 bg-[#0a0a0a] ${isExpanded ? 'bg-white/[0.02]' : 'hover:bg-white/[0.02]'}`}
                            style={{
                              transform: isDismissing === 'up' ? 'translateY(-10px)' : isDismissing === 'right' ? 'translateX(20px)' : 'none',
                              opacity: isDismissing ? 0 : 1,
                            }}
                            onClick={() => !isExpanded && setExpandedId(action.action_id)}
                          >
                            {isEscalation && (
                              <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-rose-500/50" />
                            )}

                            <div className={`p-5 pl-6 ${isExpanded ? 'pb-2' : ''} cursor-pointer flex flex-col sm:flex-row gap-4`}>
                              <div className="pt-1 w-6 shrink-0 font-mono text-xs text-zinc-600 font-medium">
                                {String(i + 1).padStart(2, '0')}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                                  <h4 className="text-base font-semibold text-zinc-100 truncate">
                                    {action.email_context?.sender_name || action.email_context?.sender || 'Unknown Sender'}
                                  </h4>
                                  <span className={`font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border font-medium ${
                                    isEscalation ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                                  }`}>
                                    {intent.replace(/_/g, ' ')}
                                  </span>
                                </div>
                                
                                {action.email_context?.subject && (
                                  <div className="text-sm text-zinc-400 font-medium truncate mb-1">
                                    {action.email_context.subject}
                                  </div>
                                )}
                                
                                {!isExpanded && snippet && (
                                  <p className="text-sm text-zinc-500 line-clamp-2 mt-1 pr-4 leading-relaxed">
                                    {snippet}
                                  </p>
                                )}

                                {!isExpanded && (
                                  <div className="mt-3 font-mono text-[10px] text-blue-400/80 uppercase tracking-widest font-medium">
                                    Click to review draft →
                                  </div>
                                )}
                              </div>
                            </div>

                            <div 
                              className="grid transition-all duration-300 ease-in-out"
                              style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
                            >
                              <div className="overflow-hidden">
                                <div className="pl-14 pr-6 pb-6 pt-2 cursor-default" onClick={e => e.stopPropagation()}>
                                  
                                  <div className="grid lg:grid-cols-2 gap-6 mt-4 mb-6">
                                    {/* Original Context */}
                                    <div>
                                      <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-2 font-medium">
                                        // Original Message
                                      </div>
                                      <div className="font-sans text-sm text-zinc-400 leading-relaxed bg-[#121214] border border-white/5 p-4 rounded-lg max-h-64 overflow-y-auto pr-2 whitespace-pre-wrap shadow-inner">
                                        {snippet || 'No content available.'}
                                      </div>
                                    </div>

                                    {/* AI Draft Editor */}
                                    <div className="flex flex-col">
                                      <div className="font-mono text-[10px] uppercase tracking-widest text-blue-400 mb-2 font-medium flex items-center justify-between">
                                        <span>// AI Drafted Reply</span>
                                        <span className="text-zinc-500 opacity-60">Editable</span>
                                      </div>
                                      <textarea
                                        className="flex-1 w-full min-h-[150px] bg-[#121214] font-sans text-sm text-zinc-200 leading-relaxed border border-white/10 p-4 rounded-lg outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 resize-none shadow-inner"
                                        value={draftText}
                                        onChange={e => setDraftEdits(prev => ({ ...prev, [action.action_id]: e.target.value }))}
                                      />
                                    </div>
                                  </div>

                                  {isEscalation && (
                                    <div className="mb-6 p-4 rounded-lg bg-rose-500/5 border border-rose-500/20 flex items-start gap-3">
                                      <AlertTriangle size={18} className="text-rose-400 shrink-0 mt-0.5" />
                                      <div>
                                        <h5 className="font-mono text-[11px] uppercase tracking-widest font-medium text-rose-400 mb-1">Agent Needs Clarification</h5>
                                        <p className="text-sm text-rose-300/80 leading-relaxed">
                                          This email was escalated because it required human judgment. Edit the draft above to provide your response.
                                        </p>
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex items-center justify-between flex-wrap gap-4 pt-4 border-t border-white/5">
                                    <div className="flex items-center gap-3">
                                      <button
                                        onClick={e => { e.stopPropagation(); handleApprove(action, action.agent_state?.final_response || '') }}
                                        disabled={!!approvingId}
                                        className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium shadow-sm transition-all active:scale-95 disabled:opacity-50"
                                      >
                                        {approvingId === action.action_id
                                          ? <><Loader2 size={16} className="animate-spin" /> Sending...</>
                                          : <>{isEscalation ? 'Update & Send' : 'Approve & Send'} <ArrowRight size={16} /></>
                                        }
                                      </button>

                                      <button
                                        onClick={e => { e.stopPropagation(); handleReject(action.action_id) }}
                                        disabled={!!rejectingId}
                                        className="px-4 py-2.5 text-sm font-medium border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-50"
                                      >
                                        {rejectingId === action.action_id ? 'Rejecting...' : 'Reject'}
                                      </button>
                                    </div>

                                    <button
                                      onClick={e => { e.stopPropagation(); setExpandedId(null) }}
                                      className="px-4 py-2.5 text-sm font-medium border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                                    >
                                      Close
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
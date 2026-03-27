import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'
import { Activity, MailQuestion, Calendar as CalIcon, ArrowRight, Layers, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { getActionsBySections, getPendingClusters, approveAction, editDraft, rejectAction, getStats } from '../services/api'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good Morning'
  if (h < 17) return 'Good Afternoon'
  return 'Good Evening'
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

  useEffect(() => {
    setTimeout(() => setReady(true), 150)
    getActionsBySections().then(d => setSections(d || {})).catch(console.error)
    getPendingClusters().then(d => setClusters(d || [])).catch(console.error)
    getStats().then(d => setStats(d || {})).catch(() => {})
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
      toast('Failed to approve', 'err')
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
    { label: 'Processed', value: processedCount, icon: Activity, color: '#FFE234', delay: 0 },
    { label: 'Meetings', value: meetingsCount, icon: CalIcon, color: 'var(--color-brand-blue)', delay: 60 },
    ...(brdsCount > 0 ? [{ label: 'BRDs', value: brdsCount, icon: CheckCircle2, color: '#00ff9d', delay: 120 }] : []),
    ...(escalations.length > 0 ? [{ label: 'Escalations', value: escalations.length, icon: MailQuestion, color: '#ff5080', delay: 180 }] : []),
    ...(clusters.length > 0 ? [{ label: 'Clusters', value: clusters.length, icon: Layers, color: '#00ff9d', delay: 240 }] : []),
  ]

  return (
    <div className={`transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'}`}>

      {/* ─── HERO ─── */}
      <div className="mb-16 md:mb-20 mt-10">
        <div className="htag mb-4">Command Center / Daily Briefing</div>

        <h1 className="font-bebas text-[clamp(52px,12vw,120px)] leading-[0.88] tracking-[-0.01em] uppercase mb-6">
          <span className="block text-white/30">{getGreeting()}</span>
          <span className="block text-brand-blue">Commander</span>
        </h1>

        <p className="section-body mb-8">
          {allPending.length > 0
            ? `I've drafted ${allPending.length} ${allPending.length === 1 ? 'reply' : 'replies'} for your review${escalations.length > 0 ? `, flagged ${escalations.length} urgent escalation${escalations.length > 1 ? 's' : ''}` : ''}${clusters.length > 0 ? `, and found ${clusters.length} project cluster${clusters.length > 1 ? 's' : ''}` : ''}.`
            : `All clear. No pending actions right now — you're fully caught up.`
          }
        </p>

        {/* Stat tags with stagger */}
        <div className="flex flex-wrap gap-2.5">
          {statTags.map(({ label, value, icon: Icon, color, delay }) => (
            <span
              key={label}
              className="font-space text-[10px] tracking-[0.1em] uppercase py-2 px-4 border rounded-sm inline-flex items-center gap-2 transition-all"
              style={{
                color,
                borderColor: `${color}25`,
                background: `${color}08`,
                animationDelay: `${delay}ms`
              }}
            >
              <Icon size={11} />
              {value} {label}
            </span>
          ))}
        </div>
      </div>

      {/* ─── CLUSTER SUGGESTIONS ─── */}
      {clusters.length > 0 && (
        <div className="mb-16">
          <div className="flex items-baseline gap-4 mb-8">
            <div className="snum !mb-0 text-[#00ff9d]">01</div>
            <h2 className="font-bebas text-[clamp(32px,5vw,52px)] leading-none text-brand-text">Project Clustering</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {clusters.map((c, i) => (
              <div
                key={i}
                className="bg-brand-panel border border-brand-border p-6 rounded-sm cursor-pointer group overflow-hidden relative"
                style={{ transition: 'border-color 0.25s ease, box-shadow 0.25s ease' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(0,255,157,0.4)'; e.currentTarget.style.boxShadow='0 0 20px rgba(0,255,157,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor=''; e.currentTarget.style.boxShadow='' }}
              >
                <div className="font-space text-[10px] text-[#00ff9d] uppercase mb-2 tracking-widest">
                  {c.email_ids?.length || 0} Emails · Suggested Cluster
                </div>
                <h3 className="font-bebas text-3xl text-brand-text mb-4 group-hover:text-[#00ff9d] transition-colors leading-tight">
                  {c.suggested_title || 'Untitled Cluster'}
                </h3>
                {/* Mini marquee of email subjects */}
                {c.email_ids?.length > 0 && (
                  <div className="marquee-wrap border-y border-brand-border/50 my-3 -mx-6 px-0">
                    <div className="marquee-track">
                      {[...Array(4)].map((_, j) => (
                        <span key={j} style={{ color: 'rgba(0,255,157,0.5)' }}>
                          {c.email_ids.map(id => `· Thread #${id.slice(0,6)}`).join(' ')} &nbsp;
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  onClick={() => navigate('/projects')}
                  className="text-[11px] font-space uppercase border border-[#00ff9d]/30 text-[#00ff9d] px-4 py-2 rounded-sm w-full mt-3 hover:bg-[#00ff9d] hover:text-black transition-all font-bold"
                >
                  Open in Project Studio →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── NEEDS APPROVAL ─── */}
      <div className="mb-20">
        <div className="flex items-baseline gap-4 mb-8">
          <div className="snum !mb-0 text-brand-blue">{clusters.length > 0 ? '02' : '01'}</div>
          <h2 className="font-bebas text-[clamp(32px,5vw,52px)] leading-none text-brand-text">Needs Approval</h2>
        </div>

        {allPending.length === 0 ? (
          <div className="py-16 border border-brand-border border-dashed rounded-sm text-center">
            <CheckCircle2 size={40} className="mx-auto mb-4" style={{ color: '#00ff9d', opacity: 0.2 }} />
            <div className="font-space text-[11px] uppercase tracking-[0.2em] text-brand-muted">All Clear — No Pending Actions</div>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {Object.entries(sections).map(([sectionName, sectActions]) => {
              if (!Array.isArray(sectActions) || sectActions.length === 0) return null
              const isEscalation = sectionName === 'Escalation'

              return (
                <div key={sectionName}>
                  {/* Section label */}
                  <div className="flex items-center gap-3 mb-3">
                    <span className="font-space text-[9px] uppercase tracking-[0.22em]"
                      style={{ color: isEscalation ? '#ff5080' : 'rgba(255,255,255,0.25)' }}>
                      {sectionName}
                    </span>
                    <div className="flex-1 h-px bg-brand-border" />
                    <span className="font-space text-[9px] uppercase tracking-widest"
                      style={{ color: isEscalation ? '#ff5080' : 'var(--color-brand-blue)', opacity: 0.7 }}>
                      {sectActions.length} pending
                    </span>
                  </div>

                  <div className={`process-wrap ${isEscalation ? 'escalation-row' : ''}`}
                    style={isEscalation ? { borderLeft: '2px solid rgba(255,80,80,0.5)' } : {}}>
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
                          className={`process-row ${isExpanded ? 'expanded' : ''}`}
                          style={{
                            transition: isDismissing
                              ? `transform 0.3s ease, opacity 0.3s ease`
                              : 'background 0.3s ease',
                            transform: isDismissing === 'up' ? 'translateY(-10px)' : isDismissing === 'right' ? 'translateX(16px)' : 'none',
                            opacity: isDismissing ? 0 : 1,
                          }}
                          onClick={() => !isExpanded && setExpandedId(action.action_id)}
                        >
                          {/* Number */}
                          <div className={`process-n ${isEscalation ? 'escalation-n' : ''}`}>
                            {String(i + 1).padStart(2, '0')}
                          </div>

                          {/* Content */}
                          <div className="process-content">
                            {/* Collapsed header */}
                            <div className="flex items-start justify-between gap-4 flex-wrap">
                              <div>
                                <h3 className="font-bebas text-[clamp(20px,2.5vw,26px)] tracking-[0.02em] leading-none mb-2 text-white">
                                  {action.email_context?.sender_name || action.email_context?.sender || 'Unknown Sender'}
                                </h3>
                                <span className="inline-block font-space text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-sm"
                                  style={{
                                    color: isEscalation ? '#ff5080' : 'var(--color-brand-blue)',
                                    border: `1px solid ${isEscalation ? 'rgba(255,80,80,0.2)' : 'rgba(0,181,226,0.2)'}`,
                                    background: isEscalation ? 'rgba(255,80,80,0.05)' : 'rgba(0,181,226,0.05)',
                                  }}>
                                  {intent.replace(/_/g, ' ')}
                                </span>
                              </div>
                              {action.email_context?.subject && (
                                <div className="text-[12px] text-brand-muted truncate max-w-[240px] font-dm">
                                  {action.email_context.subject}
                                </div>
                              )}
                            </div>

                            {/* Always-visible snippet (readability fix) */}
                            {snippet && !isExpanded && (
                              <p className="mt-3 text-[13px] leading-[1.65] line-clamp-2 font-dm"
                                style={{ color: 'rgba(255,255,255,0.38)' }}>
                                {snippet}
                              </p>
                            )}

                            {/* Expand click hint */}
                            {!isExpanded && (
                              <div className="mt-3 font-space text-[9px] uppercase tracking-widest text-brand-muted opacity-40">
                                Click to review draft →
                              </div>
                            )}

                            {/* ─── EXPANDED PANEL ─── */}
                            <div className={`grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]
                              ${isExpanded ? 'grid-rows-[1fr] opacity-100 mt-6' : 'grid-rows-[0fr] opacity-0 mt-0'}`}>
                              <div className="overflow-hidden">

                                <div className="grid md:grid-cols-2 gap-5 border border-brand-border rounded-sm p-5 mb-5"
                                  style={{ background: 'rgba(0,0,0,0.3)' }}>
                                  {/* Original */}
                                  <div>
                                    <div className="font-space text-[9px] tracking-[0.18em] uppercase mb-3"
                                      style={{ color: 'rgba(255,255,255,0.25)' }}>
                                      // Original Message
                                    </div>
                                    <p className="text-[13px] leading-[1.65] font-dm line-clamp-8"
                                      style={{ color: 'rgba(255,255,255,0.55)' }}>
                                      {snippet || 'No content available.'}
                                    </p>
                                  </div>

                                  {/* AI Draft */}
                                  <div>
                                    <div className="font-space text-[9px] tracking-[0.18em] uppercase mb-3 text-brand-blue">
                                      // AI Drafted Reply
                                    </div>
                                    <textarea
                                      className="w-full h-44 bg-transparent text-[13px] leading-[1.65] font-dm border-none outline-none resize-none focus:ring-0 p-0"
                                      style={{ color: 'rgba(255,255,255,0.8)' }}
                                      value={draftText}
                                      onChange={e => setDraftEdits(prev => ({ ...prev, [action.action_id]: e.target.value }))}
                                      onClick={e => e.stopPropagation()}
                                    />
                                  </div>
                                </div>

                                {/* Escalation inline question */}
                                {isEscalation && (
                                  <div className="mb-5 p-4 border border-[#ff5080]/20 rounded-sm bg-[rgba(255,80,80,0.03)]">
                                    <div className="font-space text-[9px] uppercase tracking-widest text-[#ff5080] mb-2">
                                      Agent needs clarification
                                    </div>
                                    <p className="text-[13px] font-dm mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>
                                      This email was escalated because it required human judgment. Edit the draft above to provide your response.
                                    </p>
                                  </div>
                                )}

                                {/* Action buttons */}
                                <div className="flex items-center gap-3 flex-wrap">
                                  <button
                                    onClick={e => { e.stopPropagation(); handleApprove(action, action.agent_state?.final_response || '') }}
                                    disabled={!!approvingId}
                                    className="flex items-center gap-2 bg-brand-blue hover:bg-white text-black px-6 py-2.5 rounded-sm font-space text-[10px] uppercase tracking-widest font-bold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                                  >
                                    {approvingId === action.action_id
                                      ? <><Loader2 size={13} className="animate-spin" /> Sending...</>
                                      : <>{isEscalation ? 'Update & Send' : 'Approve & Send'} <ArrowRight size={13} /></>
                                    }
                                  </button>

                                  <button
                                    onClick={e => { e.stopPropagation(); handleReject(action.action_id) }}
                                    disabled={!!rejectingId}
                                    className="px-4 py-2.5 font-space text-[10px] uppercase tracking-widest transition-colors hover:text-[#ff5080] disabled:opacity-50"
                                    style={{ color: 'rgba(255,255,255,0.35)' }}
                                  >
                                    {rejectingId === action.action_id ? 'Rejecting...' : 'Reject'}
                                  </button>

                                  <div className="flex-1" />

                                  <button
                                    onClick={e => { e.stopPropagation(); setExpandedId(null) }}
                                    className="px-4 py-2.5 font-space text-[10px] uppercase tracking-widest transition-colors"
                                    style={{ color: 'rgba(255,255,255,0.25)' }}
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
  )
}

import { useEffect, useState, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { getActions, approveAction, rejectAction, generateBrdForAction } from '../services/api'
import { Activity, CheckCircle2, XCircle, Clock, Loader2, MailCheck, AlertTriangle, Shield, FileText } from 'lucide-react'

// Helper to format time cleanly
const FT = iso => {
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return iso || '' }
}

// Polished, muted accent colors instead of bright raw neons
const INTENT_THEME = {
  brd: { text: '#a78bfa', bg: 'rgba(167, 139, 250, 0.1)', border: 'rgba(167, 139, 250, 0.2)' },
  schedule: { text: '#38bdf8', bg: 'rgba(56, 189, 248, 0.1)', border: 'rgba(56, 189, 248, 0.2)' },
  escalate: { text: '#fb7185', bg: 'rgba(251, 113, 133, 0.1)', border: 'rgba(251, 113, 133, 0.2)' },
  status: { text: '#fbbf24', bg: 'rgba(251, 191, 36, 0.1)', border: 'rgba(251, 191, 36, 0.2)' },
  general: { text: '#a1a1aa', bg: 'rgba(161, 161, 170, 0.1)', border: 'rgba(161, 161, 170, 0.2)' },
}

// Sophisticated status badges
const STATUS_META = {
  pending: { label: 'Pending Review', text: '#fbbf24', bg: 'rgba(251, 191, 36, 0.1)', border: 'rgba(251, 191, 36, 0.2)' },
  sent: { label: 'Sent', text: '#34d399', bg: 'rgba(52, 211, 153, 0.1)', border: 'rgba(52, 211, 153, 0.2)' },
  approved: { label: 'Sent', text: '#34d399', bg: 'rgba(52, 211, 153, 0.1)', border: 'rgba(52, 211, 153, 0.2)' },
  rejected: { label: 'Rejected', text: '#f87171', bg: 'rgba(248, 113, 113, 0.1)', border: 'rgba(248, 113, 113, 0.2)' },
  escalated: { label: 'Escalated', text: '#fb7185', bg: 'rgba(251, 113, 133, 0.1)', border: 'rgba(251, 113, 133, 0.2)' },
  escalation: { label: 'Escalated', text: '#fb7185', bg: 'rgba(251, 113, 133, 0.1)', border: 'rgba(251, 113, 133, 0.2)' },
  pending_escalation: { label: 'Flagged (Review)', text: '#fbbf24', bg: 'rgba(251, 191, 36, 0.1)', border: 'rgba(251, 191, 36, 0.2)' },
}

const ESCALATED_STATUSES = ['escalated', 'escalation']

function ActionRow({ action, globalIdx, onUpdate }) {
  const { toast, dispatch } = useApp() || {}
  const [expanded, setExpanded] = useState(false)
  const [approving, setApproving] = useState(false)
  const [dismissing, setDismissing] = useState(null)
  const draftRef = useRef(null)

  const a = action
  const isSent = ['sent', 'approved'].includes(a.status)
  const isEscalated = ESCALATED_STATUSES.includes(a.status)
  const isFlagged = a.status === 'pending_escalation'
  const canReview = ['pending', 'escalated', 'pending_escalation'].includes(a.status)
  const canGenerateBrd = (a.intent === 'brd' || a.email?.force_intent === 'brd' || a.force_brd) && !a.brd_final
  const sm = STATUS_META[a.status] || STATUS_META.pending
  const intTheme = INTENT_THEME[a.intent] || INTENT_THEME.general
  const confidence = a.agent_state?.confidence ?? a.confidence
  const escalationReason = a.agent_state?.escalation_reason || a.escalation_reason

  const handleApprove = async (e) => {
    e.stopPropagation()
    setApproving(true)
    try {
      const body = draftRef.current?.innerText || a.draft_body || ''
      const r = await approveAction(a.id, { body, subject: a.draft_subject })
      if (r.error) { toast?.(r.error, 'warn'); setApproving(false); return }
      dispatch?.({ type: 'UPDATE_ACTION_STATUS', id: a.id, status: r.status || 'sent' })
      toast?.('Action approved & sent!', 'ok')
      setDismissing('approve')
      setTimeout(() => onUpdate?.(), 320)
    } catch { toast?.('Approve failed', 'warn'); setApproving(false) }
  }

  const handleReject = async (e) => {
    e.stopPropagation()
    try {
      await rejectAction(a.id)
      dispatch?.({ type: 'UPDATE_ACTION_STATUS', id: a.id, status: 'rejected' })
      toast?.('Rejected', 'warn')
      setDismissing('reject')
      setTimeout(() => onUpdate?.(), 320)
    } catch {}
  }

  const handleGenerateBrd = async (e) => {
    e.stopPropagation()
    setApproving(true)
    try {
      const r = await generateBrdForAction(a.id)
      if (r.error) { toast?.(r.error, 'warn'); setApproving(false); return }
      toast?.('BRD generation started', 'ok')
      setDismissing('approve')
      setTimeout(() => onUpdate?.(), 320)
    } catch {
      toast?.('Failed to start BRD', 'warn')
    } finally {
      setApproving(false)
    }
  }

  return (
    <div
      className={`relative border-b border-white/10 group transition-colors duration-200 ${expanded ? 'bg-white/[0.02]' : 'hover:bg-white/[0.02]'}`}
      style={{
        opacity: dismissing ? 0 : 1,
        transform: dismissing === 'approve' ? 'translateY(-10px)' : dismissing === 'reject' ? 'translateX(16px)' : 'none',
        transition: dismissing ? 'all 0.32s ease' : undefined,
      }}
      onClick={() => setExpanded(e => !e)}
    >
      {/* Escalation Left-Border Indicator */}
      {(isEscalated || isFlagged) && (
        <div className={`absolute left-0 top-0 bottom-0 w-[2px] ${isEscalated ? 'bg-rose-500/50' : 'bg-amber-400/50'}`} />
      )}

      <div className="flex items-start gap-4 p-5 cursor-pointer">
        {/* Clean Monospace Number */}
        <div className="pt-1 w-6 shrink-0 font-mono text-xs text-zinc-500 font-medium">
          {String(globalIdx + 1).padStart(2, '0')}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1.5 flex-wrap">
            <span className="font-sans text-lg font-medium text-zinc-100 tracking-tight leading-none">
              {(a.email?.sender || 'Unknown').split('@')[0]}
            </span>
            
            {/* Intent Pill */}
            <span
              className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border font-medium"
              style={{ color: intTheme.text, backgroundColor: intTheme.bg, borderColor: intTheme.border }}
            >
              {a.intent || 'general'}
            </span>
            
            {/* Status Pill */}
            <span
              className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border font-medium ml-auto"
              style={{ color: sm.text, backgroundColor: sm.bg, borderColor: sm.border }}
            >
              {sm.label}
            </span>
            
            {typeof confidence === 'number' && (
              <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-white/10 text-zinc-400 flex items-center gap-1 font-medium bg-white/5">
                <Shield size={10} /> {Math.round(confidence * 100)}%
              </span>
            )}
          </div>

          <div className="font-sans text-sm text-zinc-400 truncate mb-1">
            {a.email?.subject || '—'}
          </div>

          {(isEscalated || isFlagged) && escalationReason && (
            <div className="flex items-center gap-1.5 text-xs text-rose-400 mb-1 font-medium">
              <AlertTriangle size={12} />
              <span>{escalationReason}</span>
            </div>
          )}

          {a.draft_body && !expanded && (
            <p className="font-sans text-sm text-zinc-500 line-clamp-2 leading-relaxed mt-1">
              {a.draft_body}
            </p>
          )}

          {!expanded && !isSent && a.draft_body && (
            <div className="font-mono text-[10px] text-blue-400 mt-2 uppercase tracking-wider font-medium opacity-80">
              Click to review draft →
            </div>
          )}
        </div>
      </div>

      {/* Expanded Section */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.35s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          {expanded && (
            <div className="pl-14 pr-5 pb-6" onClick={e => e.stopPropagation()}>
              
              <div className="grid md:grid-cols-2 gap-6 mt-2">
                {/* Original Message */}
                <div>
                  <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-2 font-medium">
                    // Original Message
                  </div>
                  <div className="font-sans text-sm leading-relaxed text-zinc-400 bg-[#121214] border border-white/5 p-4 rounded-lg max-h-[250px] overflow-y-auto whitespace-pre-wrap shadow-inner">
                    {a.email?.body || a.email?.snippet || '(no body)'}
                  </div>
                </div>

                {/* AI Draft */}
                {a.draft_body && !isSent && canReview && (
                  <div>
                    <div className="font-mono text-[10px] text-blue-400 uppercase tracking-widest mb-2 font-medium flex items-center justify-between">
                      <span>// AI Draft</span>
                      <span className="text-zinc-500 opacity-60">Editable</span>
                    </div>
                    <div
                      ref={draftRef}
                      contentEditable={a.status === 'pending' ? 'true' : 'false'}
                      suppressContentEditableWarning
                      className="font-sans text-sm leading-relaxed text-zinc-200 bg-[#121214] border border-white/10 p-4 rounded-lg outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all shadow-inner"
                    >
                      {a.draft_body}
                    </div>
                  </div>
                )}

                {/* Status Read-only block */}
                {(isSent || isEscalated || isFlagged) && (
                  <div>
                    <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-2 font-medium">// Status</div>
                    <div className="font-sans text-sm leading-relaxed bg-[#121214] border border-white/5 p-4 rounded-lg shadow-inner"
                      style={{ color: sm.text }}>
                      {isEscalated
                        ? '▲ This action was escalated to the human queue for manual review.'
                        : isFlagged
                          ? '▲ Low confidence — flagged for manual review. Approve or reject below.'
                          : '✓ Action has been sent successfully.'}
                    </div>
                  </div>
                )}
              </div>

              {/* Integrations (Calendar / BRD) */}
              {a.calendar_event && (
                <div className="mt-4 p-3 rounded-lg border border-teal-500/20 bg-teal-500/5 font-sans text-sm flex items-center gap-2">
                  <span className="text-teal-400">📅 Scheduled:</span>{' '}
                  <span className="text-zinc-300 font-medium">{a.calendar_event.title}</span>
                  <span className="text-zinc-500 text-xs ml-auto font-mono">{FT(a.calendar_event.start)}</span>
                </div>
              )}

              {(a.brd_job_id || a.brd_final) && (
                <div className="mt-4 p-3 rounded-lg border border-white/10 bg-white/5 font-sans text-sm flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-purple-400 border border-purple-400/20 bg-purple-400/10 px-2 py-0.5 rounded font-medium">BRD</span>
                    <span className="text-zinc-300">{a.brd_final?.title || 'Document is ready to download'}</span>
                  </div>
                  {a.brd_job_id && (
                    <button
                      onClick={() => window.open(`/api/brd/${a.brd_job_id}/download`, '_blank')}
                      className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-md font-mono text-[11px] uppercase tracking-wider font-medium transition-colors border border-white/10"
                    >
                      Download PDF
                    </button>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              {(canReview || canGenerateBrd) && (
                <div className="flex items-center gap-3 mt-6 flex-wrap pt-4 border-t border-white/5">
                  {canReview && (
                    <button
                      onClick={handleApprove}
                      disabled={approving}
                      className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-sans text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-60 shadow-sm"
                    >
                      {approving ? <><Loader2 size={16} className="animate-spin" /> Processing...</> : <><MailCheck size={16} /> Approve & Send</>}
                    </button>
                  )}
                  {canGenerateBrd && (
                    <button
                      onClick={handleGenerateBrd}
                      disabled={approving}
                      className="flex items-center gap-2 border border-white/10 text-zinc-300 bg-white/5 hover:bg-white/10 px-4 py-2.5 rounded-lg font-sans text-sm font-medium transition-colors"
                    >
                      <FileText size={16} className="text-purple-400" /> Generate BRD
                    </button>
                  )}
                  {canReview && (
                    <button
                      onClick={handleReject}
                      className="flex items-center gap-2 border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 px-4 py-2.5 rounded-lg font-sans text-sm font-medium transition-colors ml-auto"
                    >
                      <XCircle size={16} /> Reject
                    </button>
                  )}
                </div>
              )}

              {isEscalated && (
                <div className="flex items-center gap-3 mt-6 pt-4 border-t border-white/5">
                  <a
                    href="https://mail.google.com"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-5 py-2.5 rounded-lg font-sans text-sm font-medium transition-colors border border-white/10 shadow-sm"
                  >
                    Open in Gmail ↗
                  </a>
                </div>
              )}

              <div className="font-mono text-[10px] text-zinc-600 mt-4 uppercase tracking-wider flex items-center justify-between">
                <span>Created {FT(a.created_at)}</span>
                <span>Priority Score: {a.urgency || 0}/100</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const FILTERS = [
  { id: 'all', label: 'All Actions' },
  { id: 'pending', label: 'Pending' },
  { id: 'sent', label: 'Sent' },
  { id: 'rejected', label: 'Rejected' }
]

export default function Actions() {
  const { state, dispatch } = useApp() || {}
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [rev, setRev] = useState(0)

  const load = async () => {
    setLoading(true)
    try {
      const d = await getActions()
      dispatch?.({ type: 'SET_ACTIONS', actions: d.actions || [] })
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const actions = state?.actions || []
  const filtered = filter === 'all' ? actions
    : filter === 'pending' ? actions.filter(a => a.status?.includes('pending'))
    : filter === 'sent' ? actions.filter(a => ['sent', 'approved'].includes(a.status))
    : actions.filter(a => a.status === 'rejected')

  const sorted = [...filtered].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))

  return (
    <div className="min-h-screen pb-24 font-sans text-zinc-100 selection:bg-blue-500/30">

      {/* HEADER */}
      <div className="max-w-6xl mx-auto pt-12 px-6 lg:px-8 mb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="font-mono text-[11px] text-zinc-500 uppercase tracking-widest mb-2 font-medium">Activity / History</div>
            <h1 className="font-sans text-4xl font-semibold tracking-tight text-white">
              Agent Actions
            </h1>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap bg-[#0a0a0a] p-1.5 rounded-lg border border-white/5">
            {/* Filter Pills */}
            {FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`font-sans text-sm px-4 py-1.5 rounded-md transition-all font-medium ${
                  filter === f.id
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                }`}
              >
                {f.label}
              </button>
            ))}
            
            <div className="w-px h-6 bg-white/10 mx-1"></div>
            
            <button
              onClick={load}
              disabled={loading}
              className="px-3 py-1.5 text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
              aria-label="Refresh Data"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* ACTION FEED */}
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        <div className="bg-[#0a0a0a] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
          {sorted.length > 0 ? (
            <div className="flex flex-col">
              {sorted.map((a, i) => (
                <ActionRow
                  key={a.id}
                  action={a}
                  globalIdx={i}
                  onUpdate={() => setRev(r => r + 1)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-32 px-4 gap-4 bg-[#0a0a0a]">
              <div className="p-4 rounded-full bg-white/5 border border-white/5">
                <CheckCircle2 size={32} className="text-zinc-600" />
              </div>
              <div className="font-sans text-lg text-zinc-400 font-medium">
                {loading ? 'Fetching actions...' : `No ${filter === 'all' ? '' : filter + ' '}actions found`}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
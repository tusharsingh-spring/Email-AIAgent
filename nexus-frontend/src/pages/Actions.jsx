import { useEffect, useState, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { getActions, approveAction, rejectAction } from '../services/api'
import { Activity, CheckCircle2, XCircle, Clock, Loader2, MailCheck } from 'lucide-react'

const FT = iso => {
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return iso || '' }
}

const INTENT_COLORS = {
  brd: '#a855f7',
  schedule: '#00B5E2',
  escalate: '#ff5080',
  general: 'rgba(255,255,255,0.3)',
  status: '#FFE234',
}

const STATUS_META = {
  pending: { label: 'Pending', color: '#FFE234', bg: 'rgba(255,226,52,0.08)' },
  sent: { label: 'Sent', color: '#00ff9d', bg: 'rgba(0,255,157,0.08)' },
  approved: { label: 'Sent', color: '#00ff9d', bg: 'rgba(0,255,157,0.08)' },
  rejected: { label: 'Rejected', color: '#ff5080', bg: 'rgba(255,80,80,0.08)' },
  escalated: { label: 'Escalated', color: '#ff5080', bg: 'rgba(255,80,80,0.08)' },
}

function ActionRow({ action, globalIdx, onUpdate }) {
  const { toast, dispatch } = useApp() || {}
  const [expanded, setExpanded] = useState(false)
  const [approving, setApproving] = useState(false)
  const [dismissing, setDismissing] = useState(null)
  const draftRef = useRef(null)

  const a = action
  const isSent = ['sent', 'approved'].includes(a.status)
  const isEscalated = a.status === 'escalated'
  const sm = STATUS_META[a.status] || STATUS_META.pending
  const intColor = INTENT_COLORS[a.intent] || 'rgba(255,255,255,0.3)'

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

  return (
    <div
      className={`process-row${isEscalated ? ' escalation-row' : ''}`}
      style={{
        opacity: dismissing ? 0 : 1,
        transform: dismissing === 'approve' ? 'translateY(-10px)' : dismissing === 'reject' ? 'translateX(16px)' : 'none',
        transition: dismissing ? 'all 0.32s ease' : undefined,
      }}
      onClick={() => setExpanded(e => !e)}
    >
      {/* Number */}
      <div className={isEscalated ? 'escalation-n' : 'process-n'}>
        {String(globalIdx + 1).padStart(2, '0')}
      </div>

      {/* Content */}
      <div className="process-content">
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <span className="font-bebas text-[clamp(18px,2vw,24px)] text-brand-text leading-none">
            {(a.email?.sender || 'Unknown').split('@')[0]}
          </span>
          <span
            className="font-space text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-sm border"
            style={{ color: intColor, borderColor: intColor, background: `${intColor}12` }}
          >
            {a.intent || 'general'}
          </span>
          <span
            className="font-space text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-sm ml-auto"
            style={{ color: sm.color, background: sm.bg }}
          >
            {sm.label}
          </span>
        </div>

        <div className="font-dm text-[12px] opacity-50 truncate mb-1">
          {a.email?.subject || '—'}
        </div>
        {a.draft_body && (
          <p className="font-dm text-[12px] opacity-[0.38] line-clamp-2 leading-relaxed">
            {a.draft_body}
          </p>
        )}
        {!expanded && !isSent && a.draft_body && (
          <div className="font-space text-[9px] text-brand-blue/60 mt-1 tracking-wide">
            Click to review draft →
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateRows: expanded ? '1fr' : '0fr',
            transition: 'grid-template-rows 0.35s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          <div style={{ overflow: 'hidden' }}>
            {expanded && (
              <div className="mt-4 pt-4 border-t border-brand-border" onClick={e => e.stopPropagation()}>
                {/* 2-col: original | draft */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <div className="font-space text-[9px] tracking-[0.15em] opacity-30 uppercase mb-2">// Original Message</div>
                    <div className="font-dm text-[13px] leading-[1.65] opacity-60 bg-brand-input p-3 rounded-sm max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                      {a.email?.body || a.email?.snippet || '(no body)'}
                    </div>
                  </div>
                  {a.draft_body && !isSent && !isEscalated && (
                    <div>
                      <div className="font-space text-[9px] tracking-[0.15em] text-brand-blue uppercase mb-2">// AI Draft — click to edit</div>
                      <div
                        ref={draftRef}
                        contentEditable={a.status === 'pending' ? 'true' : 'false'}
                        suppressContentEditableWarning
                        className="font-dm text-[13px] leading-[1.65] opacity-75 bg-brand-input p-3 rounded-sm outline-none focus:border focus:border-brand-blue/40"
                      >
                        {a.draft_body}
                      </div>
                    </div>
                  )}
                  {(isSent || isEscalated) && (
                    <div>
                      <div className="font-space text-[9px] tracking-[0.15em] opacity-30 uppercase mb-2">// Status</div>
                      <div className="font-dm text-[13px] leading-[1.65] opacity-60 bg-brand-input p-3 rounded-sm"
                        style={{ color: sm.color }}>
                        {isEscalated ? '▲ This action was escalated to the human queue for manual review.' : '✓ Action has been sent.'}
                      </div>
                    </div>
                  )}
                </div>

                {a.calendar_event && (
                  <div className="mt-3 p-3 rounded-sm border border-[rgba(0,191,165,0.2)] bg-[rgba(0,191,165,0.04)] font-dm text-[12px]">
                    <span style={{ color: '#00bfa5' }}>📅 Meeting:</span>{' '}
                    <span className="opacity-60">{a.calendar_event.title} · {FT(a.calendar_event.start)}</span>
                  </div>
                )}

                {a.status === 'pending' && (
                  <div className="flex items-center gap-3 mt-4">
                    <button
                      onClick={handleApprove}
                      disabled={approving}
                      className="flex items-center gap-2 bg-brand-blue text-brand-black px-5 py-2 rounded-sm font-space text-[10px] uppercase tracking-widest font-bold hover:bg-white transition-colors disabled:opacity-60 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {approving ? <><Loader2 size={12} className="animate-spin" /> Sending...</> : <><MailCheck size={12} /> Approve & Send</>}
                    </button>
                    <button
                      onClick={handleReject}
                      className="flex items-center gap-2 border border-[#ff5080]/40 text-[#ff5080] px-4 py-2 rounded-sm font-space text-[10px] uppercase tracking-widest hover:bg-[#ff5080]/10 transition-colors"
                    >
                      <XCircle size={12} /> Reject
                    </button>
                  </div>
                )}

                {isEscalated && (
                  <div className="flex items-center gap-3 mt-4">
                    <a
                      href="https://mail.google.com"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 bg-brand-blue text-brand-black px-5 py-2 rounded-sm font-space text-[10px] uppercase tracking-widest font-bold hover:bg-white transition-colors"
                    >
                      Open in Gmail ↗
                    </a>
                  </div>
                )}

                <div className="font-space text-[9px] text-brand-muted/40 mt-3">
                  {FT(a.created_at)} · urgency {a.urgency || 0}/100
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const FILTERS = ['all', 'pending', 'sent', 'rejected']

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

  return (
    <div className="pb-20">

      {/* HEADER */}
      <div className="mb-10">
        <div className="htag mb-4">Activity / History</div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
          <h1 className="font-bebas text-[clamp(38px,6.5vw,80px)] leading-[0.9] tracking-[0.01em] uppercase text-brand-text">
            Agent Actions
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            {/* filter pills */}
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`font-space text-[10px] uppercase tracking-widest px-4 py-2 rounded-sm border transition-colors ${
                  filter === f
                    ? 'bg-brand-blue text-brand-black border-brand-blue'
                    : 'border-brand-border text-brand-muted hover:text-white hover:border-white/20'
                }`}
              >
                {f}
              </button>
            ))}
            <button
              onClick={load}
              disabled={loading}
              className="ml-2 border border-brand-border text-brand-muted hover:text-white px-3 py-2 rounded-sm transition-colors"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Activity size={13} />}
            </button>
          </div>
        </div>
      </div>

      {/* ACTION FEED */}
      {filtered.length > 0 ? (
        <div className="process-wrap">
          {filtered.map((a, i) => (
            <ActionRow
              key={a.id}
              action={a}
              globalIdx={i}
              onUpdate={() => setRev(r => r + 1)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <CheckCircle2 size={48} style={{ color: 'rgba(255,255,255,0.1)' }} />
          <div className="font-space text-[10px] uppercase tracking-widest text-brand-muted/40">
            {loading ? 'Loading actions...' : `No ${filter === 'all' ? '' : filter + ' '}actions found`}
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { getActions } from '../services/api'
import { AlertTriangle, CheckCircle2, ExternalLink, Shield, Sparkles } from 'lucide-react'

const FT = iso => {
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return iso || '' }
}

function EscalationRow({ action, idx, onResolve }) {
  const [expanded, setExpanded] = useState(false)

  const a = action
  const urgencyColor = a.urgency >= 80 ? '#ff5080' : a.urgency >= 50 ? '#FFE234' : '#00ff9d'
  const confidence = a.agent_state?.confidence ?? a.confidence
  const escalationReason = a.agent_state?.escalation_reason || a.escalation_reason

  return (
    <div
      className="escalation-row process-row cursor-pointer"
      onClick={() => setExpanded(e => !e)}
    >
      <div className="escalation-n">{String(idx + 1).padStart(2, '0')}</div>

      <div className="process-content">
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <span className="font-bebas text-[clamp(18px,2vw,24px)] text-brand-text leading-none">
            {(a.email?.sender || 'Unknown').split('@')[0]}
          </span>
          <span className="font-space text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-sm border border-[#ff5080]/40 text-[#ff5080] bg-[#ff5080]/08">
            Escalated
          </span>
          <span className="font-space text-[9px] text-brand-muted/40 ml-auto">{FT(a.created_at)}</span>
          {typeof confidence === 'number' && (
            <span className="font-space text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-sm border border-brand-border text-brand-muted flex items-center gap-1">
              <Shield size={10} /> Conf {Math.round(confidence * 100)}%
            </span>
          )}
        </div>

        <div className="font-dm text-[12px] opacity-50 truncate mb-1">{a.email?.subject || '—'}</div>

        {escalationReason && (
          <div className="flex items-center gap-2 text-[11px] text-[#ff9fb6]">
            <AlertTriangle size={12} />
            <span>{escalationReason}</span>
          </div>
        )}

        {/* Urgency bar */}
        <div className="flex items-center gap-2 mt-2">
          <div className="font-space text-[9px] text-brand-muted/40 uppercase tracking-widest">Urgency</div>
          <div className="flex-1 h-1 bg-brand-border/30 rounded-full overflow-hidden max-w-[120px]">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${a.urgency || 0}%`, background: urgencyColor }}
            />
          </div>
          <span className="font-space text-[9px]" style={{ color: urgencyColor }}>{a.urgency || 0}/100</span>
        </div>

        {/* Expanded */}
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
                <div className="bg-[rgba(255,80,80,0.04)] border border-[rgba(255,80,80,0.15)] rounded-sm p-3 mb-4">
                  <div className="font-space text-[9px] text-[#ff5080] uppercase tracking-widest mb-1">Escalation Reason</div>
                  <p className="font-dm text-[13px] leading-[1.65] opacity-70">
                    {a.summary || `Urgency score ${a.urgency}/100 exceeded your escalation threshold. LangGraph has routed this for manual review.`}
                  </p>
                </div>

                {a.email?.body && (
                  <div className="mb-4">
                    <div className="font-space text-[9px] uppercase tracking-[0.15em] opacity-30 mb-2">// Original Message</div>
                    <div className="font-dm text-[13px] leading-[1.65] opacity-60 bg-brand-input p-3 rounded-sm max-h-[180px] overflow-y-auto whitespace-pre-wrap">
                      {a.email.body}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <a
                    href="https://mail.google.com"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 bg-brand-blue text-brand-black px-5 py-2 rounded-sm font-space text-[10px] uppercase tracking-widest font-bold hover:bg-white transition-colors hover:scale-[1.02] active:scale-[0.98]"
                    onClick={e => e.stopPropagation()}
                  >
                    <ExternalLink size={12} /> Open Gmail
                  </a>
                  <button
                    onClick={e => { e.stopPropagation(); onResolve(a.id) }}
                    className="flex items-center gap-2 border border-[#00ff9d]/40 text-[#00ff9d] px-4 py-2 rounded-sm font-space text-[10px] uppercase tracking-widest hover:bg-[#00ff9d]/08 transition-colors"
                  >
                    <CheckCircle2 size={12} /> Mark Resolved
                  </button>
                  {escalationReason && (
                    <div className="flex items-center gap-1 text-[11px] text-brand-muted/70">
                      <Sparkles size={12} /> Explain: {escalationReason}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Escalations() {
  const { state, dispatch, toast } = useApp() || {}
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const d = await getActions()
      dispatch?.({ type: 'SET_ACTIONS', actions: d.actions || [] })
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const escalations = (state?.actions || []).filter(a => a.status === 'escalated')

  const handleResolve = (id) => {
    dispatch?.({ type: 'UPDATE_ACTION_STATUS', id, status: 'resolved' })
    toast?.('Escalation resolved', 'ok')
  }

  return (
    <div className="pb-20">

      {/* HEADER */}
      <div className="mb-10">
        <div className="htag mb-4">Review / Human Queue</div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
          <h1 className="font-bebas text-[clamp(38px,6.5vw,80px)] leading-[0.9] tracking-[0.01em] uppercase text-brand-text">
            Escalations
          </h1>
          <div className="flex items-center gap-3">
            {escalations.length > 0 && (
              <div className="flex items-center gap-2 bg-[rgba(255,80,80,0.08)] border border-[rgba(255,80,80,0.2)] px-4 py-2 rounded-sm">
                <AlertTriangle size={12} className="text-[#ff5080]" />
                <span className="font-space text-[10px] text-[#ff5080]">{escalations.length} pending review</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {escalations.length > 0 ? (
        <div className="process-wrap">
          {escalations.map((a, i) => (
            <EscalationRow
              key={a.id}
              action={a}
              idx={i}
              onResolve={handleResolve}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <CheckCircle2 size={48} style={{ color: 'rgba(0,255,157,0.15)' }} />
          <div className="font-space text-[10px] uppercase tracking-widest text-brand-muted/40">
            {loading ? 'Checking queue...' : 'No escalations — all clear'}
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useRef } from 'react'
import Badge, { INTENT_BADGE, STATUS_BADGE } from './Badge'
import { approveAction, rejectAction, attachEmailToProject, createProject } from '../../services/api'
import { useApp } from '../../context/AppContext'

const FT = iso => { try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return iso || '' } }
const INI = e => (e || '').split('@')[0].slice(0, 2).toUpperCase() || 'AI'
const UC = u => u >= 80 ? 'var(--red)' : u >= 50 ? 'var(--amb)' : 'var(--grn)'

export default function ActionCard({ action, onUpdate }) {
  const { toast, dispatch } = useApp()
  const draftRef = useRef(null)
  const a = action

  const isSent = ['sent', 'approved'].includes(a.status)
  const isEscalated = a.status === 'escalated'
  const isCluster = a.status === 'pending_cluster'
  const isProcessing = a.status === 'processing_brd'

  const handleApprove = async () => {
    const body = draftRef.current?.innerText || a.draft_body || ''
    try {
      const r = await approveAction(a.id, { body, subject: a.draft_subject })
      if (r.error) { toast(r.error, 'warn'); return }
      dispatch({ type: 'UPDATE_ACTION_STATUS', id: a.id, status: r.status || 'sent' })
      toast('Action approved!', 'ok')
      onUpdate?.()
    } catch { toast('Approve failed', 'warn') }
  }

  const handleReject = async () => {
    try {
      await rejectAction(a.id)
      dispatch({ type: 'UPDATE_ACTION_STATUS', id: a.id, status: 'rejected' })
      toast('Rejected', 'warn')
      onUpdate?.()
    } catch {}
  }

  const handleApplyProjectSuggestion = async (emailId, projectId) => {
    if (!emailId || !projectId) return toast('Missing data', 'warn')
    try {
      await attachEmailToProject(projectId, emailId)
      toast('Email attached to project', 'ok')
      onUpdate?.()
    } catch { toast('Failed', 'warn') }
  }

  const handleCreateProjectAndAttach = async (emailId, nameHint) => {
    const name = window.prompt('Project name', nameHint || 'New Project')
    if (!name) return
    try {
      const proj = await createProject(name)
      if (!proj.id) throw new Error('Create failed')
      await attachEmailToProject(proj.id, emailId)
      toast('Project created & email attached', 'ok')
      onUpdate?.()
    } catch { toast('Failed', 'warn') }
  }

  return (
    <div className={`ac${isEscalated ? ' esc' : ''}${isSent ? ' sent' : ''}`}>
      <div className="ac-h">
        <div className="ac-av" style={isEscalated ? { background: 'var(--rdim)', color: 'var(--red)' } : {}}>
          {isEscalated ? '▲' : isCluster ? '⬡' : INI(a.email?.sender)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ac-from">{a.email?.sender || 'unknown'}</div>
          <div className="ac-sub">{a.email?.subject || '—'}</div>
          <div className="ac-meta">
            <Badge variant={INTENT_BADGE[a.intent] || 'gr'}>{a.intent}</Badge>
            <Badge variant={STATUS_BADGE[a.status] || 'gr'}>{a.status}</Badge>
            <span style={{ fontSize: '9px', color: 'var(--tx3)', fontFamily: "'DM Mono',monospace" }}>{FT(a.created_at)}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '36px', height: '3px', background: 'var(--bg5)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${a.urgency || 0}%`, background: UC(a.urgency || 0) }} />
              </div>
              <span style={{ fontSize: '9px', color: UC(a.urgency || 0) }}>{a.urgency || 0}</span>
            </div>
          </div>
          {a.project_suggestion && (
            <div style={{ marginTop: '6px', background: 'var(--bg3)', border: '1px solid var(--bdr)', borderRadius: '8px', padding: '8px', fontSize: '10px', color: 'var(--tx2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <Badge variant="gn">Project Suggestion</Badge>
                <span style={{ fontWeight: 600, color: 'var(--a2)' }}>{a.project_suggestion.project_name || 'Project'}</span>
                <span style={{ fontSize: '9px', color: 'var(--tx3)' }}>conf: {a.project_suggestion.confidence || 0}</span>
              </div>
              <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
                <button className="btn btn-grn btn-sm" onClick={e => { e.stopPropagation(); handleApplyProjectSuggestion(a.email?.id, a.project_suggestion.project_id) }}>✓ Attach to Project</button>
                <button className="btn btn-g btn-sm" onClick={e => { e.stopPropagation(); handleCreateProjectAndAttach(a.email?.id, a.project_suggestion.project_name) }}>+ New Project</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {isCluster && (
        <>
          <div className="ac-body">
            <div style={{ background: 'var(--aglow2)', border: '1px solid rgba(108,95,245,.18)', borderRadius: 'var(--rs)', padding: '10px', fontSize: '11px' }}>
              <span style={{ color: 'var(--a2)', fontWeight: 600 }}>◈ PyTorch Pattern Detected:</span><br />{a.summary}
            </div>
          </div>
          <div className="ac-foot">
            <button className="btn btn-a btn-sm" onClick={handleApprove}>◈ Approve & Extract BRD</button>
            <button className="btn btn-red btn-sm" onClick={handleReject}>✕ Reject</button>
          </div>
        </>
      )}

      {isEscalated && (
        <>
          <div className="ac-body">
            <div style={{ background: 'var(--rdim)', border: '1px solid rgba(255,69,58,.2)', borderRadius: 'var(--rs)', padding: '9px', fontSize: '11px', color: 'var(--red)' }}>
              ▲ Urgency {a.urgency}/100 — LangGraph escalated. Please respond manually.
            </div>
          </div>
          <div className="ac-foot">
            <a href="https://mail.google.com" target="_blank" rel="noreferrer" className="btn btn-a btn-sm">Open Gmail</a>
            <button className="btn btn-g btn-sm" onClick={() => { dispatch({ type: 'UPDATE_ACTION_STATUS', id: a.id, status: 'resolved' }); toast('Escalation resolved', 'ok'); onUpdate?.() }}>✓ Resolve</button>
          </div>
        </>
      )}

      {isProcessing && (
        <div className="ac-foot">
          <span style={{ fontSize: '10px', color: 'var(--pur)' }}>◈ Extracting BRD with LLM...</span>
        </div>
      )}

      {a.draft_body && !isSent && !isEscalated && !isCluster && !isProcessing && (
        <>
          <div className="ac-body">
            {a.calendar_event && (
              <div style={{ background: 'var(--tdim)', border: '1px solid rgba(0,191,165,.18)', borderRadius: 'var(--rs)', padding: '8px 10px', marginBottom: '8px', fontSize: '10px' }}>
                <span style={{ color: 'var(--teal)', fontWeight: 500 }}>📅 Meeting:</span>{' '}
                <span style={{ color: 'var(--tx2)' }}>{a.calendar_event.title} · {FT(a.calendar_event.start)}</span>
                {a.calendar_event.link && <a href={a.calendar_event.link} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)', marginLeft: '6px' }}>↗ Calendar</a>}
              </div>
            )}
            {a.brd_final && (
              <div style={{ background: 'var(--pdim)', border: '1px solid rgba(168,85,247,.18)', borderRadius: 'var(--rs)', padding: '8px 10px', marginBottom: '8px', fontSize: '10px' }}>
                <span style={{ color: 'var(--pur)', fontWeight: 500 }}>◈ BRD:</span>{' '}
                <span style={{ color: 'var(--tx2)' }}>{a.brd_final.title}</span>
                {a.brd_job_id && <button className="btn btn-g btn-sm" style={{ marginLeft: '6px' }} onClick={() => window.open(`/api/brd/${a.brd_job_id}/download`)}>⬇ DOCX</button>}
              </div>
            )}
            <div style={{ fontSize: '9px', color: 'var(--tx3)', fontFamily: "'DM Mono',monospace", marginBottom: '4px' }}>AI DRAFT — CLICK TO EDIT</div>
            <div className="draft" ref={draftRef} contentEditable={a.status === 'pending' ? 'true' : 'false'} suppressContentEditableWarning>
              {a.draft_body}
            </div>
          </div>
          <div className="ac-foot">
            {a.status === 'pending' && (
              <>
                <button className="btn btn-grn btn-sm" onClick={handleApprove}>✓ Send Real Email</button>
                <button className="btn btn-red btn-sm" onClick={handleReject}>✕ Reject</button>
              </>
            )}
            {!['pending'].includes(a.status) && <span style={{ fontSize: '10px', color: 'var(--tx3)' }}>Status: {a.status}</span>}
          </div>
        </>
      )}
    </div>
  )
}

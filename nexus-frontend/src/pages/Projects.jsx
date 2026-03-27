import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { getProjects, createProject, getProjectContext, getProjectBRD, generateProjectBRD, uploadProjectDoc, attachEmailToProject, getUnassignedEmails } from '../services/api'

const LABELS = {
  executive_summary: 'Executive Summary', business_objectives: 'Business Objectives', scope: 'Scope',
  functional_requirements: 'Functional Requirements', non_functional_requirements: 'Non-Functional Requirements',
  stakeholders_decisions: 'Stakeholders & Decisions', risks_constraints: 'Risks & Constraints',
  feature_prioritization: 'Feature Prioritization', timeline_milestones: 'Timeline & Milestones',
}

export default function Projects() {
  const { toast, state } = useApp()
  const [projects, setProjects] = useState([])
  const [active, setActive] = useState(null)
  const [context, setContext] = useState({ emails: [], documents: [] })
  const [brdContent, setBrdContent] = useState(null)
  const [brdRunning, setBrdRunning] = useState({})
  const [tab, setTab] = useState('context')
  const [showPasteModal, setShowPasteModal] = useState(false)
  const [pasteLabel, setPasteLabel] = useState('')
  const [pasteBody, setPasteBody] = useState('')
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [unassignedEmails, setUnassignedEmails] = useState([])

  const load = async () => {
    try { const d = await getProjects(); setProjects(d.projects || []) }
    catch { toast('Cannot load projects', 'warn') }
  }

  useEffect(() => { load() }, [])

  const selectProject = async (p) => {
    setActive(p); setTab('context'); setBrdContent(null)
    try {
      const ctx = await getProjectContext(p.id)
      setContext({ emails: ctx.emails || [], documents: ctx.documents || [] })
    } catch { setContext({ emails: [], documents: [] }) }
    try {
      const b = await getProjectBRD(p.id)
      if (b.brd?.content?.sections) setBrdContent(b.brd.content.sections)
    } catch {}
  }

  const handleNewProject = async () => {
    const name = window.prompt('Project Name:')
    if (!name) return
    try {
      await createProject(name, 'Manually created project')
      toast('✅ Project created', 'ok'); load()
    } catch { toast('Create failed', 'warn') }
  }

  const handleGenerateBRD = async (id) => {
    setBrdRunning(r => ({ ...r, [id]: true }))
    try {
      const d = await generateProjectBRD(id)
      if (d.error) toast(d.error, 'warn')
      else if (d.status === 'already_running') toast('BRD already running', 'warn')
      else toast('⚡ BRD generation started', 'ok')
    } catch { toast('Backend error', 'warn') }
    setBrdRunning(r => { const n = { ...r }; delete n[id]; return n })
  }

  const handleUploadDoc = async (e) => {
    const file = e.target.files[0]; if (!file || !active) return
    try { await uploadProjectDoc(active.id, file); toast('✓ Saved to project', 'ok'); selectProject(active) }
    catch { toast('Upload failed', 'warn') }
  }

  const handlePaste = async () => {
    if (!pasteBody.trim() || !active) return
    const blob = new Blob([pasteBody], { type: 'text/plain' })
    const fd = new FormData(); fd.append('file', blob, (pasteLabel || 'Transcript') + '.txt')
    try {
      const r = await fetch(`/api/projects/${active.id}/upload-doc`, { method: 'POST', body: fd })
      if (r.ok) { toast('✓ Transcript saved', 'ok'); setShowPasteModal(false); setPasteBody(''); selectProject(active) }
      else toast('Failed', 'warn')
    } catch { toast('Error', 'warn') }
  }

  const openAssignModal = async () => {
    setShowAssignModal(true)
    try { const d = await getUnassignedEmails(); setUnassignedEmails(d.emails || []) }
    catch { setUnassignedEmails([]) }
  }

  const assignEmail = async (emailId, emailSubject) => {
    if (!active) return
    try {
      await attachEmailToProject(active.id, emailId)
      toast(`✓ "${emailSubject.slice(0, 40)}" linked`, 'ok')
      setShowAssignModal(false); selectProject(active)
    } catch { toast('Link failed', 'warn') }
  }

  return (
    <div>
      <div className="ph">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div><div className="pt">Project Intelligence</div><div className="ps-h">Consolidated context per project — generate BRD in one click.</div></div>
          <button className="btn btn-a" onClick={handleNewProject}>+ New Project</button>
        </div>
      </div>
      <div className="g2">
        {/* Project list */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {projects.length ? projects.map(p => (
            <div key={p.id} className="ac" style={{ cursor: 'pointer', margin: '0', borderRadius: '0', borderLeft: 'none', borderRight: 'none', borderTop: 'none' }} onClick={() => selectProject(p)}>
              <div className="ac-h">
                <div className="ac-av" style={{ background: 'var(--gdim)', color: 'var(--grn)' }}>{(p.name || '?')[0]}</div>
                <div>
                  <div className="ac-from">{p.name || 'Project'}</div>
                  <div className="ac-sub">{p.status || ''} • {p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}</div>
                </div>
              </div>
              {brdRunning[p.id] && <div style={{ fontSize: '10px', color: 'var(--pur)', padding: '0 16px 10px' }}>Generating BRD…</div>}
            </div>
          )) : <div className="empty">No projects found. Create one to begin.</div>}
        </div>

        {/* Project detail */}
        {active ? (
          <div className="card" style={{ minHeight: '400px' }}>
            <div className="ch">
              <h2 className="card-t" style={{ margin: 0 }}>{active.name}</h2>
              <button className="btn btn-a" onClick={() => handleGenerateBRD(active.id)} disabled={brdRunning[active.id]}>
                {brdRunning[active.id] ? '… Generating' : '⚡ Generate BRD'}
              </button>
            </div>
            <div className="tabs">
              <div className={`tab${tab === 'context' ? ' on' : ''}`} onClick={() => setTab('context')}>Context</div>
              <div className={`tab${tab === 'brd' ? ' on' : ''}`} onClick={() => setTab('brd')}>Generated BRD</div>
            </div>

            {/* Context tab */}
            {tab === 'context' && (
              <div>
                <div style={{ fontSize: '10px', color: 'var(--blu)', fontWeight: 600, letterSpacing: '.5px', marginBottom: '6px' }}>LINKED EMAILS</div>
                <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                  {context.emails.length ? context.emails.map((e, i) => (
                    <div key={i} style={{ padding: '10px', border: '1px solid var(--bdr)', background: 'var(--bg3)', borderRadius: '8px', marginBottom: '8px' }}>
                      <div style={{ fontSize: '10px', color: 'var(--tx3)' }}>From: {e.sender || ''}</div>
                      <div style={{ fontSize: '11px', fontWeight: 600, margin: '2px 0' }}>{e.subject || '(no subject)'}</div>
                      <div style={{ fontSize: '10px', color: 'var(--tx2)' }}>{(e.body || '').slice(0, 160)}...</div>
                    </div>
                  )) : <div className="empty" style={{ padding: '12px 0' }}>No emails linked yet.</div>}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--pur)', fontWeight: 600, letterSpacing: '.5px', marginTop: '18px', marginBottom: '6px' }}>TRANSCRIPTS & DOCUMENTS</div>
                <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                  {context.documents.length ? context.documents.map((d, i) => (
                    <div key={i} style={{ padding: '10px', border: '1px solid var(--bdr)', background: 'rgba(191,90,242,.06)', borderLeft: '3px solid var(--pur)', borderRadius: '8px', marginBottom: '8px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pur)' }}>{d.filename}</div>
                      <div style={{ fontSize: '9px', color: 'var(--tx3)', fontFamily: "'DM Mono',monospace", marginBottom: '4px' }}>[{(d.type || 'doc').toUpperCase()}]</div>
                      <div style={{ fontSize: '10px', color: 'var(--tx2)' }}>{(d.content || '').slice(0, 180)}...</div>
                    </div>
                  )) : <div className="empty" style={{ padding: '12px 0' }}>No documents uploaded yet.</div>}
                </div>
                <div style={{ marginTop: '14px', padding: '12px', background: 'var(--bg3)', borderRadius: 'var(--rs)', border: '1px dashed var(--bdr2)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--tx3)', marginBottom: '8px', letterSpacing: '.4px' }}>ADD RESOURCE TO PROJECT</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <label className="btn btn-g btn-sm" style={{ cursor: 'pointer' }}>
                      📎 Upload Transcript/PDF
                      <input type="file" style={{ display: 'none' }} onChange={handleUploadDoc} />
                    </label>
                    <button className="btn btn-g btn-sm" onClick={() => setShowPasteModal(true)}>✏ Paste Transcript</button>
                    <button className="btn btn-g btn-sm" onClick={openAssignModal}>✉ Assign Email</button>
                  </div>
                </div>
              </div>
            )}

            {/* BRD tab */}
            {tab === 'brd' && (
              <div>
                <div className="brd-content" style={{ maxHeight: 'unset', height: '540px' }}>
                  {brdContent ? Object.entries(brdContent).map(([k, v]) => (
                    <div key={k} style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--a2)', marginBottom: '3px' }}>{LABELS[k] || k}</div>
                      <div style={{ fontSize: '10px', color: 'var(--tx2)', lineHeight: 1.7 }}>{typeof v === 'string' ? v : JSON.stringify(v, null, 2)}</div>
                      <hr style={{ borderColor: 'var(--bdr)', margin: '8px 0' }} />
                    </div>
                  )) : <div style={{ color: 'var(--tx3)', fontSize: '12px' }}>No BRD generated yet. Click Generate BRD.</div>}
                </div>
              </div>
            )}
          </div>
        ) : <div className="card"><div className="empty">Select a project to view details</div></div>}
      </div>

      {/* Paste Modal */}
      {showPasteModal && (
        <div className="modal-overlay" onClick={() => setShowPasteModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>📋 Paste Transcript / Chat Log</div>
            <div className="field">
              <label>Label</label>
              <input type="text" value={pasteLabel} onChange={e => setPasteLabel(e.target.value)} placeholder="e.g. Q1 Kickoff Meeting" />
            </div>
            <textarea value={pasteBody} onChange={e => setPasteBody(e.target.value)} rows={9} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--bdr2)', borderRadius: 'var(--rs)', padding: '9px', color: 'var(--tx)', fontSize: '11px', outline: 'none', resize: 'vertical' }} placeholder="[10:00] PM: We need a user auth system..." />
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
              <button className="btn btn-g" onClick={() => setShowPasteModal(false)}>Cancel</button>
              <button className="btn btn-a" onClick={handlePaste}>Save to Project</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Email Modal */}
      {showAssignModal && (
        <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>✉ Assign Unassigned Email</div>
            <div id="assign-email-list" style={{ maxHeight: '320px', overflowY: 'auto' }}>
              {unassignedEmails.length ? unassignedEmails.map(e => (
                <div key={e.id} style={{ padding: '10px', border: '1px solid var(--bdr)', borderRadius: '8px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', fontWeight: 600 }}>{e.subject || '(no subject)'}</div>
                    <div style={{ fontSize: '10px', color: 'var(--tx3)' }}>{e.sender || ''}</div>
                  </div>
                  <button className="btn btn-a btn-sm" onClick={() => assignEmail(e.id, e.subject || '')}>Assign →</button>
                </div>
              )) : <div className="empty">No unassigned emails.</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button className="btn btn-g" onClick={() => setShowAssignModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

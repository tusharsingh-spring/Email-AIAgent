import { useEffect, useState, useRef } from 'react'
import { useApp } from '../context/AppContext'
import {
  getProjects, createProject, deleteProject, getProjectEmails, getProjectDocuments,
  getProjectBRD, generateProjectBRD, uploadProjectDoc, attachEmail, getUnassignedEmails, downloadBrd
} from '../services/api'
import { FolderPlus, Plus, Download, FileText, Mail, Cpu, Loader2, Trash2 } from 'lucide-react'
import PipelineGraph from '../components/ProjectStudio/PipelineGraph'
import BRDSectionContent from '../components/ui/BRDSectionContent'

const LABELS = {
  executive_summary: 'Executive Summary', business_objectives: 'Business Objectives', scope: 'Scope',
  functional_requirements: 'Functional Requirements', non_functional_requirements: 'Non-Functional Requirements',
  stakeholders_decisions: 'Stakeholders & Decisions', risks_constraints: 'Risks & Constraints',
  feature_prioritization: 'Feature Prioritization', timeline_milestones: 'Timeline & Milestones',
}

export default function Projects() {
  const { toast = () => {}, state = {} } = useApp() || {}
  const [projects, setProjects] = useState([])
  const [active, setActive] = useState(null)
  const [context, setContext] = useState({ emails: [], documents: [] })
  const [brdContent, setBrdContent] = useState(null)
  const [activeBrdId, setActiveBrdId] = useState(null)
  const [brdRunning, setBrdRunning] = useState({})

  const [showNewModal, setShowNewModal] = useState(false)
  const [newName, setNewName] = useState('')
  const newNameRef = useRef(null)

  const [showPasteModal, setShowPasteModal] = useState(false)
  const [pasteLabel, setPasteLabel] = useState('')
  const [pasteBody, setPasteBody] = useState('')
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [unassignedEmails, setUnassignedEmails] = useState([])

  const [ready, setReady] = useState(false)
  useEffect(() => { setTimeout(() => setReady(true), 150) }, [])
  useEffect(() => { if (showNewModal) setTimeout(() => newNameRef.current?.focus(), 50) }, [showNewModal])

  const load = async () => {
    try { const d = await getProjects(); setProjects(d.projects || []) }
    catch { toast('Cannot load projects', 'warn') }
  }
  useEffect(() => { load() }, [])

  const selectProject = async (p) => {
    setActive(p); setBrdContent(null); setActiveBrdId(null)
    try {
      const [eRes, dRes] = await Promise.all([getProjectEmails(p.id), getProjectDocuments(p.id)])
      setContext({ emails: eRes.emails || [], documents: dRes.documents || [] })
    } catch { setContext({ emails: [], documents: [] }) }
    try {
      const b = await getProjectBRD(p.id)
      if (b.brd?.content?.sections) { setBrdContent(b.brd.content.sections); setActiveBrdId(b.brd.id || null) }
    } catch {}
  }

  const handleNewProject = async () => {
    if (!newName.trim()) return
    try {
      await createProject(newName.trim(), 'Created via Project Studio')
      toast('Project workspace initialized.', 'ok')
      setShowNewModal(false); setNewName(''); load()
    } catch { toast('Creation failed', 'warn') }
  }

  const handleDeleteProject = async () => {
    if (!active) return
    if (!window.confirm(`Delete "${active.name}"?`)) return
    try {
      const r = await deleteProject(active.id)
      if (r.error) { toast(r.error, 'warn'); return }
      toast('Project deleted', 'ok')
      setActive(null); setContext({ emails: [], documents: [] }); setBrdContent(null); setActiveBrdId(null); load()
    } catch { toast('Delete failed', 'warn') }
  }

  const handleGenerateBRD = async (id) => {
    setBrdRunning(r => ({ ...r, [id]: true }))
    window.dispatchEvent(new CustomEvent('nexus:brdStatus', { detail: { type: 'brd_running' } }))
    try {
      const d = await generateProjectBRD(id)
      if (d.error) toast(d.error, 'warn')
      else if (d.status === 'already_running') toast('Pipeline already active.', 'warn')
      else toast('AI Pipeline Initialized.', 'ok')
    } catch { toast('Backend offline.', 'warn') }
    setBrdRunning(r => { const n = { ...r }; delete n[id]; return n })
  }

  const handleUploadDoc = async (e) => {
    const file = e.target.files[0]; if (!file || !active) return
    try { await uploadProjectDoc(active.id, file); toast('Document processed.', 'ok'); selectProject(active) }
    catch { toast('Upload failed.', 'warn') }
  }

  const handlePaste = async () => {
    if (!pasteBody.trim() || !active) return
    const blob = new Blob([pasteBody], { type: 'text/plain' })
    const fd = new FormData(); fd.append('file', blob, (pasteLabel || 'Transcript') + '.txt')
    try {
      const r = await fetch(`/api/projects/${active.id}/upload-doc`, { method: 'POST', body: fd })
      if (r.ok) { toast('Transcript processed.', 'ok'); setShowPasteModal(false); setPasteLabel(''); setPasteBody(''); selectProject(active) }
      else toast('Failed', 'warn')
    } catch { toast('Error', 'warn') }
  }

  const openAssignModal = async () => {
    setShowAssignModal(true)
    try { const d = await getUnassignedEmails(); setUnassignedEmails(d.emails || []) }
    catch { setUnassignedEmails([]) }
  }

  const assignEmailToProject = async (emailId, emailSubject) => {
    if (!active) return
    try {
      await attachEmail(active.id, emailId)
      toast(`Linked: ${emailSubject.slice(0, 30)}`, 'ok')
      setShowAssignModal(false); selectProject(active)
    } catch { toast('Link failed', 'warn') }
  }

  const contextCount = context.emails.length + context.documents.length
  const isRunning = brdRunning[active?.id]
  const brdIsReady = !!brdContent
  const sectionEntries = brdContent ? Object.entries(brdContent) : []

  return (
    <div className={`transition-opacity duration-700 pb-24 ${ready ? 'opacity-100' : 'opacity-0'}`}>

      {/* ── HEADER ── */}
      <div className="mb-8 mt-6">
        <div className="htag mb-3">Project Intelligence / Mission Control</div>
        <h1 className="font-bebas text-[clamp(36px,5.5vw,72px)] leading-[0.9] tracking-[0.01em] uppercase">
          Mission Control
        </h1>
      </div>

      {/* ── TWO-COLUMN LAYOUT ── */}
      <div className="flex flex-col md:flex-row gap-5 items-start">

        {/* LEFT — Vertical Project List */}
        <div className="w-full md:w-[200px] md:shrink-0 md:sticky md:top-20">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-brand-border">
            <span className="font-space text-[9px] uppercase tracking-[0.2em] text-brand-muted">Workspaces</span>
            <button onClick={() => setShowNewModal(true)}
              className="flex items-center gap-1 font-space text-[9px] uppercase tracking-widest text-brand-blue hover:text-white transition-colors">
              <Plus size={10} /> New
            </button>
          </div>

          <div className="flex flex-col gap-1 md:max-h-[calc(100vh-220px)] md:overflow-y-auto pr-1 max-h-[180px] overflow-y-auto">
            {projects.length === 0 ? (
              <div className="text-brand-muted font-space text-[9px] py-6 text-center" style={{ opacity: 0.35 }}>
                No workspaces yet
              </div>
            ) : projects.map(p => {
              const isAct = active?.id === p.id
              return (
                <button key={p.id} onClick={() => selectProject(p)}
                  className="w-full text-left px-3 py-2.5 rounded-sm border transition-all relative overflow-hidden"
                  style={{
                    borderColor: isAct ? 'var(--color-brand-blue)' : 'rgba(255,255,255,0.07)',
                    background: isAct ? 'rgba(0,181,226,0.07)' : 'transparent',
                  }}>
                  {isAct && (
                    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-brand-blue rounded-full"
                      style={{ boxShadow: '0 0 8px rgba(0,181,226,0.7)' }} />
                  )}
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-1"
                      style={{ background: isAct ? 'var(--color-brand-blue)' : 'rgba(255,255,255,0.18)' }} />
                    <span className="font-dm text-[12px] font-medium leading-snug"
                      style={{ color: isAct ? '#fff' : 'rgba(255,255,255,0.42)' }}>
                      {p.name || 'Unnamed'}
                    </span>
                  </div>
                  {brdRunning[p.id] && (
                    <div className="h-[2px] mt-2 w-full rounded-full"
                      style={{ background: 'var(--color-brand-yellow)', animation: 'marquee 1.5s linear infinite' }} />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* RIGHT — Workspace */}
        <div className="flex-1 min-w-0">
          {!active ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center min-h-[480px] gap-4 border border-brand-border rounded-sm"
              style={{ background: '#050505' }}>
              <FolderPlus size={36} style={{ opacity: 0.1, color: 'var(--color-brand-blue)' }} />
              <div className="font-space text-[10px] uppercase tracking-widest" style={{ opacity: 0.28 }}>
                Select or create a workspace
              </div>
              <button onClick={() => setShowNewModal(true)}
                className="mt-1 flex items-center gap-2 border border-brand-blue/30 text-brand-blue px-5 py-2.5 rounded-sm font-space text-[10px] uppercase tracking-widest hover:bg-brand-blue hover:text-black transition-all">
                <FolderPlus size={12} /> New Workspace
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-5">

              {/* Project header bar */}
              <div className="flex items-start justify-between gap-4 pb-5 border-b border-brand-border">
                <div className="min-w-0">
                  <h2 className="font-bebas text-[clamp(22px,3vw,38px)] leading-none tracking-[0.02em] uppercase text-white truncate">
                    {active.name}
                  </h2>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="font-space text-[9px] uppercase tracking-[0.15em] text-brand-muted">
                      {contextCount} context item{contextCount !== 1 ? 's' : ''}
                    </span>
                    {brdIsReady && (
                      <span className="font-space text-[9px] uppercase tracking-[0.15em]" style={{ color: '#00ff9d' }}>
                        ✓ BRD Ready
                      </span>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <button onClick={openAssignModal}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-brand-border text-brand-muted hover:text-white hover:border-white/20 rounded-sm font-space text-[9px] uppercase tracking-widest transition-all">
                    <Mail size={10} /> Link
                  </button>
                  <button onClick={() => setShowPasteModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-brand-border text-brand-muted hover:text-white hover:border-white/20 rounded-sm font-space text-[9px] uppercase tracking-widest transition-all">
                    <FileText size={10} /> Paste
                  </button>
                  <label className="flex items-center gap-1.5 px-3 py-1.5 border border-brand-border text-brand-muted hover:text-white hover:border-white/20 rounded-sm font-space text-[9px] uppercase tracking-widest transition-all cursor-pointer">
                    <Download size={10} /> Upload
                    <input type="file" accept=".pdf,.txt,.doc,.docx" onChange={handleUploadDoc} className="hidden" />
                  </label>
                  <button onClick={() => handleGenerateBRD(active.id)} disabled={!!isRunning}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-sm font-space text-[9px] uppercase tracking-widest font-bold transition-all disabled:opacity-50"
                    style={{ background: 'var(--color-brand-blue)', color: '#000' }}>
                    {isRunning ? <Loader2 size={10} className="animate-spin" /> : <Cpu size={10} />}
                    {isRunning ? 'Running…' : 'Generate BRD'}
                  </button>
                  <button onClick={handleDeleteProject}
                    className="p-1.5 border border-transparent text-brand-muted hover:text-red-400 hover:border-red-400/20 rounded-sm transition-all">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Context chips */}
              {contextCount > 0 && (
                <div className="flex flex-wrap gap-2">
                  {context.emails.map(e => (
                    <div key={e.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-brand-border font-dm text-[11px]"
                      style={{ color: 'rgba(255,255,255,0.45)' }}>
                      <Mail size={9} style={{ color: 'var(--color-brand-blue)', flexShrink: 0 }} />
                      <span className="truncate max-w-[200px]">{e.subject || 'Email'}</span>
                    </div>
                  ))}
                  {context.documents.map(d => (
                    <div key={d.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-brand-border font-dm text-[11px]"
                      style={{ color: 'rgba(255,255,255,0.45)' }}>
                      <FileText size={9} style={{ color: 'var(--color-brand-yellow)', flexShrink: 0 }} />
                      <span className="truncate max-w-[200px]">{d.name || 'Document'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Pipeline Graph */}
              <div className="border border-brand-border rounded-sm overflow-hidden" style={{ background: '#050505' }}>
                <PipelineGraph
                  contextCount={contextCount}
                  isRunning={isRunning}
                  brdIsReady={brdIsReady}
                  activeBrdId={activeBrdId}
                  onDownload={downloadBrd}
                  onRun={() => handleGenerateBRD(active.id)}
                />
              </div>

              {/* BRD Article Viewer */}
              {brdIsReady && (
                <div className="border border-brand-border rounded-sm overflow-hidden" style={{ background: '#050505' }}>
                  <div className="p-8 md:p-12">
                    <div className="font-space text-[9px] uppercase tracking-[0.22em] mb-10"
                      style={{ color: '#00ff9d', opacity: 0.7 }}>
                      ✓ Generated Document
                    </div>
                    <article className="max-w-[720px] mx-auto">
                      {sectionEntries.map(([k, v], idx) => (
                        <section key={k} className="mb-12">
                          <div className="snum" style={{ color: 'rgba(255,255,255,0.18)' }}>
                            {String(idx + 1).padStart(2, '0')}
                          </div>
                          <h2 className="font-bebas text-[clamp(24px,2.8vw,32px)] leading-none tracking-[0.02em] uppercase mb-5 pb-3 border-b border-brand-border"
                            style={{ color: 'var(--color-brand-yellow)' }}>
                            {LABELS[k] || k}
                          </h2>
                          <BRDSectionContent sectionKey={k} value={v} />
                        </section>
                      ))}
                    </article>
                    {activeBrdId && (
                      <div className="flex items-center gap-3 pt-6 mt-4 border-t border-brand-border">
                        <span className="font-space text-[9px] uppercase tracking-widest text-brand-muted">Export:</span>
                        <button onClick={() => downloadBrd(activeBrdId, 'pdf')}
                          className="flex items-center gap-1.5 px-4 py-2 border border-brand-border text-brand-muted hover:text-brand-blue hover:border-brand-blue/40 rounded-sm font-space text-[10px] uppercase tracking-widest transition-all">
                          <Download size={12} /> PDF
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL: New Workspace ── */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-center justify-center p-4"
          onClick={() => setShowNewModal(false)}>
          <div className="bg-brand-panel border border-brand-border p-8 w-full max-w-md rounded-sm shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="font-bebas text-3xl mb-2 text-brand-text">New Workspace</h3>
            <p className="text-[13px] text-brand-muted font-dm mb-6">Name your workspace to get started.</p>
            <input ref={newNameRef} type="text" placeholder="e.g. ACME Platform Redesign"
              value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleNewProject(); if (e.key === 'Escape') setShowNewModal(false) }}
              className="w-full bg-brand-input border border-brand-border text-brand-text p-3 mb-6 rounded-sm font-dm text-[14px] outline-none focus:border-brand-blue transition-colors" />
            <div className="flex justify-end gap-3">
              <button className="px-5 py-2.5 font-space text-[10px] uppercase tracking-widest text-brand-muted hover:text-brand-text transition-colors"
                onClick={() => setShowNewModal(false)}>Cancel</button>
              <button onClick={handleNewProject} disabled={!newName.trim()}
                className="px-6 py-2.5 bg-brand-blue text-black font-space text-[10px] uppercase tracking-widest font-bold hover:bg-white transition-all rounded-sm disabled:opacity-40">
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Paste Text ── */}
      {showPasteModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-center justify-center p-4"
          onClick={() => setShowPasteModal(false)}>
          <div className="bg-brand-panel border border-brand-border p-8 w-full max-w-lg rounded-sm shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="font-bebas text-3xl mb-2 text-brand-text">Paste Raw Text</h3>
            <p className="text-[13px] text-brand-muted font-dm mb-6">Meeting notes, transcripts, or any context.</p>
            <input type="text" placeholder="Label (optional)"
              value={pasteLabel} onChange={e => setPasteLabel(e.target.value)}
              className="w-full bg-brand-input border border-brand-border text-brand-text p-3 mb-3 rounded-sm font-dm text-[14px] outline-none focus:border-brand-blue transition-colors" />
            <textarea placeholder="Paste your content here..." rows={8}
              value={pasteBody} onChange={e => setPasteBody(e.target.value)}
              className="w-full bg-brand-input border border-brand-border text-brand-text p-3 mb-6 rounded-sm font-dm text-[14px] outline-none focus:border-brand-blue transition-colors resize-none" />
            <div className="flex justify-end gap-3">
              <button className="px-5 py-2.5 font-space text-[10px] uppercase tracking-widest text-brand-muted hover:text-brand-text transition-colors"
                onClick={() => setShowPasteModal(false)}>Cancel</button>
              <button onClick={handlePaste} disabled={!pasteBody.trim()}
                className="px-6 py-2.5 bg-brand-blue text-black font-space text-[10px] uppercase tracking-widest font-bold hover:bg-white transition-all rounded-sm disabled:opacity-40">
                Process
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Link Email ── */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-center justify-center p-4"
          onClick={() => setShowAssignModal(false)}>
          <div className="bg-brand-panel border border-brand-border p-8 w-full max-w-lg rounded-sm shadow-2xl max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <h3 className="font-bebas text-3xl mb-2 text-brand-text">Link Email Context</h3>
            <p className="text-[13px] text-brand-muted font-dm mb-6">Select an email to attach as project context.</p>
            <div className="flex-1 overflow-y-auto space-y-2">
              {unassignedEmails.length === 0 ? (
                <div className="text-center text-brand-muted font-space text-[11px] py-8">No unassigned emails</div>
              ) : unassignedEmails.map(e => {
                const name = e.from_name || e.from || '?'
                const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                const hue = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
                return (
                  <button key={e.id} onClick={() => assignEmailToProject(e.id, e.subject || '')}
                    className="w-full flex items-center gap-3 p-3 border border-brand-border hover:border-brand-blue/40 rounded-sm transition-all text-left group">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-dm font-bold text-[11px] text-white"
                      style={{ background: `hsl(${hue},55%,32%)` }}>
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-dm text-[13px] font-medium text-brand-text truncate group-hover:text-brand-blue transition-colors">
                        {e.subject || 'No Subject'}
                      </div>
                      <div className="font-dm text-[11px] text-brand-muted truncate">{e.from_name || e.from}</div>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="flex justify-end mt-6 pt-4 border-t border-brand-border">
              <button className="px-5 py-2.5 font-space text-[10px] uppercase tracking-widest text-brand-muted hover:text-brand-text transition-colors"
                onClick={() => setShowAssignModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

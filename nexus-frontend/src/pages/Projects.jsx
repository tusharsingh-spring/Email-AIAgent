import { useEffect, useState, useRef } from 'react'
import { useApp } from '../context/AppContext'
import {
  getProjects, getProject, deleteProject, getProjectEmails, getProjectDocuments, getProjectContext,
  getProjectBRD, getProjectBRDStatus, generateProjectBRD, runProjectAgent, uploadProjectDoc,
  assignEmail, getUnassignedEmails, downloadBrd, createProject
} from '../services/api'
import { FolderPlus, Plus, Download, FileText, Mail, Cpu, Loader2, Trash2 } from 'lucide-react'
import PipelineGraph from '../components/ProjectStudio/PipelineGraph'
import ContextSidebar from '../components/ProjectStudio/ContextSidebar'
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
  const [contextBlob, setContextBlob] = useState('')
  const [projectDetails, setProjectDetails] = useState(null)
  const [brdStatus, setBrdStatus] = useState(null)
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
    setActive(p); setBrdContent(null); setActiveBrdId(null); setProjectDetails(null); setBrdStatus(null); setContextBlob('')
    try {
      const [eRes, dRes] = await Promise.all([getProjectEmails(p.id), getProjectDocuments(p.id)])
      setContext({ emails: eRes.emails || [], documents: dRes.documents || [] })
    } catch { setContext({ emails: [], documents: [] }) }
    try {
      const [details, ctx, status] = await Promise.all([
        getProject(p.id).catch(() => ({})),
        getProjectContext(p.id).catch(() => ({})),
        getProjectBRDStatus(p.id).catch(() => ({})),
      ])
      if (details?.project) setProjectDetails(details.project)
      if (ctx?.context || ctx?.full_text) setContextBlob(ctx.context || ctx.full_text || '')
      if (status) setBrdStatus(status)
    } catch {}
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

  const handleRunAgent = async () => {
    if (!active) return
    try {
      await runProjectAgent(active.id)
      toast('Agent pipeline triggered', 'ok')
    } catch { toast('Agent trigger failed', 'warn') }
  }

  const refreshBrdStatus = async () => {
    if (!active) return
    try { const s = await getProjectBRDStatus(active.id); setBrdStatus(s) }
    catch { toast('Status check failed', 'warn') }
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
      await assignEmail(active.id, emailId)
      toast(`Linked: ${emailSubject.slice(0, 30)}`, 'ok')
      setShowAssignModal(false); selectProject(active)
    } catch { toast('Link failed', 'warn') }
  }

  const contextCount = context.emails.length + context.documents.length
  const isRunning = brdRunning[active?.id]
  const brdIsReady = !!brdContent
  const sectionEntries = brdContent ? Object.entries(brdContent) : []

  const sidebarEmails = (context.emails || []).map(e => ({
    ...e,
    sender: e.from_name || e.from || e.sender || 'Unknown sender',
  }))

  const sidebarDocs = (context.documents || []).map(d => ({
    ...d,
    filename: d.filename || d.name || 'Document',
    content: d.content || d.text || d.snippet || '',
  }))

  return (
    <div className={`min-h-screen font-sans text-zinc-100 transition-opacity duration-700 pb-24 selection:bg-blue-500/30 ${ready ? 'opacity-100' : 'opacity-0'}`}>

      {/* ── HEADER ── */}
      <div className="max-w-[1400px] mx-auto pt-12 px-6 lg:px-8 mb-8">
        <div className="font-mono text-[11px] text-zinc-500 uppercase tracking-widest mb-2 font-medium">Project Intelligence</div>
        <h1 className="font-sans text-4xl font-semibold tracking-tight text-white">
          Project Studio
        </h1>
      </div>

      {/* ── TWO-COLUMN LAYOUT ── */}
      <div className="max-w-[1400px] mx-auto px-6 lg:px-8 flex flex-col md:flex-row gap-8 items-start">

        {/* LEFT — Vertical Project List */}
        <div className="w-full md:w-[260px] md:shrink-0 md:sticky md:top-24">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
            <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 font-medium">Workspaces</span>
            <button 
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition-colors font-sans text-xs font-semibold"
            >
              <Plus size={14} /> New
            </button>
          </div>

          <div className="flex flex-col gap-1.5 md:max-h-[calc(100vh-240px)] md:overflow-y-auto pr-2 max-h-[220px] overflow-y-auto no-scrollbar mask-edges-vertical">
            {projects.length === 0 ? (
              <div className="text-zinc-600 font-sans text-sm py-8 text-center font-medium">
                No workspaces yet
              </div>
            ) : projects.map(p => {
              const isAct = active?.id === p.id
              return (
              <button 
                key={p.id} 
                onClick={() => selectProject(p)}
                className={`w-full text-left px-3.5 py-3 rounded-lg border transition-all relative overflow-hidden shrink-0 group ${
                  isAct ? 'bg-blue-500/10 border-blue-500/30' : 'bg-[#121214] border-white/5 hover:border-white/10 hover:bg-white/[0.02]'
                }`}
              >
                {isAct && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-l-lg" />
                )}
                <div className="flex items-center gap-3 min-w-0">
                  <FolderPlus size={16} className={isAct ? 'text-blue-400' : 'text-zinc-500 group-hover:text-zinc-400'} />
                  <span
                    className={`font-sans text-sm font-medium truncate flex-1 ${isAct ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-300'}`}
                    title={p.name || 'Unnamed'}
                  >
                    {p.name || 'Unnamed'}
                  </span>
                </div>
                {brdRunning[p.id] && (
                  <div className="mt-2.5 w-full bg-white/5 rounded-full h-1 overflow-hidden">
                    <div className="h-full bg-blue-500/50 w-1/2 rounded-full animate-progress" />
                  </div>
                )}
              </button>
              )
            })}
          </div>
        </div>

        {/* RIGHT — Workspace */}
        <div className="flex-1 min-w-0 w-full">
          {!active ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center min-h-[500px] gap-4 bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-xl">
              <div className="p-5 rounded-full bg-white/5 border border-white/5">
                <FolderPlus size={40} className="text-zinc-600" />
              </div>
              <div className="font-sans text-lg font-medium text-zinc-400">
                Select or create a workspace
              </div>
              <button 
                onClick={() => setShowNewModal(true)}
                className="mt-2 flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-sans text-sm font-semibold hover:bg-blue-500 transition-colors shadow-sm"
              >
                <Plus size={16} /> New Workspace
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-6">

              {/* Project Header Bar */}
              <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6 pb-6 border-b border-white/10">
                <div className="min-w-0">
                  <h2 className="font-sans text-3xl font-semibold text-white tracking-tight truncate mb-2">
                    {active.name}
                  </h2>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-400 bg-[#121214] px-2 py-1 rounded border border-white/5 font-medium">
                      {contextCount} Context Item{contextCount !== 1 ? 's' : ''}
                    </span>
                    {brdIsReady && (
                      <span className="font-mono text-[11px] uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 font-medium">
                        ✓ BRD Ready
                      </span>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                  <button 
                    onClick={openAssignModal}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#121214] border border-white/10 text-zinc-300 hover:bg-white/5 hover:text-white rounded-lg font-sans text-sm font-medium transition-colors"
                  >
                    <Mail size={14} className="text-zinc-500" /> Link Email
                  </button>
                  
                  <div className="h-6 w-px bg-white/10 mx-1 hidden sm:block"></div>

                  <button 
                    onClick={() => setShowPasteModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#121214] border border-white/10 text-zinc-300 hover:bg-white/5 hover:text-white rounded-lg font-sans text-sm font-medium transition-colors"
                  >
                    <FileText size={14} className="text-zinc-500" /> Paste Text
                  </button>
                  <label className="flex items-center gap-1.5 px-3 py-2 bg-[#121214] border border-white/10 text-zinc-300 hover:bg-white/5 hover:text-white rounded-lg font-sans text-sm font-medium transition-colors cursor-pointer">
                    <Download size={14} className="text-zinc-500" /> Upload Doc
                    <input type="file" accept=".pdf,.txt,.doc,.docx" onChange={handleUploadDoc} className="hidden" />
                  </label>
                  
                  <div className="h-6 w-px bg-white/10 mx-1 hidden lg:block"></div>

                  <button 
                    onClick={() => handleGenerateBRD(active.id)} 
                    disabled={!!isRunning}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-sans text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {isRunning ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                    {isRunning ? 'Running Pipeline...' : 'Generate BRD'}
                  </button>
                  <button 
                    onClick={handleRunAgent}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-sans text-sm font-semibold transition-colors shadow-sm"
                  >
                    <Cpu size={16} /> Run Agent
                  </button>
                  <button 
                    onClick={handleDeleteProject}
                    className="p-2 border border-transparent text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors ml-1"
                    title="Delete Workspace"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Project Meta & Context Grid */}
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Meta Card */}
                <div className="bg-[#121214] border border-white/5 rounded-xl p-6 shadow-inner flex flex-col">
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-4 font-medium">
                    <FileText size={14} /> Workspace Meta
                  </div>
                  <h3 className="font-sans text-xl font-semibold text-white leading-tight mb-2">
                    {projectDetails?.name || active.name}
                  </h3>
                  <p className="font-sans text-sm text-zinc-400 leading-relaxed mb-4 flex-1">
                    {projectDetails?.description || 'No description provided.'}
                  </p>
                  {brdStatus && (
                    <div className="mt-auto pt-4 border-t border-white/5 flex items-center gap-3">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 font-medium">BRD Status</span>
                      <span className="font-mono text-[11px] uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded font-medium">
                        {brdStatus.status || brdStatus.message || 'unknown'}
                      </span>
                      <button onClick={refreshBrdStatus} className="p-1 text-zinc-500 hover:text-white transition-colors ml-auto font-mono text-[10px] uppercase tracking-widest">
                        Refresh
                      </button>
                    </div>
                  )}
                </div>

                {/* Context Card */}
                <div className="bg-[#121214] border border-white/5 rounded-xl p-6 shadow-inner flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500 font-medium">
                      <FileText size={14} /> Context Preview
                    </div>
                    <div className="font-mono text-[10px] text-zinc-500">{contextBlob ? `${contextBlob.length} chars` : 'Empty'}</div>
                  </div>
                  <div className="flex-1 font-sans text-sm leading-relaxed text-zinc-400 max-h-[160px] overflow-y-auto whitespace-pre-wrap no-scrollbar mask-edges-vertical pr-2">
                    {contextBlob || <span className="italic opacity-50">No aggregated context available. Upload documents or link emails to build context.</span>}
                  </div>
                </div>
              </div>

              {/* Main Content Area */}
              <div className="flex flex-col xl:flex-row gap-6 items-start mt-2">
                
                {/* Left Sidebar (Files/Emails) */}
                <div className="w-full xl:w-[320px] shrink-0">
                  <ContextSidebar
                    emails={sidebarEmails}
                    documents={sidebarDocs}
                    onUploadDoc={handleUploadDoc}
                    onPasteText={() => setShowPasteModal(true)}
                    onLinkEmail={openAssignModal}
                  />
                </div>

                <div className="flex-1 flex flex-col gap-6 min-w-0 w-full">
                  {/* Pipeline Graph Area */}
                  <div className="bg-[#121214] border border-white/5 rounded-xl overflow-hidden shadow-inner p-1">
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
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xl text-gray-900">
                      <div className="bg-gray-50 border-b border-gray-200 px-6 sm:px-12 py-4 flex items-center justify-between sticky top-0 z-10 backdrop-blur-xl bg-gray-50/80">
                        <div className="font-mono text-[11px] uppercase tracking-widest text-purple-600 font-semibold flex items-center gap-2">
                          <FileText size={16} /> Generated Requirements Document
                        </div>
                        {activeBrdId && (
                          <button 
                            onClick={() => downloadBrd(activeBrdId, 'pdf')}
                            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm"
                          >
                            <Download size={16} /> Export PDF
                          </button>
                        )}
                      </div>

                      <div className="p-6 sm:p-12 pb-16">
                        <article className="max-w-[760px] mx-auto space-y-12">
                          {sectionEntries.map(([k, v], idx) => (
                            <section key={k} className="scroll-mt-24">
                              <div className="flex items-center gap-4 mb-6 pb-4 border-b border-gray-200">
                                <span className="font-mono text-sm text-purple-600 font-bold bg-purple-100 px-2.5 py-1 rounded-md">
                                  {String(idx + 1).padStart(2, '0')}
                                </span>
                                <h2 className="font-sans text-2xl font-bold text-gray-900 tracking-tight">
                                  {LABELS[k] || k}
                                </h2>
                              </div>
                              <div className="prose prose-zinc prose-sm sm:prose-base max-w-none text-gray-700">
                                <BRDSectionContent sectionKey={k} value={v} />
                              </div>
                            </section>
                          ))}
                        </article>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MODALS ── */}
      
      {/* New Workspace Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
          onClick={() => setShowNewModal(false)}>
          <div className="bg-[#121214] border border-white/10 p-8 w-full max-w-md rounded-2xl shadow-2xl transform transition-all"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-sans text-2xl font-semibold text-white tracking-tight">New Workspace</h3>
              <button onClick={() => setShowNewModal(false)} className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 hover:text-white transition-colors p-1">Close</button>
            </div>
            <p className="text-sm text-zinc-400 mb-6">Create a dedicated area for project files and context.</p>
            
            <div className="space-y-4 mb-8">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-widest text-zinc-500 font-medium mb-2">Project Name</label>
                <input ref={newNameRef} type="text" placeholder="e.g. Q3 Roadmap Planning"
                  value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleNewProject(); if (e.key === 'Escape') setShowNewModal(false) }}
                  className="w-full bg-[#0a0a0a] border border-white/10 text-white p-3 rounded-lg font-sans text-sm outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all placeholder:text-zinc-600" />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button className="px-5 py-2.5 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                onClick={() => setShowNewModal(false)}>Cancel</button>
              <button onClick={handleNewProject} disabled={!newName.trim()}
                className="px-6 py-2.5 bg-blue-600 text-white font-sans text-sm font-semibold hover:bg-blue-500 transition-all rounded-lg disabled:opacity-50 shadow-sm">
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paste Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
          onClick={() => setShowPasteModal(false)}>
          <div className="bg-[#121214] border border-white/10 p-8 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-sans text-2xl font-semibold text-white tracking-tight">Paste Text Content</h3>
              <button onClick={() => setShowPasteModal(false)} className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 hover:text-white transition-colors p-1">Close</button>
            </div>
            <p className="text-sm text-zinc-400 mb-6">Quickly add meeting notes or text snippets to the project context.</p>
            
            <div className="flex-1 flex flex-col gap-4 min-h-0 mb-6">
              <input type="text" placeholder="Document Label (e.g. Kickoff Call Notes)"
                value={pasteLabel} onChange={e => setPasteLabel(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-white/10 text-white p-3 rounded-lg font-sans text-sm outline-none focus:border-blue-500/50 transition-all placeholder:text-zinc-600" />
              <textarea placeholder="Paste your raw text here..."
                value={pasteBody} onChange={e => setPasteBody(e.target.value)}
                className="w-full flex-1 min-h-[200px] bg-[#0a0a0a] border border-white/10 text-white p-3 rounded-lg font-sans text-sm outline-none focus:border-blue-500/50 transition-all resize-none placeholder:text-zinc-600" />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-white/5 shrink-0">
              <button className="px-5 py-2.5 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                onClick={() => setShowPasteModal(false)}>Cancel</button>
              <button onClick={handlePaste} disabled={!pasteBody.trim()}
                className="px-6 py-2.5 bg-blue-600 text-white font-sans text-sm font-semibold hover:bg-blue-500 transition-all rounded-lg disabled:opacity-50 shadow-sm">
                Add to Context
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link Email Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
          onClick={() => setShowAssignModal(false)}>
          <div className="bg-[#121214] border border-white/10 p-8 w-full max-w-2xl rounded-2xl shadow-2xl max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-sans text-2xl font-semibold text-white tracking-tight">Link Email</h3>
              <button onClick={() => setShowAssignModal(false)} className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 hover:text-white transition-colors p-1">Close</button>
            </div>
            <p className="text-sm text-zinc-400 mb-6">Select an unassigned email thread to add to this project's context.</p>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 no-scrollbar">
              {unassignedEmails.length === 0 ? (
                <div className="text-center text-zinc-500 font-sans text-sm py-12 bg-[#0a0a0a] rounded-lg border border-white/5">
                  No unassigned emails available in the inbox.
                </div>
              ) : unassignedEmails.map(e => {
                const name = e.from_name || e.from || '?'
                const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <button 
                    key={e.id} 
                    onClick={() => assignEmailToProject(e.id, e.subject || '')}
                    className="w-full flex items-center gap-4 p-4 bg-[#0a0a0a] border border-white/5 hover:border-blue-500/30 hover:bg-blue-500/5 rounded-xl transition-all text-left group"
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-mono font-semibold text-[11px] text-zinc-300 bg-white/10 group-hover:bg-blue-500/20 group-hover:text-blue-400 transition-colors">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-sans text-sm font-semibold text-white truncate mb-1">
                        {e.subject || 'No Subject'}
                      </div>
                      <div className="font-sans text-xs text-zinc-400 truncate">
                        From: <span className="text-zinc-300">{e.from_name || e.from}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus size={20} />
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="flex justify-end mt-6 pt-5 border-t border-white/5 shrink-0">
              <button className="px-6 py-2.5 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                onClick={() => setShowAssignModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
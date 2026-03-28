import { useEffect, useState, useRef, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import {
  getProjects, getProject, deleteProject, getProjectEmails, getProjectDocuments, getProjectContext,
  getProjectBRD, getProjectBRDStatus, generateProjectBRD, runProjectAgent, uploadProjectDoc,
  assignEmail, getUnassignedEmails, downloadBrd, createProject
} from '../services/api'
import { 
  FolderPlus, Plus, Download, FileText, Mail, 
  Cpu, Loader2, Trash2, ChevronDown, Check, Box, LayoutGrid
} from 'lucide-react'
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
  const [contextBlob, setContextBlob] = useState('')
  const [projectDetails, setProjectDetails] = useState(null)
  const [brdStatus, setBrdStatus] = useState(null)
  const [brdContent, setBrdContent] = useState(null)
  const [activeBrdId, setActiveBrdId] = useState(null)
  const [brdRunning, setBrdRunning] = useState({})

  // Custom Dropdown State
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

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

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const load = async () => {
    try { 
      const d = await getProjects()
      const list = d.projects || []
      setProjects(list)
      if (list.length > 0 && !active) selectProject(list[0])
    } catch { toast('Cannot load projects', 'warn') }
  }
  useEffect(() => { load() }, [])

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [projects])

  const selectProject = async (p) => {
    setActive(p); setIsDropdownOpen(false); setBrdContent(null); setActiveBrdId(null); setProjectDetails(null); setBrdStatus(null); setContextBlob('')
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
      toast('Workspace deleted', 'ok')
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
    ...e, sender: e.from_name || e.from || e.sender || 'Unknown sender',
  }))

  const sidebarDocs = (context.documents || []).map(d => ({
    ...d, filename: d.filename || d.name || 'Document', content: d.content || d.text || d.snippet || '',
  }))

  return (
    <div className={`min-h-screen font-sans text-zinc-100 transition-opacity duration-700 pb-24 selection:bg-blue-500/30 ${ready ? 'opacity-100' : 'opacity-0'}`}>

      {/* ── HEADER & WORKSPACE DROPDOWN ── */}
      <div className="max-w-[1400px] mx-auto pt-10 px-6 lg:px-8 mb-8 border-b border-white/5 pb-8">
        <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.3em] mb-3 font-bold">Project Intelligence</div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <h1 className="font-sans text-5xl font-bold tracking-tight text-white">
            Project Studio
          </h1>

          <div className="relative inline-block text-left z-50" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center justify-between gap-4 bg-[#121214] border border-white/10 hover:border-blue-500/50 px-5 py-3 rounded-xl transition-all shadow-xl min-w-[320px]"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Box size={18} className="text-blue-400" />
                </div>
                <div className="text-left">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold mb-0.5">Active Workspace</div>
                  <div className="text-sm font-semibold text-white truncate max-w-[200px]">
                    {active ? active.name : 'Select a workspace...'}
                  </div>
                </div>
              </div>
              <ChevronDown size={16} className={`text-zinc-500 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 w-full bg-[#121214] border border-white/10 rounded-xl shadow-2xl z-[100] overflow-hidden backdrop-blur-xl">
                <div className="max-h-[300px] overflow-y-auto p-2 no-scrollbar">
                  {sortedProjects.map(p => (
                    <button
                      key={p.id}
                      onClick={() => selectProject(p)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm transition-colors mb-1 ${
                        active?.id === p.id ? 'bg-blue-500/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <span className="truncate pr-4">{p.name || 'Untitled'}</span>
                      {active?.id === p.id && <Check size={14} className="text-blue-400" />}
                    </button>
                  ))}
                </div>
                <div className="border-t border-white/5 p-2 bg-white/[0.02]">
                  <button
                    onClick={() => { setShowNewModal(true); setIsDropdownOpen(false); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-blue-400 hover:text-white hover:bg-blue-600 rounded-lg transition-all"
                  >
                    <Plus size={14} /> New Workspace
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="max-w-[1400px] mx-auto px-6 lg:px-8">
        
        {!active ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-xl">
            <div className="p-5 rounded-full bg-white/5 border border-white/5 mb-4">
              <FolderPlus size={40} className="text-zinc-600" />
            </div>
            <div className="font-sans text-lg font-medium text-zinc-400">Select or create a workspace to begin</div>
            <button 
              onClick={() => setShowNewModal(true)}
              className="mt-4 flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-sans text-sm font-semibold hover:bg-blue-500 transition-colors shadow-sm"
            >
              <Plus size={16} /> New Workspace
            </button>
          </div>
        ) : (
          <div className="space-y-6">

            {/* Action Bar */}
            <div className="flex flex-wrap items-center gap-3 bg-[#121214] border border-white/5 p-3 rounded-2xl">
              <button onClick={openAssignModal} className="flex items-center gap-2 px-4 py-2 hover:bg-white/5 rounded-lg text-sm text-zinc-300 hover:text-white transition-colors">
                <Mail size={14} className="text-zinc-500" /> Link Email
              </button>
              <div className="h-6 w-px bg-white/10 mx-1"></div>
              <button onClick={() => setShowPasteModal(true)} className="flex items-center gap-2 px-4 py-2 hover:bg-white/5 rounded-lg text-sm text-zinc-300 hover:text-white transition-colors">
                <FileText size={14} className="text-zinc-500" /> Paste Text
              </button>
              <label className="flex items-center gap-2 px-4 py-2 hover:bg-white/5 rounded-lg text-sm text-zinc-300 hover:text-white transition-colors cursor-pointer">
                <Download size={14} className="text-zinc-500" /> Upload Doc
                <input type="file" accept=".pdf,.txt,.doc,.docx" onChange={handleUploadDoc} className="hidden" />
              </label>
              
              <div className="flex-1" />

              <button 
                onClick={() => handleGenerateBRD(active.id)} 
                disabled={!!isRunning}
                className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg disabled:opacity-50"
              >
                {isRunning ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                {isRunning ? 'Running Pipeline...' : 'Generate BRD'}
              </button>
              <button 
                onClick={handleDeleteProject}
                className="p-2.5 border border-transparent text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors ml-2"
                title="Delete Workspace"
              >
                <Trash2 size={16} />
              </button>
            </div>

            {/* Analytics & Context Preview Grid */}
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="bg-[#121214] border border-white/5 rounded-2xl p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2 font-mono text-[10px] text-blue-400 uppercase tracking-widest font-bold">
                    Workspace Intelligence
                  </div>
                  {brdIsReady && (
                    <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 font-medium">
                      ✓ Document Ready
                    </span>
                  )}
                </div>
                <h3 className="text-2xl font-bold text-white mb-3 truncate">{active.name}</h3>
                <div className="grid grid-cols-2 gap-4 mt-8">
                   <div className="p-4 bg-white/[0.03] rounded-xl border border-white/5 flex items-center justify-between">
                      <div className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest">Linked Emails</div>
                      <div className="text-2xl font-bold text-white">{context.emails.length}</div>
                   </div>
                   <div className="p-4 bg-white/[0.03] rounded-xl border border-white/5 flex items-center justify-between">
                      <div className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest">Documents</div>
                      <div className="text-2xl font-bold text-white">{context.documents.length}</div>
                   </div>
                </div>
              </div>

              <div className="bg-[#121214] border border-white/5 rounded-2xl p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Extracted Context</div>
                  <div className="text-[10px] font-mono text-zinc-600">{contextBlob.length} chars</div>
                </div>
                <div className="h-[140px] overflow-y-auto text-sm text-zinc-400 leading-relaxed font-dm custom-scrollbar pr-4 italic">
                  {contextBlob || 'No aggregated context available. Upload documents or link emails to build the knowledge base.'}
                </div>
              </div>
            </div>

            {/* Knowledge Base Repository (Replaces ContextSidebar) */}
            {(sidebarEmails.length > 0 || sidebarDocs.length > 0) && (
              <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-6">
                  <LayoutGrid size={16} className="text-blue-400" />
                  <h3 className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest font-bold">
                    Knowledge Base Queue
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {/* Emails */}
                  {sidebarEmails.map(e => (
                    <div key={e.id} className="p-4 bg-[#121214] border border-white/5 rounded-xl hover:border-blue-500/30 transition-colors group">
                      <div className="flex items-start gap-3">
                        <Mail size={16} className="text-blue-400 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-sans text-sm font-semibold text-white truncate">{e.subject || 'No Subject'}</div>
                          <div className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest truncate mt-1">From: {e.sender}</div>
                          <div className="font-sans text-xs text-zinc-400 line-clamp-2 mt-2 leading-relaxed opacity-80">{e.body}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* Documents */}
                  {sidebarDocs.map(d => (
                    <div key={d.id} className="p-4 bg-[#121214] border border-white/5 rounded-xl hover:border-yellow-500/30 transition-colors group">
                      <div className="flex items-start gap-3">
                        <FileText size={16} className="text-yellow-400 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-sans text-sm font-semibold text-white truncate">{d.filename || 'Document'}</div>
                          <div className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest truncate mt-1">Raw Text / File</div>
                          <div className="font-sans text-xs text-zinc-400 line-clamp-2 mt-2 leading-relaxed opacity-80">{d.content}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pipeline Graph */}
            <div className="bg-[#121214] border border-white/5 rounded-2xl p-1 shadow-2xl">
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
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xl text-gray-900 mt-8">
                <div className="bg-gray-50 border-b border-gray-200 px-6 sm:px-10 py-5 flex items-center justify-between sticky top-0 z-10">
                  <div className="font-mono text-[11px] uppercase tracking-widest text-purple-600 font-bold flex items-center gap-2">
                    <FileText size={16} /> Generated Requirements Document
                  </div>
                  {activeBrdId && (
                    <button 
                      onClick={() => downloadBrd(activeBrdId, 'pdf')}
                      className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-sm"
                    >
                      <Download size={14} /> Export PDF
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
        )}
      </div>

      {/* ── MODALS (New Workspace, Paste, Link Email) ── */}
      {/* New Workspace Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={() => setShowNewModal(false)}>
          <div className="bg-[#121214] border border-white/10 p-8 w-full max-w-md rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-sans text-2xl font-semibold text-white tracking-tight mb-2">New Workspace</h3>
            <p className="text-sm text-zinc-400 mb-6">Create a dedicated area for project files and context.</p>
            <input ref={newNameRef} type="text" placeholder="Project Name" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleNewProject(); if (e.key === 'Escape') setShowNewModal(false) }} className="w-full bg-[#0a0a0a] border border-white/10 text-white p-3 rounded-lg font-sans text-sm outline-none focus:border-blue-500/50 mb-8" />
            <div className="flex justify-end gap-3">
              <button className="px-5 py-2.5 text-sm font-medium text-zinc-400 hover:text-white" onClick={() => setShowNewModal(false)}>Cancel</button>
              <button onClick={handleNewProject} disabled={!newName.trim()} className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">Create Project</button>
            </div>
          </div>
        </div>
      )}

      {/* Paste Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={() => setShowPasteModal(false)}>
          <div className="bg-[#121214] border border-white/10 p-8 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <h3 className="font-sans text-2xl font-semibold text-white tracking-tight mb-2">Paste Text</h3>
            <p className="text-sm text-zinc-400 mb-6">Quickly add meeting notes to the context.</p>
            <div className="flex-1 flex flex-col gap-4 min-h-0 mb-6">
              <input type="text" placeholder="Document Label" value={pasteLabel} onChange={e => setPasteLabel(e.target.value)} className="w-full bg-[#0a0a0a] border border-white/10 text-white p-3 rounded-lg text-sm outline-none focus:border-blue-500/50" />
              <textarea placeholder="Paste raw text here..." value={pasteBody} onChange={e => setPasteBody(e.target.value)} className="w-full flex-1 min-h-[200px] bg-[#0a0a0a] border border-white/10 text-white p-3 rounded-lg text-sm outline-none focus:border-blue-500/50 resize-none" />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
              <button className="px-5 py-2.5 text-sm font-medium text-zinc-400 hover:text-white" onClick={() => setShowPasteModal(false)}>Cancel</button>
              <button onClick={handlePaste} disabled={!pasteBody.trim()} className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">Add to Context</button>
            </div>
          </div>
        </div>
      )}

      {/* Link Email Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={() => setShowAssignModal(false)}>
          <div className="bg-[#121214] border border-white/10 p-8 w-full max-w-2xl rounded-2xl shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <h3 className="font-sans text-2xl font-semibold text-white tracking-tight mb-2">Link Email</h3>
            <p className="text-sm text-zinc-400 mb-6">Select an unassigned email to add to this project.</p>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 no-scrollbar">
              {unassignedEmails.length === 0 ? (
                <div className="text-center text-zinc-500 text-sm py-12">No unassigned emails available.</div>
              ) : unassignedEmails.map(e => (
                  <button key={e.id} onClick={() => assignEmailToProject(e.id, e.subject || '')} className="w-full flex items-center gap-4 p-4 bg-[#0a0a0a] border border-white/5 hover:border-blue-500/30 hover:bg-blue-500/5 rounded-xl text-left group">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-white truncate">{e.subject || 'No Subject'}</div>
                      <div className="text-xs text-zinc-400 truncate">From: <span className="text-zinc-300">{e.from_name || e.from}</span></div>
                    </div>
                    <Plus size={20} className="text-blue-500 opacity-0 group-hover:opacity-100" />
                  </button>
                )
              )}
            </div>
            <div className="flex justify-end mt-6 pt-5 border-t border-white/5"><button className="text-sm font-medium text-zinc-400 hover:text-white" onClick={() => setShowAssignModal(false)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
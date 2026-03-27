import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { getProjects, createProject, getProjectEmails, getProjectDocuments, getProjectBRD, generateProjectBRD, uploadProjectDoc, attachEmail, getUnassignedEmails, downloadBrd } from '../services/api'
import { FolderPlus, Loader2 } from 'lucide-react'

// Subcomponents
import PipelineGraph from '../components/ProjectStudio/PipelineGraph'
import ContextSidebar from '../components/ProjectStudio/ContextSidebar'
import ActivityTimeline from '../components/ProjectStudio/ActivityTimeline'

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
  
  // Modals
  const [showPasteModal, setShowPasteModal] = useState(false)
  const [pasteLabel, setPasteLabel] = useState('')
  const [pasteBody, setPasteBody] = useState('')
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [unassignedEmails, setUnassignedEmails] = useState([])

  // Entry animation
  const [ready, setReady] = useState(false)
  useEffect(() => { setTimeout(() => setReady(true), 150) }, [])

  const load = async () => {
    try { const d = await getProjects(); setProjects(d.projects || []) }
    catch { toast('Cannot load projects', 'warn') }
  }

  useEffect(() => { load() }, [])

  const selectProject = async (p) => {
    setActive(p); setBrdContent(null); setActiveBrdId(null)
    try {
      const eRes = await getProjectEmails(p.id)
      const dRes = await getProjectDocuments(p.id)
      setContext({ emails: eRes.emails || [], documents: dRes.documents || [] })
    } catch { setContext({ emails: [], documents: [] }) }
    try {
      const b = await getProjectBRD(p.id)
      if (b.brd?.content?.sections) {
        setBrdContent(b.brd.content.sections)
        setActiveBrdId(b.brd.id || null)
      }
    } catch {}
  }

  const handleNewProject = async () => {
    const name = window.prompt('Project Name:')
    if (!name) return
    try {
      await createProject(name, 'Created via The Studio')
      toast('Project workspace initialized.', 'ok'); load()
    } catch { toast('Creation failed', 'warn') }
  }

  const handleGenerateBRD = async (id) => {
    setBrdRunning(r => ({ ...r, [id]: true }))
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
      toast(`Context Linked: ${emailSubject.slice(0, 30)}`, 'ok')
      setShowAssignModal(false); selectProject(active)
    } catch { toast('Link failed', 'warn') }
  }

  const contextCount = context.emails.length + context.documents.length
  const isRunning = brdRunning[active?.id]
  const brdIsReady = !!brdContent

  return (
    <div className={`transition-opacity duration-1000 pb-20 ${ready ? 'opacity-100' : 'opacity-0'}`}>
      
      {/* HEADER */}
      <div className="mb-12">
        <div className="htag mb-4">Project Intelligence / Graphical Studio</div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="font-bebas text-[clamp(44px,9vw,100px)] leading-[0.9] tracking-[0.01em] uppercase">
              Mission Control
            </h1>
          </div>
          <button 
            onClick={handleNewProject}
            className="border border-brand-blue text-brand-blue bg-brand-blue/5 hover:bg-brand-blue hover:text-brand-black transition-colors px-6 py-3 rounded-sm font-space text-[10px] uppercase tracking-widest flex items-center gap-3 w-fit shadow-[0_0_15px_rgba(0,181,226,0.15)]"
          >
            <FolderPlus size={14} /> New Project
          </button>
        </div>
      </div>

      <div className="h-[75vh] min-h-[600px] flex gap-8 items-start">
        
        {/* SIDE LIST - WORKSPACES */}
        <div className="flex flex-col gap-2 w-[280px] shrink-0 h-full overflow-y-auto pr-2">
          {projects.map(p => {
            const isActive = active?.id === p.id
            return (
              <div 
                key={p.id}
                onClick={() => selectProject(p)}
                className={`p-5 border cursor-pointer rounded-sm transition-all duration-300 relative overflow-hidden group shrink-0
                  ${isActive ? 'border-brand-blue bg-brand-input' : 'border-brand-border bg-brand-panel hover:border-white/20'}`}
              >
                {/* Neon Line */}
                {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-blue shadow-[0_0_12px_rgba(0,181,226,1)]"></div>}
                {brdRunning[p.id] && <div className="absolute bottom-0 left-0 h-0.5 bg-brand-yellow w-full animate-[slideRight_1.5s_linear_infinite]"></div>}
                
                <h3 className="font-bebas text-2xl tracking-[0.02em] group-hover:text-white transition-colors truncate">
                  {p.name || 'Unnamed'}
                </h3>
                <div className="font-space text-[9px] tracking-[0.1em] uppercase opacity-40 mt-1">
                  {p.status || 'Active'} / {p.created_at ? new Date(p.created_at).toLocaleDateString() : 'N/A'}
                </div>
              </div>
            )
          })}
          {projects.length === 0 && (
            <div className="p-8 border border-brand-border border-dashed text-center text-brand-muted font-space text-[10px] uppercase tracking-widest">
              No Workspaces
            </div>
          )}
        </div>

        {/* 3-PANE PIPELINE OR PLACEHOLDER */}
        <div className="bg-brand-base border border-brand-border rounded-sm flex-1 h-full flex flex-col relative overflow-hidden">
          
          {!active ? (
            <div className="flex flex-col items-center justify-center flex-1 text-brand-muted opacity-50 space-y-4">
              <FolderPlus size={48} />
              <div className="font-space text-[12px] uppercase tracking-widest text-brand-text">Select or create a workspace</div>
            </div>
          ) : (
            <div className="flex flex-1 overflow-hidden">
               {/* PANE 1: CONTEXT SIDEBAR */}
               <ContextSidebar 
                 emails={context.emails} 
                 documents={context.documents} 
                 onUploadDoc={handleUploadDoc}
                 onPasteText={() => setShowPasteModal(true)}
                 onLinkEmail={openAssignModal}
               />

               {/* PANE 2: GRAPHICAL PIPELINE & BRD OUTPUT */}
               <div className="flex-1 flex flex-col overflow-y-auto bg-[#0a0a0a]">
                 <PipelineGraph 
                   contextCount={contextCount}
                   isRunning={isRunning}
                   brdIsReady={brdIsReady}
                   activeBrdId={activeBrdId}
                   onDownload={downloadBrd}
                   onRun={() => handleGenerateBRD(active.id)}
                 />

                 {/* BRD Result Viewer (if ready) */}
                 {brdIsReady && (
                   <div className="p-8 md:p-12 border-t border-brand-border">
                     <h3 className="font-space text-[10px] tracking-[0.2em] text-[#00ff9d] uppercase mb-8">Generated Document Result</h3>
                     <article className="max-w-[720px] mx-auto prose prose-invert prose-headings:font-bebas prose-headings:tracking-[0.02em] prose-headings:text-brand-text prose-p:font-dm prose-p:leading-[1.78] prose-p:text-[14px] prose-p:opacity-80 prose-li:font-dm prose-li:text-[14px] prose-li:opacity-80">
                        {Object.entries(brdContent).map(([k, v]) => (
                          <section key={k} className="mb-10 lg:mb-14">
                            <h2 className="text-[clamp(28px,3vw,32px)] !mb-4 text-brand-yellow uppercase border-b border-brand-border pb-3">
                              {LABELS[k] || k}
                            </h2>
                            <div className="whitespace-pre-wrap text-brand-text font-dm text-[15px] leading-relaxed">{typeof v === 'string' ? v : JSON.stringify(v, null, 2)}</div>
                          </section>
                        ))}
                     </article>
                   </div>
                 )}
               </div>

               {/* PANE 3: ACTIVITY TIMELINE */}
               <ActivityTimeline 
                 project={active}
                 contextCount={contextCount}
                 brdIsReady={brdIsReady}
               />
            </div>
          )}
        </div>
      </div>

      {/* MODALS */}
      {showPasteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4 min-h-screen" onClick={() => setShowPasteModal(false)}>
          <div className="bg-brand-panel border border-brand-border p-8 w-full max-w-lg rounded-sm shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <h3 className="font-bebas text-3xl mb-6 text-brand-text">Paste Transcript</h3>
            <input 
              type="text" 
              placeholder="Label (e.g. Q1 Meeting)" 
              value={pasteLabel} onChange={e => setPasteLabel(e.target.value)}
              className="w-full bg-brand-input border border-brand-border text-brand-text p-3 mb-4 rounded-sm font-space text-[11px] outline-none focus:border-brand-blue transition-colors"
            />
            <textarea 
              rows={8} 
              placeholder="Paste raw text here..."
              value={pasteBody} onChange={e => setPasteBody(e.target.value)}
              className="w-full bg-brand-input border border-brand-border text-brand-text p-4 mb-6 rounded-sm font-dm text-[13px] leading-relaxed outline-none focus:border-brand-blue resize-none transition-colors"
            />
            <div className="flex justify-end gap-3">
              <button className="px-5 py-2 hover:bg-brand-hover text-brand-muted font-space text-[10px] uppercase tracking-widest rounded-sm transition-colors" onClick={() => setShowPasteModal(false)}>Cancel</button>
              <button className="px-5 py-2 bg-brand-blue text-brand-black font-space text-[10px] uppercase tracking-widest font-bold hover:bg-white transition-colors rounded-sm shadow-md" onClick={handlePaste}>Ingest</button>
            </div>
          </div>
        </div>
      )}

      {showAssignModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4 min-h-screen" onClick={() => setShowAssignModal(false)}>
          <div className="bg-brand-panel border border-brand-border p-8 w-full max-w-2xl rounded-sm shadow-2xl max-h-[85vh] flex flex-col relative" onClick={e => e.stopPropagation()}>
            <h3 className="font-bebas text-3xl mb-1 text-brand-text">Unassigned Context</h3>
            <div className="font-space text-[10px] text-brand-blue uppercase tracking-[0.1em] mb-6 border-b border-brand-border pb-4">Link isolated emails to this workspace</div>
            
            <div className="overflow-y-auto pr-2 flex-1">
              {unassignedEmails.length === 0 && <div className="text-center py-10 text-brand-muted font-space text-xs uppercase tracking-widest">Inbox is clear</div>}
              {unassignedEmails.map(e => (
                <div key={e.id} className="p-5 border border-brand-border hover:border-brand-blue/30 bg-brand-input mb-3 transition-colors flex justify-between items-center gap-4 rounded-sm group">
                  <div className="overflow-hidden">
                    <div className="font-bebas text-xl truncate text-brand-text group-hover:text-brand-blue transition-colors">{e.subject || 'No Subject'}</div>
                    <div className="font-space text-[9px] text-brand-muted uppercase tracking-widest">{e.sender}</div>
                  </div>
                  <button onClick={() => assignEmailToProject(e.id, e.subject)} className="shrink-0 bg-brand-base border border-brand-border hover:border-brand-blue text-brand-text hover:text-brand-blue px-4 py-2 font-space text-[10px] uppercase tracking-widest transition-colors rounded-sm">
                    Link
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

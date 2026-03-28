import { useEffect, useState, useMemo, useRef } from 'react'
import { getProjects, getProjectEmails, getProjectDocuments } from '../services/api'
import { Map, Mail, FileText, Sparkles, Loader2, ChevronDown, Check } from 'lucide-react'

export default function ProjectMap() {
  const [projects, setProjects] = useState([])
  const [activeId, setActiveId] = useState('')
  const [emails, setEmails] = useState([])
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  
  const dropdownRef = useRef(null)

  // Fetch projects on mount
  useEffect(() => {
    getProjects().then(d => setProjects(d.projects || [])).catch(() => setProjects([]))
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Sort projects alphabetically
  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      const nameA = a.name || 'Untitled Workspace'
      const nameB = b.name || 'Untitled Workspace'
      return nameA.localeCompare(nameB)
    })
  }, [projects])

  const selectProject = async (id) => {
    setActiveId(id)
    setIsDropdownOpen(false)
    
    if (!id) {
      setEmails([])
      setDocs([])
      return
    }
    
    setLoading(true)
    try {
      const [eRes, dRes] = await Promise.all([
        getProjectEmails(id).catch(() => ({ emails: [] })),
        getProjectDocuments(id).catch(() => ({ documents: [] })),
      ])
      setEmails(eRes.emails || [])
      setDocs(dRes.documents || [])
    } finally {
      setLoading(false)
    }
  }

  const active = projects.find(p => p.id === activeId)
  const hasData = (emails.length + docs.length) > 0

  return (
    <div className="pb-16">
      {/* Header Section */}
      <div className="mb-10">
        <div className="htag mb-4 font-space text-[11px] uppercase tracking-widest text-brand-muted">
          Visual Studio / Context Mindmap
        </div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <h1 className="font-bebas text-[clamp(40px,7vw,86px)] leading-[0.9] uppercase text-brand-text flex items-center gap-3">
            <Map size={40} className="text-brand-blue" />
            Project Mindmap
          </h1>
          
          <div className="flex items-center gap-3 flex-wrap relative" ref={dropdownRef}>
            
            {/* Custom Dropdown Trigger */}
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={`flex items-center justify-between gap-4 bg-[#0a0a0a] border ${isDropdownOpen ? 'border-brand-blue' : 'border-brand-border'} text-brand-text px-4 py-2.5 rounded-sm font-space text-[11px] uppercase tracking-widest hover:border-brand-blue/70 transition-colors min-w-[240px]`}
            >
              <span className="truncate">{active ? active.name : 'Select a workspace'}</span>
              <ChevronDown size={14} className={`text-brand-muted transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Custom Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute top-full right-0 md:left-0 mt-2 w-full min-w-[240px] bg-[#0a0a0a] border border-brand-border rounded-sm shadow-2xl z-50 max-h-[300px] overflow-y-auto flex flex-col py-1">
                <button
                  onClick={() => selectProject('')}
                  className="text-left px-4 py-2.5 text-[11px] font-space uppercase tracking-widest text-brand-muted hover:bg-brand-input/30 hover:text-white transition-colors"
                >
                  Clear Selection
                </button>
                <div className="w-full h-px bg-brand-border/50 my-1" />
                {sortedProjects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => selectProject(p.id)}
                    className="text-left px-4 py-2.5 text-[12px] font-dm text-white hover:bg-brand-blue/10 flex items-center justify-between group transition-colors"
                  >
                    <span className="truncate pr-4">{p.name || 'Untitled Workspace'}</span>
                    {activeId === p.id && <Check size={14} className="text-brand-blue shrink-0" />}
                  </button>
                ))}
              </div>
            )}

            {/* Stats Pill */}
            {active && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-sm border border-brand-border text-brand-muted font-space text-[10px] uppercase tracking-widest bg-[#050505]">
                {emails.length} emails · {docs.length} docs
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Empty State */}
      {!active && (
        <div className="border border-brand-border rounded-sm p-10 text-center text-brand-muted font-space text-[11px] uppercase tracking-[0.18em] bg-[#050505]/50">
          Select a workspace to render its mindmap.
        </div>
      )}

      {/* Mindmap Canvas */}
      {active && (
        <div className="border border-brand-border rounded-sm p-6 md:p-12 overflow-x-auto" style={{ background: '#050505' }}>
          
          <div className="min-w-[800px] flex items-stretch justify-center gap-0">
            
            {/* 1. LEFT BRANCH (Emails) */}
            <div className="flex flex-col justify-center flex-1 py-8 relative">
              <div className="font-space text-[10px] uppercase tracking-widest text-brand-blue flex items-center gap-2 mb-6 justify-end pr-8">
                <Mail size={12} /> Emails
              </div>
              
              <div className="space-y-4 pr-8 relative">
                {emails.length > 0 && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[1px] h-[calc(100%-2rem)] bg-brand-border/50" />
                )}
                {emails.length === 0 ? (
                  <div className="text-brand-muted text-[12px] text-right">No emails linked</div>
                ) : emails.map(e => (
                  <div key={e.id} className="border border-brand-border/60 rounded-sm p-3 relative bg-[#0a0a0a] ml-auto max-w-[280px] hover:border-brand-blue/50 transition-colors cursor-default">
                    <div className="absolute left-full top-1/2 w-8 h-[1px] bg-brand-border/50" />
                    <div className="font-dm text-[13px] text-white truncate mb-1">{e.subject || 'Email'}</div>
                    <div className="font-space text-[9px] uppercase tracking-[0.1em] text-brand-muted/70 truncate">{e.from_name || e.from || e.sender}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. CENTRAL NODE (Workspace) */}
            <div className="flex flex-col items-center justify-center relative px-8 z-10">
              {emails.length > 0 && <div className="absolute left-0 top-1/2 w-8 h-[1px] bg-brand-border/50" />}
              {docs.length > 0 && <div className="absolute right-0 top-1/2 w-8 h-[1px] bg-brand-border/50" />}

              <div className="mind-node shadow-2xl bg-[#0a0a0a] border border-brand-border/80 rounded-lg p-6 w-[260px] relative">
                <div className="font-space text-[9px] uppercase tracking-[0.22em] text-brand-muted mb-2 text-center">Workspace</div>
                <div className="font-bebas text-[32px] leading-none text-white text-center break-words">
                  {active.name || 'Untitled'}
                </div>
                <div className="mt-3 text-[12px] text-brand-muted text-center leading-relaxed">
                  {active.description || 'Context graph of linked emails and documents.'}
                </div>
              </div>

              {/* Status Indicators */}
              <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap">
                {!hasData && !loading && (
                  <div className="text-brand-muted text-[12px] flex items-center gap-2 font-space tracking-wider">
                    <Sparkles size={14} className="text-brand-blue" /> Add data to populate map
                  </div>
                )}
                {loading && (
                  <div className="text-brand-blue text-[12px] flex items-center gap-2 font-space tracking-wider">
                    <Loader2 size={14} className="animate-spin" /> Loading context...
                  </div>
                )}
              </div>
            </div>

            {/* 3. RIGHT BRANCH (Documents) */}
            <div className="flex flex-col justify-center flex-1 py-8 relative">
              <div className="font-space text-[10px] uppercase tracking-widest text-brand-yellow flex items-center gap-2 mb-6 pl-8">
                <FileText size={12} /> Documents
              </div>
              
              <div className="space-y-4 pl-8 relative">
                {docs.length > 0 && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[1px] h-[calc(100%-2rem)] bg-brand-border/50" />
                )}
                {docs.length === 0 ? (
                  <div className="text-brand-muted text-[12px]">No documents linked</div>
                ) : docs.map(d => (
                  <div key={d.id} className="border border-brand-border/60 rounded-sm p-3 relative bg-[#0a0a0a] mr-auto max-w-[280px] hover:border-brand-yellow/50 transition-colors cursor-default">
                    <div className="absolute right-full top-1/2 w-8 h-[1px] bg-brand-border/50" />
                    <div className="font-dm text-[13px] text-white truncate mb-1">{d.name || d.filename || 'Document'}</div>
                    <div className="font-space text-[9px] uppercase tracking-[0.1em] text-brand-muted/70 truncate">{d.type || d.mime_type || 'file'}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Legend */}
          <div className="mt-16 flex items-center justify-center gap-6 text-brand-muted text-[11px] font-space uppercase tracking-[0.12em] border-t border-brand-border/30 pt-6">
            <span className="inline-flex items-center gap-2"><span className="w-4 h-[1px] bg-brand-border/70" /> Link</span>
            <span className="inline-flex items-center gap-2 text-brand-blue"><Mail size={12} /> Email</span>
            <span className="inline-flex items-center gap-2 text-brand-yellow"><FileText size={12} /> Document</span>
          </div>

        </div>
      )}
    </div>
  )
}
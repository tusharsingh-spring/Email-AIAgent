import { useEffect, useState, useMemo, useRef } from 'react'
import { getProjects, getProjectEmails, getProjectDocuments } from '../services/api'
import { Map, Mail, FileText, Sparkles, Loader2, ChevronDown, ChevronUp, Check } from 'lucide-react'

// --- Formatting Helpers ---
const FT = iso => {
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return iso || '' }
}

const formatPlainText = (text) => {
  if (!text) return ''
  const cleanedText = text.replace(/<(https?:\/\/[^>]+)>/g, '$1')
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts = cleanedText.split(urlRegex)

  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a 
          key={index} href={part} target="_blank" rel="noopener noreferrer" 
          className="text-brand-blue hover:underline break-all"
          onClick={e => e.stopPropagation()}
        >
          {part}
        </a>
      )
    }
    return <span key={index}>{part}</span>
  })
}

const cleanMarkdown = (text) => {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[\*\+]\s/gm, '• ')
}

const getSecureHtml = (html, id) => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_blank">
        <style>
          body { margin: 0; padding: 12px; font-family: sans-serif; word-wrap: break-word; font-size: 14px; color: #e8eaed; }
          img { max-width: 100%; height: auto; }
          a { color: #8ab4f8; }
        </style>
      </head>
      <body>
        ${html}
        <script>
          const updateHeight = () => {
            const height = document.documentElement.scrollHeight;
            window.parent.postMessage({ type: 'resize-iframe', height: height, id: '${id}' }, '*');
          };
          window.onload = updateHeight;
          new ResizeObserver(updateHeight).observe(document.body);
        </script>
      </body>
    </html>
  `
}

// --- NEW: Intelligent Transcript Formatter ---
const TranscriptFormatter = ({ text }) => {
  if (!text) return null;

  // 1. Add spacing so the string can be split cleanly into an array of lines
  const formattedText = text
    .replace(/(🗓️)/g, '\n\n$1') // Newlines before calendar dates
    .replace(/(Subject:|From:|To:|Timestamp:|Participants:)/g, '\n$1') // Newlines before headers
    .replace(/([–-]\s*[A-Za-z0-9\s\(\)]+:)/g, '\n\n$1') // Newlines before chat speakers (e.g. "- Priya:" or "– Priya (PM):")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const lines = formattedText.split('\n');

  return (
    <div className="space-y-1.5 font-sans">
      {lines.map((line, i) => {
        const tLine = line.trim();
        if (!tLine) return null;

        // Date / Session Header
        if (tLine.startsWith('🗓️')) {
          return (
            <div key={i} className="mt-8 mb-4 pb-2 border-b border-brand-border/40 text-brand-yellow font-space text-[12px] uppercase tracking-widest">
              {tLine}
            </div>
          );
        }
        
        // Meta properties (Subject, From, etc.)
        const metaMatch = tLine.match(/^(Subject|From|To|Timestamp|Participants):(.*)/i);
        if (metaMatch) {
          return (
            <div key={i} className="text-[12px] text-brand-muted leading-relaxed">
              <span className="font-semibold text-white/80">{metaMatch[1]}:</span> {metaMatch[2]}
            </div>
          );
        }

        // Chat lines / Speakers
        const speakerMatch = tLine.match(/^([–-]\s*[^:]+:)(.*)/);
        if (speakerMatch) {
          // Clean the dash off the speaker's name
          const speakerName = speakerMatch[1].replace(/^[–-]\s*/, '');
          return (
            <div key={i} className="mt-4 text-[13px] bg-white/[0.03] p-3.5 rounded-lg border border-white/5 leading-relaxed shadow-sm">
              <span className="font-bold text-brand-blue mr-2">{speakerName}</span> 
              <span className="text-[#e8eaed]">{formatPlainText(speakerMatch[2])}</span>
            </div>
          );
        }

        // Normal text block
        return (
          <div key={i} className="text-[13px] text-[#e8eaed] leading-relaxed">
            {formatPlainText(tLine)}
          </div>
        );
      })}
    </div>
  );
}

// --- Email Node Component ---
function EmailNode({ email }) {
  const [isOpen, setIsOpen] = useState(false)
  const iframeRef = useRef(null)

  const bodyContent = email.body || email.snippet || '(empty)'
  const isHtml = /<html|<body|<div|<table|<p>/i.test(bodyContent)

  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data.type === 'resize-iframe' && e.data.id === email.id && iframeRef.current) {
        iframeRef.current.style.height = `${e.data.height}px`;
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [email.id])

  return (
    <div 
      className={`group border ${isOpen ? 'border-brand-blue' : 'border-brand-border/60 hover:border-brand-blue/50'} rounded-lg bg-[#0a0a0a] transition-all duration-300 ${!isOpen && 'hover:-translate-y-1 hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)] hover:shadow-brand-blue/10'} relative overflow-hidden cursor-pointer`}
      onClick={() => setIsOpen(!isOpen)}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-blue/20 group-hover:bg-brand-blue transition-colors" />
      
      <div className="p-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-dm text-[15px] font-medium text-white mb-2 leading-snug truncate pr-4">
            {email.subject || 'Email Subject'}
          </div>
          <div className="font-space text-[10px] uppercase tracking-wider text-brand-muted/70 truncate">
            From: <span className="text-brand-muted">{email.from_name || email.from || email.sender}</span>
          </div>
        </div>
        <div className="shrink-0 text-brand-muted mt-1">
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      <div 
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.3s ease-out'
        }}
      >
        <div className="overflow-hidden">
          <div className="p-5 pt-0 border-t border-brand-border/30 mt-2" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 pt-4">
              <span className="font-space text-[10px] text-brand-muted">{FT(email.received_at || email.date)}</span>
            </div>
            
            <div className="font-sans">
              {isHtml ? (
                <div className="bg-[#121214] rounded overflow-hidden border border-brand-border/50">
                  <iframe
                    ref={iframeRef}
                    srcDoc={getSecureHtml(bodyContent, email.id)}
                    title="Email Body"
                    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-scripts"
                    className="w-full min-h-[100px] border-none bg-transparent transition-all duration-300"
                    scrolling="no"
                  />
                </div>
              ) : (
                <div className="bg-[#121214] border border-brand-border/50 rounded-lg p-5 text-[13px] text-[#e8eaed] leading-relaxed whitespace-pre-wrap break-words">
                  {formatPlainText(bodyContent)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Transcript / Document Node Component ---
function DocNode({ doc }) {
  const [isOpen, setIsOpen] = useState(false)
  const content = doc.content || doc.text || doc.snippet || 'No transcript text available.'

  return (
    <div 
      className={`group border ${isOpen ? 'border-brand-yellow' : 'border-brand-border/60 hover:border-brand-yellow/50'} rounded-lg bg-[#0a0a0a] transition-all duration-300 ${!isOpen && 'hover:-translate-y-1 hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)] hover:shadow-brand-yellow/10'} relative overflow-hidden cursor-pointer`}
      onClick={() => setIsOpen(!isOpen)}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-yellow/20 group-hover:bg-brand-yellow transition-colors" />
      
      <div className="p-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-dm text-[15px] font-medium text-white mb-2 leading-snug truncate pr-4">
            {doc.name || doc.filename || 'Transcript Document'}
          </div>
          <div className="font-space text-[10px] uppercase tracking-wider text-brand-muted/70 truncate">
            Type: <span className="text-brand-muted">{doc.type || doc.mime_type || 'Transcript/Text'}</span>
          </div>
        </div>
        <div className="shrink-0 text-brand-muted mt-1">
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      <div 
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.3s ease-out'
        }}
      >
        <div className="overflow-hidden">
          <div className="p-5 pt-0 border-t border-brand-border/30 mt-2" onClick={e => e.stopPropagation()}>
            <div className="bg-[#121214] border border-brand-border/50 rounded-xl p-5 mt-4 max-h-[600px] overflow-y-auto custom-scrollbar">
              <TranscriptFormatter text={cleanMarkdown(content)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Main Project Map Component ---
export default function ProjectMap() {
  const [projects, setProjects] = useState([])
  const [activeId, setActiveId] = useState('')
  const [emails, setEmails] = useState([])
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  
  const dropdownRef = useRef(null)

  useEffect(() => {
    getProjects().then(d => setProjects(d.projects || [])).catch(() => setProjects([]))
  }, [])

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

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
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={`flex items-center justify-between gap-4 bg-[#0a0a0a] border ${isDropdownOpen ? 'border-brand-blue' : 'border-brand-border'} text-brand-text px-4 py-2.5 rounded-sm font-space text-[11px] uppercase tracking-widest hover:border-brand-blue/70 transition-colors min-w-[240px] shadow-sm`}
            >
              <span className="truncate">{active ? active.name : 'Select a workspace'}</span>
              <ChevronDown size={14} className={`text-brand-muted transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

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

      {/* Vertical Mindmap Canvas */}
      {active && (
        <div className="border border-brand-border rounded-sm p-6 md:p-12 overflow-x-auto" style={{ background: '#050505' }}>
          
          <div className="min-w-[800px] flex flex-col items-center relative">
            
            {/* 1. TOP NODE (Workspace Hub) */}
            <div className="z-10 mind-node shadow-2xl bg-[#0a0a0a] border border-brand-border/80 hover:border-brand-blue/50 transition-colors rounded-xl p-8 w-[340px] text-center relative group">
              <div className="absolute inset-0 bg-brand-blue/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div className="font-space text-[10px] uppercase tracking-[0.22em] text-brand-muted mb-3">Workspace Root</div>
              <div className="font-bebas text-[36px] leading-[0.9] text-white break-words">
                {active.name || 'Untitled'}
              </div>
              <div className="mt-4 text-[13px] font-dm text-brand-muted leading-relaxed">
                {active.description || 'Central hub for linked emails and transcripts.'}
              </div>
              
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

            {/* 2. THE TREE STRUCTURE (Lines & Branches) */}
            {hasData && !loading && (
              <div className="w-full flex flex-col items-center mt-10">
                
                <div className="w-px h-12 bg-brand-border/60 relative">
                  <div className="absolute inset-0 bg-brand-blue/20 blur-[2px]" />
                </div>
                
                <div className="w-full max-w-5xl flex relative">
                  
                  <div 
                    className="absolute top-0 h-px bg-brand-border/60 transition-all" 
                    style={{ 
                      left: emails.length > 0 ? '25%' : '50%', 
                      right: docs.length > 0 ? '25%' : '50%' 
                    }} 
                  />
                  
                  {/* --- LEFT BRANCH (Emails) --- */}
                  <div className="flex-1 flex flex-col items-center px-4">
                    {emails.length > 0 && <div className="w-px h-12 bg-brand-border/60" />}
                    
                    {emails.length > 0 && (
                      <div className="w-full max-w-[420px] mt-2">
                        <div className="font-space text-[11px] uppercase tracking-widest text-brand-blue flex items-center justify-center gap-2 mb-6 bg-brand-blue/5 border border-brand-blue/20 py-2.5 rounded-sm shadow-sm">
                          <Mail size={14} /> Linked Emails ({emails.length})
                        </div>
                        
                        <div className="space-y-4">
                          {emails.map(e => (
                            <EmailNode key={e.id} email={e} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* --- RIGHT BRANCH (Transcripts/Docs) --- */}
                  <div className="flex-1 flex flex-col items-center px-4">
                    {docs.length > 0 && <div className="w-px h-12 bg-brand-border/60" />}
                    
                    {docs.length > 0 && (
                      <div className="w-full max-w-[420px] mt-2">
                        <div className="font-space text-[11px] uppercase tracking-widest text-brand-yellow flex items-center justify-center gap-2 mb-6 bg-brand-yellow/5 border border-brand-yellow/20 py-2.5 rounded-sm shadow-sm">
                          <FileText size={14} /> Transcripts ({docs.length})
                        </div>
                        
                        <div className="space-y-4">
                          {docs.map(d => (
                            <DocNode key={d.id} doc={d} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )}
          </div>

          {hasData && (
            <div className="mt-20 flex items-center justify-center gap-8 text-brand-muted text-[11px] font-space uppercase tracking-[0.12em] border-t border-brand-border/30 pt-6">
              <span className="inline-flex items-center gap-2 text-brand-blue"><Mail size={14} /> Email Node</span>
              <span className="inline-flex items-center gap-2 text-brand-yellow"><FileText size={14} /> Transcript Node</span>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
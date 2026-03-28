import { useEffect, useState } from 'react'
import { getProjects, getProjectEmails, getProjectDocuments } from '../services/api'
import { Map, Mail, FileText, Sparkles } from 'lucide-react'

export default function ProjectMap() {
  const [projects, setProjects] = useState([])
  const [activeId, setActiveId] = useState('')
  const [emails, setEmails] = useState([])
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getProjects().then(d => setProjects(d.projects || [])).catch(() => setProjects([]))
  }, [])

  const selectProject = async (id) => {
    setActiveId(id)
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
      <div className="mb-10">
        <div className="htag mb-4">Visual Studio / Context Mindmap</div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <h1 className="font-bebas text-[clamp(40px,7vw,86px)] leading-[0.9] uppercase text-brand-text flex items-center gap-3">
            <Map size={40} className="text-brand-blue" />
            Project Mindmap
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={activeId}
              onChange={e => selectProject(e.target.value)}
              className="bg-brand-input border border-brand-border text-brand-text px-3 py-2 rounded-sm font-space text-[11px] uppercase tracking-widest"
            >
              <option value="">Select a workspace</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name || 'Untitled Workspace'}</option>
              ))}
            </select>
            {active && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-sm border border-brand-border text-brand-muted font-space text-[10px] uppercase tracking-widest">
                {emails.length} emails · {docs.length} docs
              </div>
            )}
          </div>
        </div>
      </div>

      {!active && (
        <div className="border border-brand-border rounded-sm p-10 text-center text-brand-muted font-space text-[11px] uppercase tracking-[0.18em]">
          Select a workspace to render its mindmap.
        </div>
      )}

      {active && (
        <div className="border border-brand-border rounded-sm p-6 md:p-10" style={{ background: '#050505' }}>
          <div className="grid md:grid-cols-3 gap-6 items-start">
            {/* Emails branch */}
            <div className="space-y-3">
              <div className="font-space text-[10px] uppercase tracking-widest text-brand-blue flex items-center gap-2">
                <Mail size={12} /> Emails
              </div>
              {emails.length === 0 ? (
                <div className="text-brand-muted text-[12px]">No emails linked</div>
              ) : emails.map(e => (
                <div key={e.id} className="border border-brand-border/60 rounded-sm p-3 relative bg-brand-input/20">
                  <div className="absolute right-full top-1/2 w-4 h-[1px] bg-brand-border/50" />
                  <div className="font-dm text-[13px] text-white truncate mb-1">{e.subject || 'Email'}</div>
                  <div className="font-space text-[9px] uppercase tracking-[0.1em] text-brand-muted/70 truncate">{e.from_name || e.from || e.sender}</div>
                </div>
              ))}
            </div>

            {/* Root node */}
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className="mind-node shadow-lg">
                  <div className="font-space text-[9px] uppercase tracking-[0.22em] text-brand-muted">Workspace</div>
                  <div className="font-bebas text-[32px] leading-none text-white mt-1 text-center">{active.name || 'Untitled'}</div>
                  <div className="mt-2 text-[12px] text-brand-muted max-w-[240px] text-center">
                    {active.description || 'Context graph of linked emails and documents.'}
                  </div>
                </div>
                <div className="absolute left-[-140px] top-1/2 w-[120px] h-[1px] bg-brand-border/50" />
                <div className="absolute right-[-140px] top-1/2 w-[120px] h-[1px] bg-brand-border/50" />
              </div>
              {!hasData && !loading && (
                <div className="mt-4 text-brand-muted text-[12px] flex items-center gap-2">
                  <Sparkles size={14} className="text-brand-blue" /> Add emails or documents to see the map populate.
                </div>
              )}
              {loading && (
                <div className="mt-4 text-brand-muted text-[12px]">Loading context…</div>
              )}
            </div>

            {/* Documents branch */}
            <div className="space-y-3">
              <div className="font-space text-[10px] uppercase tracking-widest text-brand-yellow flex items-center gap-2">
                <FileText size={12} /> Documents
              </div>
              {docs.length === 0 ? (
                <div className="text-brand-muted text-[12px]">No documents linked</div>
              ) : docs.map(d => (
                <div key={d.id} className="border border-brand-border/60 rounded-sm p-3 relative bg-brand-input/20">
                  <div className="absolute left-[-16px] top-1/2 w-4 h-[1px] bg-brand-border/50" />
                  <div className="font-dm text-[13px] text-white truncate mb-1">{d.name || d.filename || 'Document'}</div>
                  <div className="font-space text-[9px] uppercase tracking-[0.1em] text-brand-muted/70 truncate">{d.type || d.mime_type || 'file'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-8 flex items-center gap-3 text-brand-muted text-[12px] font-space uppercase tracking-[0.12em]">
            <span className="inline-flex items-center gap-1"><span className="w-3 h-[1px] bg-brand-border/70" /> Link</span>
            <span className="inline-flex items-center gap-1 text-brand-blue"><Mail size={10} /> Email</span>
            <span className="inline-flex items-center gap-1 text-brand-yellow"><FileText size={10} /> Document</span>
          </div>
        </div>
      )}
    </div>
  )
}

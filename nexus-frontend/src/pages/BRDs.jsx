import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { listBrds, getBrdSections, getBrdResult, downloadBrd } from '../services/api'
import { FileText, Download, Eye, Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import BRDSectionContent from '../components/ui/BRDSectionContent'

const LABELS = {
  executive_summary: 'Executive Summary',
  business_objectives: 'Business Objectives',
  scope: 'Scope',
  functional_requirements: 'Functional Requirements',
  non_functional_requirements: 'Non-Functional Requirements',
  stakeholders_decisions: 'Stakeholders & Decisions',
  risks_constraints: 'Risks & Constraints',
  feature_prioritization: 'Feature Prioritization',
  timeline_milestones: 'Timeline & Milestones',
}

// --- NEW CLEANUP UTILITIES ---

// 1. Removes markdown noise from a single string
const cleanMarkdown = (text) => {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/^#{1,6}\s*/gm, '') // Remove heading markers (##, ###)
    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold (**)
    .replace(/__(.*?)__/g, '$1') // Remove bold (__)
    .replace(/\*(.*?)\*/g, '$1') // Remove italics (*)
    .replace(/_(.*?)_/g, '$1') // Remove italics (_)
    .replace(/`([^`]+)`/g, '$1') // Remove inline code backticks (`)
    .replace(/^[\*\+]\s/gm, '• ') // Replace list markers (* or +) with a clean bullet
}

// 2. Recursively cleans nested objects/arrays before passing to BRDSectionContent
const cleanData = (val) => {
  if (typeof val === 'string') return cleanMarkdown(val);
  if (Array.isArray(val)) return val.map(cleanData);
  if (val !== null && typeof val === 'object') {
    const cleaned = {};
    for (const [k, v] of Object.entries(val)) {
      cleaned[k] = cleanData(v);
    }
    return cleaned;
  }
  return val;
}

// -----------------------------

function BRDCard({ jobId, brd }) {
  const [open, setOpen] = useState(false)
  const [sections, setSections] = useState(null)
  const [loadingSections, setLoadingSections] = useState(false)
  const [meta, setMeta] = useState(null)
  const [loadingMeta, setLoadingMeta] = useState(false)

  const toggle = async () => {
    if (open) { setOpen(false); return }
    setOpen(true)
    
    if (!sections) {
      setLoadingSections(true)
      try {
        const d = await getBrdSections(jobId)
        setSections(d.sections || {})
      } catch { setSections({}) }
      setLoadingSections(false)
    }
    
    if (!meta) {
      setLoadingMeta(true)
      try { const r = await getBrdResult(jobId); setMeta(r || {}) }
      catch { setMeta({}) }
      setLoadingMeta(false)
    }
  }

  return (
    <div className={`bg-[#121214] border border-white/10 rounded-xl overflow-hidden transition-all duration-300 ${open ? 'ring-1 ring-purple-500/30 shadow-lg' : 'hover:border-white/20 hover:shadow-md'}`}>
      
      {/* Card Header */}
      <div 
        className="p-5 flex items-start sm:items-center gap-4 cursor-pointer"
        onClick={toggle}
      >
        <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0 shadow-inner">
          <FileText size={24} />
        </div>
        
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <h3 className="font-sans text-lg font-semibold text-white truncate mb-1.5 leading-tight">
            {cleanMarkdown(brd.title) || 'Untitled BRD'}
          </h3>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-[11px] text-zinc-400 font-medium">
              ID: {jobId.slice(0, 8)}...
            </span>
            <div className="w-1 h-1 rounded-full bg-white/20"></div>
            <span className="font-mono text-[11px] text-zinc-400 font-medium">
              {brd.sections_count || '?'} Sections
            </span>
            {brd.metadata?.total_fr && (
              <>
                <div className="w-1 h-1 rounded-full bg-white/20"></div>
                <span className="font-mono text-[11px] text-zinc-400 font-medium">
                  {brd.metadata.total_fr} FRs · {brd.metadata.total_nfr || 0} NFRs
                </span>
              </>
            )}
            
            {meta?.status && (
              <span className="ml-auto font-mono text-[10px] uppercase tracking-wider font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                {meta.status}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 mt-2 sm:mt-0">
          <button
            onClick={e => { e.stopPropagation(); downloadBrd(jobId) }}
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
            title="Download DOCX"
          >
            <Download size={16} />
          </button>
          <button
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white transition-colors border border-white/5"
          >
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded Content Area */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.35s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          {open && (
            <div className="border-t border-white/5 bg-[#0a0a0a] px-6 py-6" onClick={e => e.stopPropagation()}>
              
              {loadingSections || loadingMeta ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-500">
                  <Loader2 size={24} className="animate-spin text-zinc-400" />
                  <span className="font-sans text-sm font-medium">Fetching BRD contents...</span>
                </div>
              ) : sections && Object.entries(sections).length > 0 ? (
                <div className="space-y-8">
                  
                  {/* Executive Summary / Meta block */}
                  {meta?.summary && (
                    <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-5 shadow-inner">
                      <div className="font-mono text-[11px] uppercase tracking-widest text-purple-400 font-semibold mb-2 flex items-center gap-2">
                        <FileText size={14} /> AI Executive Summary
                      </div>
                      <p className="font-sans text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                        {/* Clean the summary before rendering */}
                        {cleanMarkdown(meta.summary)}
                      </p>
                    </div>
                  )}

                  {/* Standard Sections List */}
                  {Object.entries(sections).map(([key, value], i) => (
                    <div key={key} className="bg-[#121214] border border-white/5 rounded-xl overflow-hidden shadow-inner">
                      <div className="bg-white/[0.02] border-b border-white/5 px-5 py-3 flex items-center gap-3">
                        <span className="font-mono text-xs text-zinc-500 font-semibold bg-white/5 px-2 py-0.5 rounded">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <h4 className="font-sans text-base font-semibold text-zinc-100">
                          {LABELS[key] || cleanMarkdown(key)}
                        </h4>
                      </div>
                      <div className="p-5 font-sans text-sm text-zinc-400 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                        {/* Pass cleanly formatted data to your section component */}
                        <BRDSectionContent sectionKey={key} value={cleanData(value)} />
                      </div>
                    </div>
                  ))}
                  
                  {/* Bottom Action Bar */}
                  <div className="flex justify-end pt-4">
                     <button
                        onClick={() => downloadBrd(jobId)}
                        className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-lg font-sans text-sm font-semibold transition-colors shadow-sm"
                      >
                        <Download size={16} /> Download Final Document (.docx)
                      </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-500 bg-[#121214] rounded-xl border border-white/5">
                  <FileText size={24} className="text-zinc-600" />
                  <span className="font-sans text-sm font-medium">No detailed sections available for this BRD.</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function BRDs() {
  const { state, dispatch } = useApp() || {}
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const d = await listBrds()
      const brds = {}
      ;(d.brds || []).forEach(b => {
        brds[b.job_id] = { title: b.title, sections_count: b.sections_count || '?', metadata: b.metadata || {}, email_id: b.email_id }
      })
      dispatch?.({ type: 'SET_BRDS', brds })
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const brdEntries = Object.entries(state?.brds || {})

  return (
    <div className="min-h-screen pb-24 font-sans text-zinc-100 selection:bg-purple-500/30">

      {/* HEADER */}
      <div className="max-w-6xl mx-auto pt-12 px-6 lg:px-8 mb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="font-mono text-[11px] text-zinc-500 uppercase tracking-widest mb-2 font-medium">Documents</div>
            <h1 className="font-sans text-4xl font-semibold tracking-tight text-white flex items-center gap-3">
              BRD Archive
            </h1>
            <p className="font-sans text-sm text-zinc-400 mt-2">
              Review and export auto-generated Business Requirement Documents.
            </p>
          </div>
          
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-sm font-medium text-zinc-300 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* BRD LIST */}
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        {brdEntries.length > 0 ? (
          <div className="flex flex-col gap-4">
            {brdEntries.map(([jobId, brd]) => (
              <BRDCard key={jobId} jobId={jobId} brd={brd} />
            ))}
          </div>
        ) : (
          <div className="bg-[#0a0a0a] border border-white/10 rounded-xl flex flex-col items-center justify-center py-32 gap-4 shadow-2xl">
            <div className="p-4 rounded-full bg-white/5 border border-white/5">
              <FileText size={32} className="text-zinc-600" />
            </div>
            <div className="font-sans text-lg text-zinc-400 font-medium text-center px-4">
              {loading ? 'Loading Documents...' : 'No BRDs found. Process an email cluster to generate one.'}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
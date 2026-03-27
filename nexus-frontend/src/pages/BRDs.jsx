import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { listBrds, getBrdSections, downloadBrd } from '../services/api'
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

const FT = iso => {
  try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) }
  catch { return iso || '' }
}

function BRDCard({ jobId, brd }) {
  const [open, setOpen] = useState(false)
  const [sections, setSections] = useState(null)
  const [loadingSections, setLoadingSections] = useState(false)

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
  }

  return (
    <div className="bg-brand-panel border border-brand-border rounded-sm overflow-hidden hover:border-white/10 transition-colors group">
      {/* Card header */}
      <div className="p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-sm bg-[rgba(168,85,247,0.1)] border border-[rgba(168,85,247,0.2)] flex items-center justify-center text-[#a855f7] shrink-0">
          <FileText size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bebas text-[clamp(18px,2vw,24px)] text-brand-text leading-tight mb-1">
            {brd.title || 'Untitled BRD'}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-space text-[9px] text-brand-muted/40">{brd.sections_count || '?'} sections</span>
            {brd.metadata?.total_fr && (
              <span className="font-space text-[9px] text-brand-muted/40">{brd.metadata.total_fr} FRs · {brd.metadata.total_nfr || 0} NFRs</span>
            )}
            <span className="font-space text-[9px] text-[#a855f7]/60 bg-[rgba(168,85,247,0.06)] px-2 py-0.5 rounded-sm border border-[rgba(168,85,247,0.15)]">
              Complete
            </span>
          </div>
          <div className="font-space text-[9px] text-brand-muted/30 mt-1 truncate">job: {jobId}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); downloadBrd(jobId) }}
            className="flex items-center gap-1.5 border border-brand-border text-brand-muted hover:text-white hover:border-white/20 px-3 py-1.5 rounded-sm font-space text-[9px] uppercase tracking-widest transition-colors"
          >
            <Download size={11} /> DOCX
          </button>
          <button
            onClick={toggle}
            className="flex items-center gap-1.5 bg-brand-blue text-brand-black px-3 py-1.5 rounded-sm font-space text-[9px] uppercase tracking-widest font-bold hover:bg-white transition-colors"
          >
            <Eye size={11} />
            {open ? 'Hide' : 'View'}
            {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        </div>
      </div>

      {/* Expanded sections */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.4s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          {open && (
            <div className="border-t border-brand-border px-5 py-6">
              {loadingSections ? (
                <div className="flex items-center gap-2 text-brand-muted/40">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="font-space text-[10px] uppercase tracking-widest">Loading sections...</span>
                </div>
              ) : sections && Object.entries(sections).length > 0 ? (
                <div className="space-y-8 max-w-[720px]">
                  {Object.entries(sections).map(([key, value], i) => (
                    <div key={key}>
                      <div className="font-space text-[9px] uppercase tracking-[0.2em] text-brand-muted/30 mb-1">
                        {String(i + 1).padStart(2, '0')}
                      </div>
                      <h3 className="font-bebas text-[clamp(20px,2.5vw,28px)] text-brand-yellow border-b border-brand-border pb-3 mb-4">
                        {LABELS[key] || key}
                      </h3>
                      <BRDSectionContent sectionKey={key} value={value} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="font-space text-[10px] uppercase tracking-widest text-brand-muted/40">No sections found</div>
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
    <div className="pb-20">

      {/* HEADER */}
      <div className="mb-10">
        <div className="htag mb-4">Documents / Generated</div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
          <h1 className="font-bebas text-[clamp(38px,6.5vw,80px)] leading-[0.9] tracking-[0.01em] uppercase text-brand-text">
            BRD Archive
          </h1>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 border border-brand-border text-brand-muted hover:text-white hover:border-white/20 px-5 py-2.5 rounded-sm font-space text-[10px] uppercase tracking-widest transition-colors hover:scale-[1.02] active:scale-[0.98]"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Refresh
          </button>
        </div>
      </div>

      {/* BRD GRID */}
      {brdEntries.length > 0 ? (
        <div className="grid lg:grid-cols-2 gap-4">
          {brdEntries.map(([jobId, brd]) => (
            <BRDCard key={jobId} jobId={jobId} brd={brd} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <FileText size={48} style={{ color: 'rgba(168,85,247,0.15)' }} />
          <div className="font-space text-[10px] uppercase tracking-widest text-brand-muted/40">
            {loading ? 'Loading BRDs...' : 'No BRDs yet — send an email or upload a transcript to generate one'}
          </div>
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { getBRDSections, downloadBRDUrl } from '../../services/api'

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

export default function BRDCard({ jobId, brd }) {
  const [open, setOpen] = useState(false)
  const [sections, setSections] = useState(null)
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    if (open) { setOpen(false); return }
    setOpen(true)
    if (!sections) {
      setLoading(true)
      try {
        const d = await getBRDSections(jobId)
        setSections(d.sections || {})
      } catch { setSections({}) }
      setLoading(false)
    }
  }

  return (
    <div className="brd-card">
      <div className="brd-h" onClick={toggle}>
        <div style={{ width: '30px', height: '30px', background: 'var(--pdim)', border: '1px solid rgba(168,85,247,.2)', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>◈</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 500 }}>{brd.title || 'BRD'}</div>
          <div style={{ fontSize: '10px', color: 'var(--tx3)', fontFamily: "'DM Mono',monospace", marginTop: '1px' }}>
            job: {jobId} &nbsp;·&nbsp; {brd.sections_count || '?'} sections
          </div>
          {brd.metadata?.total_fr && (
            <div style={{ fontSize: '9px', color: 'var(--tx2)', marginTop: '1px' }}>
              {brd.metadata.total_fr} FRs &nbsp;·&nbsp; {brd.metadata.total_nfr || 0} NFRs
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '5px' }}>
          <button className="btn btn-g btn-sm" onClick={e => { e.stopPropagation(); toggle() }}>◇ Preview</button>
          <button className="btn btn-grn btn-sm" onClick={e => { e.stopPropagation(); window.open(downloadBRDUrl(jobId)) }}>⬇ DOCX</button>
        </div>
      </div>
      {open && (
        <div className="brd-content">
          {loading ? 'Loading...' : sections && Object.entries(sections).map(([k, v]) => (
            <div key={k} style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--a2)', marginBottom: '3px' }}>{LABELS[k] || k}</div>
              <div style={{ fontSize: '10px', color: 'var(--tx2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {(typeof v === 'string' ? v : JSON.stringify(v, null, 2)).slice(0, 600)}
              </div>
              <hr style={{ borderColor: 'var(--bdr)', margin: '8px 0' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

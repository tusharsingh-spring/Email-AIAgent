const BRD_STAGES = [
  { key: 'ingestion', label: 'Email/transcript ingestion' },
  { key: 'extraction', label: 'Requirement extraction (LLM)' },
  { key: 'gap_detection', label: 'Gap detection' },
  { key: 'writing', label: 'BRD section writing' },
  { key: 'assembly', label: 'Document assembly' },
  { key: 'docx', label: 'DOCX generation' },
]

export default function ProgressSteps({ currentStage }) {
  const activeIdx = BRD_STAGES.findIndex(s => s.key === currentStage)
  return (
    <div>
      {BRD_STAGES.map((s, i) => {
        const done = activeIdx >= 0 && i < activeIdx
        const active = i === activeIdx
        return (
          <div key={s.key} className="prog-step" id={`ps-${s.key}`}>
            <div className={`ps-d ${done ? 'done' : active ? 'active' : 'idle'}`} />
            <div className={`ps-l ${done ? 'done' : active ? 'active' : ''}`}>{s.label}</div>
          </div>
        )
      })}
    </div>
  )
}

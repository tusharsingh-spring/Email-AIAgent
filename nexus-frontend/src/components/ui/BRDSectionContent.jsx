/**
 * Smart BRD section renderer — handles all backend data shapes:
 *   string           → paragraph
 *   string[]         → bullet list
 *   {in_scope, ...}  → scope subsections (scope field)
 *   [{id,title,...}] → FR / NFR cards
 *   [{risk,...}]     → risk rows
 *   {cat: [...]}     → NFR category groups
 */

const IMPACT_COLOR = { high: '#ff5050', medium: '#FFE234', low: '#00ff9d', critical: '#ff5050' }
const PRIORITY_COLOR = { high: '#ff5050', medium: '#FFE234', low: 'rgba(255,255,255,0.4)', p0: '#ff5050', p1: '#FFE234', p2: 'rgba(255,255,255,0.4)' }

function StringList({ items }) {
  if (!items?.length) return <p className="font-dm text-[13px]" style={{ color: 'rgba(255,255,255,0.28)' }}>—</p>
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5 font-dm text-[14px] leading-[1.75]" style={{ color: 'rgba(255,255,255,0.72)' }}>
          <span className="mt-[7px] w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--color-brand-blue)' }} />
          {String(item)}
        </li>
      ))}
    </ul>
  )
}

function SubSection({ title, children }) {
  return (
    <div className="mt-4">
      <div className="font-space text-[9px] uppercase tracking-[0.2em] mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
        {title.replace(/_/g, ' ')}
      </div>
      {children}
    </div>
  )
}

function FRCard({ item, index }) {
  const priority = (item.priority || '').toLowerCase()
  const color = PRIORITY_COLOR[priority] || 'rgba(255,255,255,0.4)'
  return (
    <div className="border border-brand-border rounded-sm p-4 mb-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex items-center gap-3 mb-2">
        <span className="font-space text-[9px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {item.id || `FR-${String(index + 1).padStart(3, '0')}`}
        </span>
        {priority && (
          <span className="font-space text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm border"
            style={{ color, borderColor: color + '40', background: color + '12' }}>
            {priority}
          </span>
        )}
      </div>
      <div className="font-bebas text-[16px] leading-tight text-white mb-1">
        {item.title || item.name || ''}
      </div>
      {item.description && (
        <div className="font-dm text-[13px] leading-[1.7]" style={{ color: 'rgba(255,255,255,0.55)' }}>
          {item.description}
        </div>
      )}
      {item.acceptance_criteria && (
        <div className="mt-2 font-space text-[9px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.28)' }}>
          AC: {item.acceptance_criteria}
        </div>
      )}
    </div>
  )
}

function RiskRow({ item }) {
  const impact = (item.impact || '').toLowerCase()
  const color = IMPACT_COLOR[impact] || 'rgba(255,255,255,0.4)'
  return (
    <div className="flex gap-4 border-b border-brand-border py-3 last:border-0">
      <div className="shrink-0 mt-0.5">
        <span className="font-space text-[8px] uppercase tracking-widest px-2 py-1 rounded-sm border"
          style={{ color, borderColor: color + '40', background: color + '12' }}>
          {impact || 'risk'}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-dm text-[14px] font-medium text-white mb-0.5">{item.risk || item.title || ''}</div>
        {item.owner && <div className="font-space text-[9px] text-brand-muted/60 mb-1">Owner: {item.owner}</div>}
        {item.mitigation && (
          <div className="font-dm text-[13px] leading-[1.65]" style={{ color: 'rgba(255,255,255,0.5)' }}>
            ↳ {item.mitigation}
          </div>
        )}
      </div>
    </div>
  )
}

function NFRCategory({ catKey, items }) {
  return (
    <SubSection title={catKey}>
      <div className="space-y-2">
        {(Array.isArray(items) ? items : []).map((item, i) => (
          <div key={i} className="flex items-start gap-3 border border-brand-border rounded-sm p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
            {item.id && <span className="font-space text-[9px] text-brand-muted/40 shrink-0 mt-0.5">{item.id}</span>}
            <div className="font-dm text-[13px] leading-[1.7]" style={{ color: 'rgba(255,255,255,0.65)' }}>
              {item.threshold || item.description || item.requirement || JSON.stringify(item)}
            </div>
          </div>
        ))}
      </div>
    </SubSection>
  )
}

export default function BRDSectionContent({ sectionKey, value }) {
  // String — simple paragraph
  if (typeof value === 'string') {
    return (
      <p className="font-dm text-[15px] leading-[1.85] whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.72)' }}>
        {value}
      </p>
    )
  }

  // null / undefined
  if (value == null) {
    return <p className="font-dm text-[13px]" style={{ color: 'rgba(255,255,255,0.25)' }}>—</p>
  }

  // Array handling
  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="font-dm text-[13px]" style={{ color: 'rgba(255,255,255,0.25)' }}>—</p>

    const first = value[0]

    // Array of strings
    if (typeof first === 'string' || typeof first === 'number') return <StringList items={value} />

    // Risks & constraints array
    if (sectionKey === 'risks_constraints' || first.risk !== undefined || first.mitigation !== undefined) {
      return <div>{value.map((item, i) => <RiskRow key={i} item={item} />)}</div>
    }

    // Functional / non-functional requirements array
    if (sectionKey === 'functional_requirements' || first.id !== undefined || first.title !== undefined) {
      return <div>{value.map((item, i) => <FRCard key={i} item={item} index={i} />)}</div>
    }

    // Generic object array fallback
    return (
      <div className="space-y-2">
        {value.map((item, i) => (
          <div key={i} className="border border-brand-border rounded-sm p-3 font-dm text-[13px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {Object.entries(item).map(([k, v]) => (
              <div key={k}><span className="text-brand-muted/50">{k}: </span>{String(v)}</div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  // Object handling
  if (typeof value === 'object') {
    const entries = Object.entries(value)

    // NFR object with category keys → arrays of items
    if (sectionKey === 'non_functional_requirements') {
      return (
        <div>
          {entries.map(([cat, items]) => (
            <NFRCategory key={cat} catKey={cat} items={items} />
          ))}
        </div>
      )
    }

    // Scope object {in_scope, assumptions, out_of_scope}
    if (sectionKey === 'scope' || entries.some(([k]) => k === 'in_scope' || k === 'out_of_scope')) {
      return (
        <div>
          {entries.map(([k, v]) => {
            const items = Array.isArray(v) ? v : (v ? [String(v)] : [])
            return (
              <SubSection key={k} title={k}>
                <StringList items={items} />
              </SubSection>
            )
          })}
        </div>
      )
    }

    // Generic object — render each key
    return (
      <div>
        {entries.map(([k, v]) => (
          <SubSection key={k} title={k}>
            <BRDSectionContent sectionKey={k} value={v} />
          </SubSection>
        ))}
      </div>
    )
  }

  // Fallback — primitive
  return <p className="font-dm text-[14px]" style={{ color: 'rgba(255,255,255,0.6)' }}>{String(value)}</p>
}

import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'

export default function AuditSidebar() {
  const { onLog } = useApp()
  const [entries, setEntries] = useState([
    { id: 0, level: 'info', msg: 'Agent waiting for emails...', time: '' }
  ])

  useEffect(() => {
    let id = 1
    return onLog((level, msg) => {
      const time = new Date().toLocaleTimeString('en-US', { hour12: false })
      setEntries(prev => {
        const next = [{ id: id++, level, msg, time }, ...prev]
        return next.slice(0, 100)
      })
    })
  }, [onLog])

  const colors = { ok: 'var(--teal)', info: 'var(--tx2)', error: 'var(--red)', warn: 'var(--pur)' }

  return (
    <aside className="audit-sidebar">
      <div className="audit-h">
        <div className="dot dot-g pulse" />
        AGENT AUDIT TRAIL
      </div>
      <div className="audit-m">
        {entries.map(e => (
          <div key={e.id} className="audit-entry ll">
            {e.time && <span style={{ color: 'var(--tx3)' }}>[{e.time}] </span>}
            <span className={`m ${e.level}`} style={{ color: colors[e.level] || 'var(--tx2)' }}>
              {e.msg}
            </span>
          </div>
        ))}
      </div>
    </aside>
  )
}

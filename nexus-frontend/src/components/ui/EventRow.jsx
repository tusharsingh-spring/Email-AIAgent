import { useApp } from '../../context/AppContext'

const FT = iso => { try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return iso || '' } }

export default function EventRow({ event: e, onCancel }) {
  return (
    <div className="ev">
      <div className="ev-bar" style={{ background: e.status === 'confirmed' ? 'var(--teal)' : 'var(--amb)' }} />
      <div style={{ flex: 1 }}>
        <div className="ev-title">{e.title || e.summary || 'Untitled'}</div>
        <div className="ev-when">{FT(e.start)}{e.end ? ` → ${FT(e.end)}` : ''}</div>
        {(e.attendees || []).length > 0 && (
          <div className="ev-who">{(e.attendees || []).slice(0, 3).join(', ')}</div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-end' }}>
        <span className={`badge ${e.status === 'confirmed' ? 'b-gn' : 'b-am'}`}>{e.status || 'confirmed'}</span>
        {e.html_link && <a href={e.html_link} target="_blank" rel="noreferrer" className="btn btn-g btn-sm">Open ↗</a>}
        {onCancel && <button className="btn btn-red btn-sm" onClick={() => onCancel(e.id)}>Cancel</button>}
      </div>
    </div>
  )
}

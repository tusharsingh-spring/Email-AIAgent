import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { getCalendarEvents, deleteCalendarEvent } from '../services/api'
import EventRow from '../components/ui/EventRow'

export default function Calendar() {
  const { state, dispatch, toast, addLog } = useApp()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    addLog('info', 'Syncing Google Calendar...')
    try {
      const d = await getCalendarEvents()
      dispatch({ type: 'SET_EVENTS', events: d.events || [] })
      toast(`${(d.events || []).length} events loaded`, 'ok')
      addLog('ok', `Calendar synced: ${(d.events || []).length} events`)
    } catch {
      setError('Calendar sync failed — check auth in Settings')
      toast('Calendar sync failed', 'warn')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const cancelEvent = async (id) => {
    try {
      await deleteCalendarEvent(id)
      dispatch({ type: 'CANCEL_EVENT', id })
      toast('Event cancelled', 'warn')
    } catch { toast('Cancel failed', 'warn') }
  }

  const events = state.events || []
  const isAuthed = !!state.authenticated

  const today = new Date()
  const next14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    const iso = d.toISOString().slice(0, 10)
    const sameDayEvents = events.filter(e => (e.start || e.start_time || '').startsWith(iso))
    return { iso, label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), events: sameDayEvents }
  })

  return (
    <div className="pb-16">
      <div className="ph">
        <div className="pt">Google Calendar</div>
        <div className="ps-h">Real events — NEXUS writes here when you approve scheduling actions</div>
      </div>
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <span className={`px-2 py-1 rounded-sm font-space text-[10px] uppercase tracking-widest border ${isAuthed ? 'border-[rgba(0,255,157,0.3)] text-[#00ff9d]' : 'border-[rgba(255,80,80,0.3)] text-[#ff5080]'}`}>
          {isAuthed ? 'Google Connected' : 'Not Connected'}
        </span>
        {!isAuthed && (
          <span className="font-space text-[10px] text-brand-muted">Open Settings → Connect Google to enable calendar sync.</span>
        )}
      </div>
      <div className="card">
        <div className="ch">
          <div className="card-t">Upcoming (14 days)</div>
          <div className="flex items-center gap-2">
            {loading && <span className="spin" />}
            <button className="btn btn-g btn-sm" onClick={load} disabled={loading}>
              {loading ? 'Syncing…' : '↻ Sync'}
            </button>
          </div>
        </div>

        {error && (
          <div className="alert warn">
            <div className="alert-title">Sync issue</div>
            <div className="alert-body">{error}</div>
          </div>
        )}

        {loading && events.length === 0 ? (
          <div className="empty"><div className="ei">…</div>Fetching calendar events…</div>
        ) : events.length > 0 ? (
          events.map(e => <EventRow key={e.id} event={e} onCancel={cancelEvent} />)
        ) : (
          <div className="empty"><div className="ei">▦</div>No events found — ensure Google auth is connected and click Sync</div>
        )}
      </div>

      {/* Simple 14-day grid view so the page never looks blank */}
      <div className="mt-6 border border-brand-border rounded-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-brand-border font-space text-[10px] uppercase tracking-widest text-brand-muted">
          Timeline Preview (next 14 days)
        </div>
        <div className="grid md:grid-cols-4 grid-cols-2">
          {next14.map(day => (
            <div key={day.iso} className="p-3 border-t border-brand-border/40">
              <div className="font-space text-[9px] uppercase tracking-[0.12em] text-brand-muted mb-1">{day.label}</div>
              {day.events.length === 0 ? (
                <div className="text-brand-muted text-[12px]">—</div>
              ) : (
                <ul className="space-y-1">
                  {day.events.map(ev => (
                    <li key={ev.id} className="text-[12px] text-brand-text">
                      <span className="text-brand-blue">●</span> {ev.title || ev.summary || 'Event'}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

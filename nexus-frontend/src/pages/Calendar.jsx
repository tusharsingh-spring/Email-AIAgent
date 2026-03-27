import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { getCalendarEvents, deleteCalendarEvent } from '../services/api'
import EventRow from '../components/ui/EventRow'

export default function Calendar() {
  const { state, dispatch, toast, addLog } = useApp()
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    addLog('info', 'Syncing Google Calendar...')
    try {
      const d = await getCalendarEvents()
      dispatch({ type: 'SET_EVENTS', events: d.events || [] })
      toast(`${(d.events || []).length} events loaded`, 'ok')
      addLog('ok', `Calendar synced: ${(d.events || []).length} events`)
    } catch { toast('Calendar sync failed', 'warn') }
    setLoading(false)
  }

  const cancelEvent = async (id) => {
    try {
      await deleteCalendarEvent(id)
      dispatch({ type: 'CANCEL_EVENT', id })
      toast('Event cancelled', 'warn')
    } catch {}
  }

  return (
    <div>
      <div className="ph">
        <div className="pt">Google Calendar</div>
        <div className="ps-h">Real events — NEXUS writes here when you approve scheduling actions</div>
      </div>
      <div className="card">
        <div className="ch">
          <div className="card-t">Upcoming (14 days)</div>
          <button className="btn btn-g btn-sm" onClick={load} disabled={loading}>{loading ? <span className="spin" /> : '↻ Sync'}</button>
        </div>
        {state.events.length
          ? state.events.map(e => <EventRow key={e.id} event={e} onCancel={cancelEvent} />)
          : <div className="empty"><div className="ei">▦</div>Click Sync to load real calendar</div>
        }
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { getCalendarEvents, deleteCalendarEvent } from '../services/api'
import { Calendar as CalendarIcon, List, LayoutGrid, Loader2, RefreshCw, Trash2, Clock, Video, AlertTriangle, CheckCircle2 } from 'lucide-react'

// Apple-style date & time formatters
const formatTime = (iso) => {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

const formatDate = (iso) => {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function Calendar() {
  const { state, dispatch, toast, addLog } = useApp() || {}
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState('list') // 'list' | 'grid'
  const [cancellingId, setCancellingId] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    addLog?.('info', 'Syncing Google Calendar...')
    try {
      const d = await getCalendarEvents()
      dispatch?.({ type: 'SET_EVENTS', events: d.events || [] })
      toast?.(`${(d.events || []).length} events loaded`, 'ok')
      addLog?.('ok', `Calendar synced: ${(d.events || []).length} events`)
    } catch (e) {
      setError('Calendar sync failed — check auth in Settings')
      toast?.('Calendar sync failed', 'warn')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const cancelEvent = async (id) => {
    setCancellingId(id)
    try {
      await deleteCalendarEvent(id)
      dispatch?.({ type: 'CANCEL_EVENT', id })
      toast?.('Event cancelled', 'ok')
      addLog?.('info', `Cancelled calendar event: ${id}`)
    } catch { 
      toast?.('Cancel failed', 'warn') 
    }
    setCancellingId(null)
  }

  const events = state?.events || []
  const isAuthed = !!state?.authenticated

  // Generate 14-day timeline
  const today = new Date()
  const next14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    const iso = d.toISOString().slice(0, 10)
    const sameDayEvents = events.filter(e => (e.start || e.start_time || '').startsWith(iso))
    return { 
      iso, 
      dayNum: d.getDate(),
      dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
      isToday: i === 0,
      events: sameDayEvents 
    }
  })

  return (
    <div className="min-h-screen pb-24 font-sans text-zinc-100 selection:bg-blue-500/30">

      {/* HEADER */}
      <div className="max-w-6xl mx-auto pt-12 px-6 lg:px-8 mb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-6">
          <div>
            <div className="font-mono text-[11px] text-zinc-500 uppercase tracking-widest mb-2 font-medium">Scheduling</div>
            <h1 className="font-sans text-4xl font-semibold tracking-tight text-white flex items-center gap-3">
              Google Calendar
            </h1>
            <p className="text-sm text-zinc-400 mt-2">
              Real events managed by NEXUS. Approving a schedule action writes directly to this calendar.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            
            {/* View Toggle (List vs Grid) */}
            <div className="flex bg-[#0a0a0a] p-1.5 rounded-lg border border-white/5">
              <button
                onClick={() => setView('list')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  view === 'list' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                }`}
              >
                <List size={16} /> List
              </button>
              <button
                onClick={() => setView('grid')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  view === 'grid' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                }`}
              >
                <LayoutGrid size={16} /> Timeline
              </button>
            </div>

            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-sm font-medium text-zinc-300 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Sync
            </button>
          </div>
        </div>

        {/* Auth Status Banner */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-[10px] uppercase tracking-wider font-medium border ${
            isAuthed ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}>
            {isAuthed ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            {isAuthed ? 'Google Connected' : 'Not Connected'}
          </span>
          {!isAuthed && (
            <span className="font-sans text-sm text-zinc-500">
              Open Settings → Connect Google to enable calendar synchronization.
            </span>
          )}
        </div>
      </div>

      {/* ERROR STATE */}
      {error && (
        <div className="max-w-6xl mx-auto px-6 lg:px-8 mb-6">
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="text-rose-400 shrink-0 mt-0.5" size={18} />
            <div>
              <h3 className="text-sm font-semibold text-rose-400">Sync Issue</h3>
              <p className="text-sm text-rose-400/80 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* CONTENT AREA */}
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        
        {view === 'list' ? (
          /* --- LIST VIEW --- */
          <div className="bg-[#0a0a0a] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
            <div className="bg-white/[0.02] border-b border-white/10 px-6 py-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 font-medium">
                Upcoming Events ({events.length})
              </span>
            </div>

            {loading && events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
                <Loader2 size={32} className="animate-spin mb-4 text-zinc-600" />
                <div className="font-medium text-sm">Fetching calendar events...</div>
              </div>
            ) : events.length > 0 ? (
              <div className="divide-y divide-white/5">
                {events.map(e => (
                  <div key={e.id} className="p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-white/[0.02] transition-colors group">
                    
                    {/* Date/Time Block */}
                    <div className="shrink-0 w-32">
                      <div className="font-sans text-sm font-semibold text-zinc-200">
                        {formatDate(e.start || e.start_time)}
                      </div>
                      <div className="font-mono text-[11px] text-zinc-500 mt-1 flex items-center gap-1.5">
                        <Clock size={12} /> {formatTime(e.start || e.start_time)}
                      </div>
                    </div>

                    {/* Event Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-sans text-base font-medium text-white truncate">
                        {e.title || e.summary || 'Untitled Event'}
                      </h4>
                      {e.meet_link && (
                        <a href={e.meet_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 mt-2 bg-blue-500/10 px-2 py-1 rounded">
                          <Video size={14} /> Join Meeting
                        </a>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                      <button
                        onClick={() => cancelEvent(e.id)}
                        disabled={cancellingId === e.id}
                        className="p-2 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-50"
                        title="Cancel Event"
                      >
                        {cancellingId === e.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="p-4 rounded-full bg-white/5 border border-white/5">
                  <CalendarIcon size={32} className="text-zinc-600" />
                </div>
                <div className="font-sans text-lg text-zinc-400 font-medium">
                  No upcoming events found
                </div>
              </div>
            )}
          </div>
        ) : (
          /* --- TIMELINE GRID VIEW (14 Days) --- */
          <div className="bg-[#0a0a0a] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 border-l border-t border-white/5">
              {next14.map((day, i) => (
                <div 
                  key={day.iso} 
                  className={`min-h-[140px] p-3 border-r border-b border-white/5 transition-colors ${
                    day.isToday ? 'bg-blue-500/5' : 'bg-white/[0.01] hover:bg-white/[0.03]'
                  }`}
                >
                  {/* Day Header */}
                  <div className="flex items-center justify-between mb-3">
                    <span className={`font-sans text-sm font-semibold ${day.isToday ? 'text-blue-400' : 'text-zinc-400'}`}>
                      {day.dayName}
                    </span>
                    <span className={`font-mono text-xs w-6 h-6 flex items-center justify-center rounded-full ${
                      day.isToday ? 'bg-blue-500 text-white' : 'text-zinc-500'
                    }`}>
                      {day.dayNum}
                    </span>
                  </div>

                  {/* Events List for the Day */}
                  <div className="space-y-1.5">
                    {day.events.length === 0 ? (
                      <div className="text-xs text-zinc-700 font-medium px-1">—</div>
                    ) : (
                      day.events.map(ev => (
                        <div 
                          key={ev.id} 
                          className="px-2 py-1.5 rounded bg-white/5 border border-white/5 text-xs text-zinc-300 font-medium truncate flex flex-col gap-1 cursor-default group"
                          title={ev.title || ev.summary}
                        >
                          <div className="truncate flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></div>
                            <span className="truncate">{ev.title || ev.summary || 'Event'}</span>
                          </div>
                          <div className="font-mono text-[9px] text-zinc-500 ml-3">
                            {formatTime(ev.start || ev.start_time)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
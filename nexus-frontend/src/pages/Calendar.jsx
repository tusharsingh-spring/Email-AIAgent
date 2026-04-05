import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { getCalendarEvents, deleteCalendarEvent } from '../services/api'
import { 
  Calendar as CalendarIcon, 
  Menu, 
  Search, 
  Settings, 
  HelpCircle,
  Loader2, 
  RefreshCw, 
  Trash2, 
  Video, 
  AlertTriangle, 
  CheckCircle2,
  ChevronDown
} from 'lucide-react'

// Google Calendar style date & time formatters
const formatTime = (iso) => {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
}

const formatDate = (iso) => {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
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
    <div className="h-full w-full flex flex-col bg-[#202124] text-[#e8eaed] font-sans selection:bg-[#8ab4f8]/30">
      
      {/* GOOGLE CALENDAR TOP APP BAR */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-[#3c4043] bg-[#202124] shrink-0">
        <div className="flex items-center gap-4">
          <button className="p-2 hover:bg-[#3c4043] rounded-full transition-colors text-[#e8eaed]">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="bg-white p-1 rounded">
              <CalendarIcon size={18} className="text-[#1a73e8]" />
            </div>
            <span className="text-[22px] font-medium text-[#e8eaed] leading-none tracking-wide">
              Calendar
            </span>
          </div>
          
          {/* Today Button & Sync */}
          <div className="ml-4 flex items-center gap-4">
            <button 
              onClick={load}
              disabled={loading}
              className="px-4 py-1.5 border border-[#3c4043] rounded hover:bg-[#303134] text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Sync
            </button>
            <h2 className="text-[22px] font-normal text-[#e8eaed]">
              {today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Auth Status / Icons */}
          <div className="flex items-center mr-4">
            {isAuthed ? (
               <span className="flex items-center gap-1.5 px-3 py-1 text-[#8ab4f8] text-sm font-medium mr-4">
                 <CheckCircle2 size={16} /> Linked
               </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-[#fbbc04]/10 text-[#fbbc04] rounded text-xs font-medium mr-4">
                <AlertTriangle size={14} /> Connect Account
              </span>
            )}
            <button className="p-2.5 hover:bg-[#3c4043] rounded-full text-[#e8eaed]"><Search size={20} /></button>
            <button className="p-2.5 hover:bg-[#3c4043] rounded-full text-[#e8eaed]"><HelpCircle size={20} /></button>
            <button className="p-2.5 hover:bg-[#3c4043] rounded-full text-[#e8eaed]"><Settings size={20} /></button>
          </div>

          {/* View Toggle */}
          <div className="relative flex bg-[#202124] border border-[#3c4043] rounded">
            <button
              onClick={() => setView('list')}
              className={`px-4 py-1.5 text-sm font-medium transition-colors border-r border-[#3c4043] ${
                view === 'list' ? 'bg-[#3c4043] text-[#8ab4f8]' : 'hover:bg-[#303134] text-[#e8eaed]'
              }`}
            >
              Schedule
            </button>
            <button
              onClick={() => setView('grid')}
              className={`px-4 py-1.5 text-sm font-medium transition-colors flex items-center gap-1 ${
                view === 'grid' ? 'bg-[#3c4043] text-[#8ab4f8]' : 'hover:bg-[#303134] text-[#e8eaed]'
              }`}
            >
              Timeline <ChevronDown size={14} className="ml-1 opacity-70" />
            </button>
          </div>
        </div>
      </header>

      {/* ERROR BANNER */}
      {error && (
        <div className="bg-[#fbbc04]/10 text-[#fbbc04] px-6 py-3 flex items-center gap-3 border-b border-[#fbbc04]/20 shrink-0">
          <AlertTriangle size={18} />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        
        {/* Content (No Left Sidebar anymore) */}
        <div className="flex-1 overflow-y-auto bg-[#202124] p-4 lg:p-8">
          
          {view === 'list' ? (
            /* --- SCHEDULE VIEW --- */
            <div className="max-w-4xl mx-auto">
              {loading && events.length === 0 ? (
                <div className="flex items-center justify-center py-20 text-[#9aa0a6]">
                  <Loader2 size={24} className="animate-spin" />
                </div>
              ) : events.length > 0 ? (
                <div className="space-y-6">
                  {events.map(e => (
                    <div key={e.id} className="flex group">
                      {/* Left Date Column */}
                      <div className="w-24 shrink-0 flex flex-col pt-1">
                        <span className="text-xs font-medium text-[#9aa0a6] uppercase tracking-wider">
                          {new Date(e.start || e.start_time).toLocaleDateString('en-US', { weekday: 'short' })}
                        </span>
                        <span className="text-2xl text-[#e8eaed] -mt-1">
                          {new Date(e.start || e.start_time).getDate()}
                        </span>
                      </div>
                      
                      {/* Right Event Details */}
                      <div className="flex-1 flex items-start gap-4 p-2 rounded-lg hover:bg-[#303134] transition-colors relative border border-transparent hover:border-[#3c4043]">
                        <div className="w-3 h-3 rounded-full bg-[#8ab4f8] mt-1.5 shrink-0"></div>
                        <div className="flex-1">
                          <div className="text-sm text-[#e8eaed] flex items-center gap-2 font-medium">
                            {formatTime(e.start || e.start_time)}
                            {/* Static placeholder for end time styling */}
                            <span className="text-[#9aa0a6] font-normal text-xs">to 11:00 am</span> 
                          </div>
                          <h4 className="text-[15px] font-medium text-[#e8eaed] mt-0.5">
                            {e.title || e.summary || '(No title)'}
                          </h4>
                          {e.meet_link && (
                            <a href={e.meet_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-[#8ab4f8] hover:bg-[#8ab4f8]/10 px-2 py-1 rounded mt-2 transition-colors border border-[#8ab4f8]/20">
                              <Video size={14} /> Join Google Meet
                            </a>
                          )}
                        </div>
                        
                        {/* Delete Action */}
                        <button
                          onClick={() => cancelEvent(e.id)}
                          disabled={cancellingId === e.id}
                          className="opacity-0 group-hover:opacity-100 p-2 text-[#9aa0a6] hover:bg-[#3c4043] rounded-full transition-all disabled:opacity-50"
                          title="Delete Event"
                        >
                          {cancellingId === e.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-32">
                  <div className="text-[#9aa0a6] text-base">Nothing planned. Tap to create.</div>
                </div>
              )}
            </div>
          ) : (
            /* --- TIMELINE GRID VIEW (14 Days) --- */
            <div className="border-t border-l border-[#3c4043] rounded-lg overflow-hidden flex flex-col h-full">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 flex-1">
                {next14.map((day) => (
                  <div 
                    key={day.iso} 
                    className={`border-r border-b border-[#3c4043] flex flex-col p-1.5 min-h-[120px] ${
                      day.isToday ? 'bg-[#8ab4f8]/[0.03]' : ''
                    }`}
                  >
                    {/* Day Header */}
                    <div className="text-center mb-1 mt-1 flex flex-col items-center">
                      <span className={`text-[11px] font-medium uppercase ${day.isToday ? 'text-[#8ab4f8]' : 'text-[#9aa0a6]'}`}>
                        {day.dayName}
                      </span>
                      <div className={`text-xl flex items-center justify-center w-10 h-10 rounded-full mt-0.5 ${
                        day.isToday ? 'bg-[#8ab4f8] text-[#202124]' : 'text-[#e8eaed] hover:bg-[#303134]'
                      }`}>
                        {day.dayNum}
                      </div>
                    </div>

                    {/* Events List */}
                    <div className="flex-1 overflow-y-auto space-y-1 mt-1">
                      {day.events.map(ev => (
                        <div 
                          key={ev.id} 
                          className="px-2 py-1 rounded bg-[#8ab4f8] text-[#202124] text-xs font-medium truncate cursor-pointer hover:brightness-110 transition-all flex items-center gap-1.5"
                          title={ev.title || ev.summary}
                        >
                          <span className="truncate">{ev.title || ev.summary || '(No title)'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
import { useEffect, useState, useRef } from 'react'
import { Sparkles, Send, List, BookOpen, Terminal, User, Cpu, Loader2, Activity, Clock } from 'lucide-react'
import {
  getProjects,
  getProjectContext,
  getProjectEmails,
  getProjectDocuments,
  deleteProject,
  getStats,
  getSummary,
  getActionsBySections,
  listBrds,
  getCalendarEvents
} from '../services/api'

// --- BUBBLE COMPONENTS ---
function BotBubble({ text }) {
  return (
    <div className="flex gap-3 max-w-[85%] mb-6 group">
      <div className="w-8 h-8 rounded-sm bg-brand-blue/10 border border-brand-blue/30 flex items-center justify-center shrink-0">
        <Cpu size={16} className="text-brand-blue" />
      </div>
      <div className="space-y-1">
        <div className="font-space text-[9px] uppercase tracking-widest text-brand-muted">AI Agent</div>
        <div className="rounded-sm bg-[#0a0a0a] border border-brand-border p-4 text-[13px] text-brand-text leading-relaxed whitespace-pre-wrap shadow-sm group-hover:border-brand-blue/30 transition-colors">
          {text}
        </div>
      </div>
    </div>
  )
}

function UserBubble({ text }) {
  return (
    <div className="flex gap-3 max-w-[85%] mb-6 ml-auto flex-row-reverse group">
      <div className="w-8 h-8 rounded-sm bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
        <User size={16} className="text-white" />
      </div>
      <div className="space-y-1 text-right">
        <div className="font-space text-[9px] uppercase tracking-widest text-brand-muted">Operator</div>
        <div className="rounded-sm bg-brand-blue text-black p-4 text-[13px] leading-relaxed font-dm shadow-lg">
          {text}
        </div>
      </div>
    </div>
  )
}

// --- SYSTEM PROMPT ---
const SYSTEM_PROMPT = `You are the Nexus AI Operations Router. Map the user's request to one of these intents:
- "list_projects": Show all workspaces/projects.
- "project_context": Show info/context about a specific project. (Requires "project" parameter).
- "delete_project": Delete/remove a project. (Requires "project" parameter).
- "get_stats": Show system metrics, throughput, or stats.
- "get_summary": Show the daily AI digest or summary.
- "list_pending_actions": Show pending tasks, escalations, or queued items.
- "list_brds": Show generated documents or BRDs.
- "get_calendar": Show upcoming meetings or schedule.
- "unknown": Request does not match any of the above.

Output ONLY valid JSON in this exact format:
{"action": "intent_name", "project": "name if applicable or empty string"}
Do not include markdown blocks, backticks, or any other text.`

export default function Assistant() {
  const [messages, setMessages] = useState([
    { role: 'bot', text: 'Console initialized. Command me to list projects, analyze context, check system telemetry, view pending queues, or review calendar events.' }
  ])
  const [input, setInput] = useState('')
  const [projects, setProjects] = useState([])
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    refreshProjects()
  }, [])

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, busy])

  const refreshProjects = async () => {
    try {
      const d = await getProjects()
      setProjects(d.projects || [])
    } catch {
      setProjects([])
    }
  }

  const push = (role, text) => setMessages(m => [...m, { role, text }])

  const findProject = (name) => {
    if (!name) return null
    const lcName = name.toLowerCase()
    return projects.find(p => (p.name || '').toLowerCase() === lcName)
      || projects.find(p => (p.name || '').toLowerCase().includes(lcName))
  }

  // --- INTENT EXECUTION ENGINE ---
  const runIntent = async (intent) => {
    const action = intent?.action
    const projectName = intent?.project?.trim() || ''

    try {
      switch (action) {
        case 'list_projects': {
          if (!projects.length) return push('bot', 'Scanning... No active projects found.')
          push('bot', 'System Projects:\n\n' + projects.map(p => `• ${p.name || 'Unnamed'}`).join('\n'))
          break
        }

        case 'project_context': {
          if (!projectName) return push('bot', 'Action required: Please specify project name.')
          const proj = findProject(projectName)
          if (!proj) return push('bot', `Error: Workspace "${projectName}" not recognized.`)
          
          setBusy(true)
          const [ctx, emailsRes, docsRes] = await Promise.all([
            getProjectContext(proj.id).catch(() => ({})),
            getProjectEmails(proj.id).catch(() => ({ emails: [] })),
            getProjectDocuments(proj.id).catch(() => ({ documents: [] })),
          ])
          
          const summary = [
            `Target: ${proj.name || 'Untitled'}`,
            `Signal: ${emailsRes.emails?.length || 0} emails / ${docsRes.documents?.length || 0} docs`,
            `────────────────────────`,
            `${ctx.context || ctx.full_text || '(Empty context cluster)'}`.slice(0, 600) + '...'
          ].join('\n')
          
          push('bot', summary)
          break
        }

        case 'delete_project': {
          if (!projectName) return push('bot', 'Action required: Name the target for deletion.')
          const proj = findProject(projectName)
          if (!proj) return push('bot', `Error: Project "${projectName}" not found.`)
          
          setBusy(true)
          await deleteProject(proj.id)
          push('bot', `Success: Project "${proj.name}" has been purged.`)
          await refreshProjects()
          break
        }

        case 'get_stats': {
          setBusy(true)
          const st = await getStats()
          push('bot', `System Telemetry:\n\n• Processed Items: ${st.total_processed || 0}\n• Escalations: ${st.escalations || 0}\n• Scheduled Meetings: ${st.total_meetings || 0}\n• BRDs Generated: ${st.brds_generated || 0}`)
          break
        }

        case 'get_summary': {
          setBusy(true)
          const sum = await getSummary()
          push('bot', `AI Digest:\n\n${sum.summary || 'No digest available currently.'}`)
          break
        }

        case 'list_pending_actions': {
          setBusy(true)
          const sections = await getActionsBySections()
          const queues = Object.entries(sections || {})
            .filter(([_, arr]) => Array.isArray(arr) && arr.length > 0)
            .map(([name, arr]) => `• ${name}: ${arr.length} pending`)
          
          if (!queues.length) return push('bot', 'All clear. No pending actions in the queue.')
          push('bot', `Operational Queue Snapshot:\n\n${queues.join('\n')}`)
          break
        }

        case 'list_brds': {
          setBusy(true)
          const res = await listBrds()
          const brds = res.brds || []
          if (!brds.length) return push('bot', 'No Documents generated yet.')
          push('bot', `Document Archive:\n\n${brds.slice(0, 5).map(b => `• ${b.title || 'Untitled'} (ID: ${b.job_id?.slice(0,6)})`).join('\n')}${brds.length > 5 ? '\n...and more.' : ''}`)
          break
        }

        case 'get_calendar': {
          setBusy(true)
          const cal = await getCalendarEvents(7)
          const events = cal.events || []
          if (!events.length) return push('bot', 'No upcoming calendar events detected for the next 7 days.')
          push('bot', `Upcoming Schedule:\n\n${events.slice(0,5).map(e => `• ${e.title} (${new Date(e.start).toLocaleDateString()})`).join('\n')}`)
          break
        }

        default:
          push('bot', 'Instruction unclear. I can fetch system stats, list pending actions, review calendars, or inspect project contexts.')
      }
    } catch (e) {
      console.error(e)
      push('bot', 'Critical: Failed to resolve request data.')
    } finally {
      setBusy(false)
    }
  }

  // --- GROQ API CALL ---
  const callGroq = async (userText) => {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY
    if (!apiKey) throw new Error('Missing VITE_GROQ_API_KEY in frontend env')
    
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userText }],
      })
    })
    
    if (!res.ok) throw new Error(`Groq error ${res.status}`)
    const data = await res.json()
    let raw = data?.choices?.[0]?.message?.content || '{}'
    
    // Safety cleanup in case LLM adds markdown backticks
    raw = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
    return JSON.parse(raw)
  }

  const handleCommand = async (raw) => {
    const text = raw.trim()
    if (!text || busy) return
    
    push('user', text)
    setInput('')
    setBusy(true)
    
    try {
      const intent = await callGroq(text)
      await runIntent(intent || { action: 'unknown', project: '' })
    } catch (e) {
      push('bot', `System Exception: ${e.message}`)
      setBusy(false)
    }
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="mb-8 mt-6">
        <div className="htag mb-4 font-space text-[11px] uppercase tracking-widest text-brand-muted flex items-center gap-2">
          <Terminal size={12} className="text-brand-blue" />
          Command Center / Agent v2.0
        </div>
        <h1 className="font-bebas text-[clamp(40px,7vw,86px)] leading-[0.9] uppercase text-brand-text flex items-center gap-4">
          <Sparkles className="text-brand-blue" size={48} />
          AI Ops Chat
        </h1>
      </div>

      <div className="grid lg:grid-cols-[1fr,320px] gap-6 items-start">
        {/* Main Chat Interface */}
        <div className="border border-brand-border rounded-sm overflow-hidden bg-[#050505] flex flex-col shadow-2xl">
          <div className="bg-[#0a0a0a] border-b border-brand-border px-4 py-3 flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/60 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
            <div className="w-2.5 h-2.5 rounded-full bg-brand-yellow/60 shadow-[0_0_8px_rgba(255,226,52,0.4)]" />
            <div className="w-2.5 h-2.5 rounded-full bg-brand-blue/60 shadow-[0_0_8px_rgba(0,181,226,0.4)]" />
            <span className="ml-3 font-space text-[9px] uppercase tracking-[0.2em] text-brand-muted/70 font-bold">active_session:operator_01</span>
          </div>

          {/* Message Area */}
          <div 
            ref={scrollRef}
            className="h-[600px] overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-brand-border scroll-smooth"
          >
            {messages.map((m, i) => (
              <div key={i}>
                {m.role === 'user' ? <UserBubble text={m.text} /> : <BotBubble text={m.text} />}
              </div>
            ))}
            
            {/* Animated Thinking Indicator */}
            {busy && (
              <div className="flex gap-3 max-w-[85%] mb-4 animate-pulse">
                <div className="w-8 h-8 rounded-sm bg-brand-blue/10 border border-brand-blue/30 flex items-center justify-center shrink-0">
                  <Loader2 size={16} className="text-brand-blue animate-spin" />
                </div>
                <div className="space-y-1">
                  <div className="font-space text-[9px] uppercase tracking-widest text-brand-muted">Thinking</div>
                  <div className="bg-[#0a0a0a] border border-brand-border p-3 rounded-sm h-12 w-24 flex items-center gap-1.5 px-4">
                    <div className="w-1.5 h-1.5 bg-brand-blue rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-brand-blue rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-brand-blue rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <form 
            onSubmit={(e) => { e.preventDefault(); handleCommand(input); }} 
            className="p-4 bg-[#0a0a0a] border-t border-brand-border flex items-center gap-3"
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Query system (e.g. 'Show telemetry' or 'What's in the queue?')"
              className="flex-1 bg-brand-input border border-brand-border text-brand-text px-4 py-3.5 rounded-sm font-dm text-[14px] outline-none focus:border-brand-blue transition-all"
              disabled={busy}
            />
            <button 
              type="submit" 
              disabled={busy || !input.trim()}
              className="w-12 h-12 bg-brand-blue text-black rounded-sm flex items-center justify-center hover:bg-white transition-colors disabled:opacity-40 shadow-lg shadow-brand-blue/10"
            >
              <Send size={18} />
            </button>
          </form>
        </div>

        {/* Sidebar Actions */}
        <div className="space-y-4">
          <div className="border border-brand-border rounded-sm p-6 bg-[#050505] shadow-xl">
            <div className="font-space text-[10px] uppercase tracking-[0.2em] text-brand-blue mb-5 font-bold">Quick Directives</div>
            <div className="space-y-3">
              <button 
                onClick={() => handleCommand('Check system telemetry and stats')} 
                className="w-full flex items-center justify-between px-4 py-3 rounded-sm border border-brand-border text-brand-muted hover:text-white hover:border-brand-blue/50 hover:bg-brand-blue/5 transition-all font-space text-[10px] uppercase tracking-widest group bg-[#0a0a0a]"
              >
                <div className="flex items-center gap-3">
                  <Activity size={14} className="text-brand-blue" /> System Telemetry
                </div>
              </button>
              
              <button 
                onClick={() => handleCommand('What actions are pending in the queue?')} 
                className="w-full flex items-center justify-between px-4 py-3 rounded-sm border border-brand-border text-brand-muted hover:text-white hover:border-brand-yellow/50 hover:bg-brand-yellow/5 transition-all font-space text-[10px] uppercase tracking-widest group bg-[#0a0a0a]"
              >
                <div className="flex items-center gap-3 text-left">
                  <Clock size={14} className="text-brand-yellow" /> Operational Queue
                </div>
              </button>

              <button 
                onClick={() => handleCommand('list projects')} 
                className="w-full flex items-center justify-between px-4 py-3 rounded-sm border border-brand-border text-brand-muted hover:text-white hover:border-brand-blue/50 hover:bg-brand-blue/5 transition-all font-space text-[10px] uppercase tracking-widest group bg-[#0a0a0a]"
              >
                <div className="flex items-center gap-3">
                  <List size={14} className="text-brand-blue" /> List Workspaces
                </div>
              </button>
            </div>
          </div>

          <div className="border border-brand-border rounded-sm p-6 bg-[#050505] shadow-xl">
            <div className="font-space text-[10px] uppercase tracking-[0.2em] text-brand-muted mb-4 font-bold">Syntax Examples</div>
            <div className="space-y-3 font-dm text-[12px] text-brand-muted/80 italic leading-relaxed">
              <div className="p-3 bg-white/5 border-l-2 border-brand-blue rounded-r-sm hover:text-white transition-colors cursor-default">"Show me the daily AI digest."</div>
              <div className="p-3 bg-white/5 border-l-2 border-brand-yellow rounded-r-sm hover:text-white transition-colors cursor-default">"What's on my calendar?"</div>
              <div className="p-3 bg-white/5 border-l-2 border-red-500/50 rounded-r-sm hover:text-white transition-colors cursor-default">"Delete the obsolete project."</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
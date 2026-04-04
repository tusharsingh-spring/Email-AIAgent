import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, X, Wand2, Loader2, Terminal } from 'lucide-react'
import {
  getProjects,
  getProjectContext,
  getProjectEmails,
  getProjectDocuments,
  getStats,
  getSummary,
  getActionsBySections,
  listBrds,
  getCalendarEvents
} from '../../services/api'

// Strict system prompt forcing Groq to act as an API router
const SYSTEM_PROMPT = `You are the KALA DHUA'S AI Operations Router. Your job is to map the user's natural language request to one of the following system intents:
- "list_projects": User wants to see all workspaces/projects.
- "project_context": User wants info, context, emails, or docs about a specific project. (Requires "project_name" parameter).
- "get_stats": User wants to see system metrics, throughput, or stats.
- "get_summary": User wants the daily AI digest or summary.
- "list_pending_actions": User wants to see pending tasks, escalations, or queued items.
- "list_brds": User wants to see generated documents or BRDs.
- "get_calendar": User wants to see upcoming meetings or schedule.
- "unknown": Request does not match any of the above.

Output ONLY valid JSON in this exact format:
{"intent": "intent_name", "parameters": {"project_name": "name if applicable or empty string"}}
Do not include markdown blocks, backticks, or any other text.`

export default function AssistantWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([
    { role: 'bot', text: 'KALA DHUA Agent Online. Ask me about system stats, pending actions, calendar events, or project contexts.' }
  ])
  const [loading, setLoading] = useState(false)
  const [projects, setProjects] = useState([])
  const listRef = useRef(null)

  // Cache projects on mount so we can resolve project names to IDs instantly
  useEffect(() => {
    getProjects().then(d => setProjects(d.projects || [])).catch(() => {})
  }, [])

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, loading])

  const push = (role, text) => setMessages(m => [...m, { role, text }])

  const findProject = (name) => {
    if (!name) return null
    const lower = name.toLowerCase()
    return projects.find(p => (p.name || '').toLowerCase() === lower)
      || projects.find(p => (p.name || '').toLowerCase().includes(lower))
  }

  // --- INTENT EXECUTION ENGINE ---
  const runIntent = async (intentObj) => {
    const { intent, parameters } = intentObj

    try {
      switch (intent) {
        case 'list_projects': {
          const d = await getProjects()
          const projs = d.projects || []
          if (!projs.length) return push('bot', 'No active projects found in the system.')
          push('bot', `Active Workspaces:\n\n${projs.map(p => `• ${p.name}`).join('\n')}`)
          break
        }

        case 'project_context': {
          const projName = parameters?.project_name
          if (!projName) return push('bot', 'Please specify which project you want to inspect.')
          
          const proj = findProject(projName)
          if (!proj) return push('bot', `Could not locate a project matching "${projName}".`)
          
          const [ctx, emailsRes, docsRes] = await Promise.all([
            getProjectContext(proj.id).catch(() => ({})),
            getProjectEmails(proj.id).catch(() => ({ emails: [] })),
            getProjectDocuments(proj.id).catch(() => ({ documents: [] })),
          ])
          
          const ctxText = ctx.context || ctx.full_text || 'No extracted context available yet.'
          push('bot', `[WORKSPACE: ${proj.name}]\nLinked Emails: ${emailsRes.emails?.length || 0}\nTranscripts: ${docsRes.documents?.length || 0}\n\nContext Preview:\n${ctxText.slice(0, 300)}...`)
          break
        }

        case 'get_stats': {
          const st = await getStats()
          push('bot', `System Telemetry:\n• Processed Items: ${st.total_processed || 0}\n• Escalations: ${st.escalations || 0}\n• Scheduled Meetings: ${st.total_meetings || 0}\n• BRDs Generated: ${st.brds_generated || 0}`)
          break
        }

        case 'get_summary': {
          const sum = await getSummary()
          push('bot', `Daily AI Digest:\n\n${sum.summary || 'No digest available currently.'}`)
          break
        }

        case 'list_pending_actions': {
          const sections = await getActionsBySections()
          const queues = Object.entries(sections || {})
            .filter(([_, arr]) => Array.isArray(arr) && arr.length > 0)
            .map(([name, arr]) => `• ${name}: ${arr.length} pending`)
          
          if (!queues.length) return push('bot', 'All clear. There are no pending actions in the queue.')
          push('bot', `Operational Queue Snapshot:\n\n${queues.join('\n')}`)
          break
        }

        case 'list_brds': {
          const res = await listBrds()
          const brds = res.brds || []
          if (!brds.length) return push('bot', 'No Business Requirement Documents have been generated yet.')
          push('bot', `Document Archive:\n\n${brds.slice(0, 5).map(b => `• ${b.title || 'Untitled'} (ID: ${b.job_id?.slice(0,6)})`).join('\n')}${brds.length > 5 ? '\n...and more.' : ''}`)
          break
        }

        case 'get_calendar': {
          const cal = await getCalendarEvents(7)
          const events = cal.events || []
          if (!events.length) return push('bot', 'No upcoming calendar events detected for the next 7 days.')
          push('bot', `Upcoming Schedule:\n\n${events.slice(0,5).map(e => `• ${e.title} (${new Date(e.start).toLocaleDateString()})`).join('\n')}`)
          break
        }

        default:
          push('bot', 'I am unable to process that request. I can fetch system stats, list pending actions, review calendars, or inspect project contexts.')
      }
    } catch (error) {
      console.error("Agent Error:", error)
      push('bot', 'Error: A system failure occurred while fetching the requested data.')
    }
  }

  // --- GROQ API CALL ---
  const callGroq = async (userText) => {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY
    if (!apiKey) throw new Error('API Key missing')

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userText }
        ],
      })
    })
    
    if (!res.ok) throw new Error('Failed to connect to LLM router.')
    
    const data = await res.json()
    let raw = data?.choices?.[0]?.message?.content || '{}'
    
    // Safety cleanup in case LLM adds markdown backticks
    raw = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
    
    return JSON.parse(raw)
  }

  // --- SUBMIT HANDLER ---
  const handleSubmit = async (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    
    push('user', text)
    setInput('')
    setLoading(true)
    
    try {
      const intentObj = await callGroq(text)
      await runIntent(intentObj)
    } catch (e) {
      push('bot', `System Exception: ${e.message}`)
    }
    
    setLoading(false)
  }

  return (
    <div className="fixed bottom-6 right-6 z-[6000]">
      {open && (
        <div className="w-[360px] h-[500px] bg-[#0a0a0a]/95 backdrop-blur-xl border border-[#00f0ff]/20 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] flex flex-col mb-4 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#00f0ff]/5 border-b border-[#00f0ff]/20">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[#00f0ff] font-bold">
              <Terminal size={14} /> Agent Link Secure
            </div>
            <button onClick={() => setOpen(false)} className="p-1 text-[#00f0ff]/50 hover:text-[#00f0ff] transition-colors">
              <X size={16} />
            </button>
          </div>
          
          {/* Chat History */}
          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                {m.role === 'user' ? (
                  <div className="max-w-[85%] bg-[#0055ff]/20 border border-[#0055ff]/40 text-blue-100 px-4 py-2.5 rounded-2xl rounded-tr-sm text-[13px] font-sans shadow-sm">
                    {m.text}
                  </div>
                ) : (
                  <div className="max-w-[85%] bg-[#121214] border border-white/10 px-4 py-3 rounded-2xl rounded-tl-sm text-[13px] font-mono text-zinc-300 whitespace-pre-wrap shadow-sm">
                    {m.text}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-[#121214] border border-[#00f0ff]/20 px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-[#00f0ff]" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-[#00f0ff]">Processing...</span>
                </div>
              </div>
            )}
          </div>
          
          {/* Input Area */}
          <form onSubmit={handleSubmit} className="p-3 bg-[#121214] border-t border-[#00f0ff]/20 flex items-center gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Query system data..."
              className="flex-1 bg-black/50 border border-white/10 text-white px-4 py-2.5 rounded-lg font-sans text-sm outline-none focus:border-[#00f0ff]/50 transition-colors"
              disabled={loading}
            />
            <button 
              type="submit" 
              disabled={loading || !input.trim()}
              className="p-2.5 bg-[#00f0ff]/10 hover:bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/30 rounded-lg disabled:opacity-50 transition-colors"
            >
              <Send size={16} />
            </button>
          </form>

        </div>
      )}

      {/* Floating Action Button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-14 h-14 rounded-full bg-[#00f0ff] text-black flex items-center justify-center shadow-[0_0_20px_rgba(0,240,255,0.4)] hover:scale-105 hover:shadow-[0_0_30px_rgba(0,240,255,0.6)] transition-all ml-auto"
        aria-label="Toggle Assistant"
      >
        {open ? <X size={24} /> : <Wand2 size={24} />}
      </button>
    </div>
  )
}
import { useEffect, useState, useRef } from 'react'
import { Sparkles, Send, List, BookOpen, Terminal, User, Cpu, Loader2 } from 'lucide-react'
import {
  getProjects,
  getProjectContext,
  getProjectEmails,
  getProjectDocuments,
  deleteProject,
} from '../services/api'

// Refined Bubbles for a more "Pro" feel
function BotBubble({ text }) {
  return (
    <div className="flex gap-3 max-w-[85%] mb-4 group">
      <div className="w-8 h-8 rounded-sm bg-brand-blue/10 border border-brand-blue/30 flex items-center justify-center shrink-0">
        <Cpu size={16} className="text-brand-blue" />
      </div>
      <div className="space-y-1">
        <div className="font-space text-[9px] uppercase tracking-widest text-brand-muted">AI Agent</div>
        <div className="rounded-sm bg-[#0a0a0a] border border-brand-border p-3 text-[13px] text-brand-text leading-relaxed whitespace-pre-wrap shadow-sm group-hover:border-brand-blue/30 transition-colors">
          {text}
        </div>
      </div>
    </div>
  )
}

function UserBubble({ text }) {
  return (
    <div className="flex gap-3 max-w-[85%] mb-4 ml-auto flex-row-reverse group">
      <div className="w-8 h-8 rounded-sm bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
        <User size={16} className="text-white" />
      </div>
      <div className="space-y-1 text-right">
        <div className="font-space text-[9px] uppercase tracking-widest text-brand-muted">Operator</div>
        <div className="rounded-sm bg-brand-blue text-black p-3 text-[13px] leading-relaxed font-dm shadow-lg">
          {text}
        </div>
      </div>
    </div>
  )
}

const SYSTEM_PROMPT = `You are an AI intent router. Given a user request about projects, output ONLY JSON: {"action": "list"|"context"|"delete", "project": "name or empty"}. If delete intent, include project name. If context intent, include project name. If list intent, project can be empty. Never add extra text.`

export default function Assistant() {
  const [messages, setMessages] = useState([
    { role: 'bot', text: 'Console initialized. Command me to list projects, analyze context, or remove workspaces.' }
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

  const deterministicIntent = (text) => {
    const lc = text.toLowerCase()
    if (['list projects', 'projects', 'show projects', 'ls'].includes(lc)) return { action: 'list', project: '' }
    if (lc.includes('context') || lc.includes('show project')) {
      return { action: 'context', project: text.replace(/show context for|context for|show project|context/i, '').trim() }
    }
    if (lc.includes('delete') || lc.includes('remove')) {
      return { action: 'delete', project: text.replace(/delete project|remove project|delete|remove/i, '').trim() }
    }
    return null
  }

  const callGroq = async (userText) => {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY
    if (!apiKey) throw new Error('Missing VITE_GROQ_API_KEY in frontend env')
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.1-70b-versatile',
        temperature: 0,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userText }],
      })
    })
    if (!res.ok) throw new Error(`Groq error ${res.status}`)
    const data = await res.json()
    return JSON.parse(data?.choices?.[0]?.message?.content || '{}')
  }

  const runIntent = async (intent) => {
    const action = intent?.action
    const projectName = intent?.project?.trim() || ''

    if (action === 'list') {
      if (!projects.length) { push('bot', 'Scanning... No active projects found.'); return }
      push('bot', 'System Projects:\n' + projects.map(p => `• ${p.name || 'Unnamed'}`).join('\n'))
      return
    }

    if (action === 'context') {
      if (!projectName) { push('bot', 'Action required: Please specify project name.'); return }
      const proj = findProject(projectName)
      if (!proj) { push('bot', `Error: Workspace "${projectName}" not recognized.`); return }
      setBusy(true)
      try {
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
      } catch {
        push('bot', 'Critical: Failed to resolve context data.')
      } finally { setBusy(false) }
      return
    }

    if (action === 'delete') {
      if (!projectName) { push('bot', 'Action required: Name the target for deletion.'); return }
      const proj = findProject(projectName)
      if (!proj) { push('bot', `Error: Project "${projectName}" not found.`); return }
      setBusy(true)
      try {
        await deleteProject(proj.id)
        push('bot', `Success: Project "${proj.name}" has been purged.`)
        refreshProjects()
      } catch { push('bot', 'Error: purge sequence failed.') }
      finally { setBusy(false) }
      return
    }

    push('bot', 'Instruction unclear. Use keywords: LIST, CONTEXT <name>, or DELETE <name>.')
  }

  const handleCommand = async (raw) => {
    const text = raw.trim()
    if (!text || busy) return
    push('user', text)
    setInput('')
    setBusy(true)
    try {
      let intent = deterministicIntent(text)
      if (!intent) {
        try { intent = await callGroq(text) } 
        catch (e) { intent = deterministicIntent(text) }
      }
      await runIntent(intent || { action: 'list', project: '' })
    } finally { setBusy(false) }
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="mb-8 mt-6">
        <div className="htag mb-4 font-space text-[11px] uppercase tracking-widest text-brand-muted flex items-center gap-2">
          <Terminal size={12} className="text-brand-blue" />
          Command Center / Agent v1.0
        </div>
        <h1 className="font-bebas text-[clamp(40px,7vw,86px)] leading-[0.9] uppercase text-brand-text flex items-center gap-4">
          <Sparkles className="text-brand-blue" size={48} />
          AI Ops Chat
        </h1>
      </div>

      <div className="grid md:grid-cols-[1fr,300px] gap-6 items-start">
        {/* Main Chat Interface */}
        <div className="border border-brand-border rounded-sm overflow-hidden bg-[#050505] flex flex-col shadow-2xl">
          <div className="bg-[#0a0a0a] border-b border-brand-border px-4 py-2 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500/40" />
            <div className="w-2 h-2 rounded-full bg-brand-yellow/40" />
            <div className="w-2 h-2 rounded-full bg-brand-blue/40" />
            <span className="ml-2 font-space text-[9px] uppercase tracking-widest text-brand-muted/70 italic">active_session:operator_01</span>
          </div>

          {/* Message Area */}
          <div 
            ref={scrollRef}
            className="h-[500px] overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-brand-border scroll-smooth"
          >
            {messages.map((m, i) => (
              <div key={i}>
                {m.role === 'user' ? <UserBubble text={m.text} /> : <BotBubble text={m.text} />}
              </div>
            ))}
            {busy && (
              <div className="flex gap-3 animate-pulse">
                <div className="w-8 h-8 rounded-sm bg-brand-blue/5 border border-brand-blue/20 flex items-center justify-center shrink-0">
                  <Loader2 size={16} className="text-brand-blue animate-spin" />
                </div>
                <div className="space-y-1">
                  <div className="font-space text-[9px] uppercase tracking-widest text-brand-muted">Thinking</div>
                  <div className="bg-[#0a0a0a] border border-brand-border/50 p-3 rounded-sm h-10 w-24" />
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
              placeholder="Enter command (e.g. 'purge project Apollo')..."
              className="flex-1 bg-brand-input border border-brand-border text-brand-text px-4 py-3 rounded-sm font-dm text-[14px] outline-none focus:border-brand-blue transition-all"
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
          <div className="border border-brand-border rounded-sm p-5 bg-[#050505]">
            <div className="font-space text-[10px] uppercase tracking-[0.2em] text-brand-blue mb-4">Quick Directives</div>
            <div className="space-y-2">
              <button 
                onClick={() => handleCommand('list projects')} 
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-sm border border-brand-border text-brand-muted hover:text-white hover:border-brand-blue/50 transition-all font-space text-[10px] uppercase tracking-widest group bg-[#0a0a0a]"
              >
                <div className="flex items-center gap-2">
                  <List size={14} className="text-brand-blue" /> List Projects
                </div>
              </button>
              
              <button 
                onClick={() => handleCommand('context for ' + (projects[0]?.name || ''))}
                disabled={!projects.length}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-sm border border-brand-border text-brand-muted hover:text-white hover:border-brand-blue/50 transition-all font-space text-[10px] uppercase tracking-widest group bg-[#0a0a0a] disabled:opacity-30"
              >
                <div className="flex items-center gap-2 text-left">
                  <BookOpen size={14} className="text-brand-yellow" /> Analyze Top Project
                </div>
              </button>
            </div>
          </div>

          <div className="border border-brand-border rounded-sm p-5 bg-[#050505]">
            <div className="font-space text-[10px] uppercase tracking-[0.2em] text-brand-muted mb-3">Syntax Examples</div>
            <div className="space-y-3 font-dm text-[12px] text-brand-muted/80 italic leading-relaxed">
              <div className="p-2 bg-white/5 border-l-2 border-brand-blue">"Show me everything about the Apollo workspace"</div>
              <div className="p-2 bg-white/5 border-l-2 border-brand-yellow">"What's the status of project X?"</div>
              <div className="p-2 bg-white/5 border-l-2 border-red-500/50">"Delete the obsolete internal project"</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
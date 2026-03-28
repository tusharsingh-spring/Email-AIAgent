import { useEffect, useState } from 'react'
import { Sparkles, Send, Trash2, FolderKanban, List, BookOpen } from 'lucide-react'
import {
  getProjects,
  getProjectContext,
  getProjectEmails,
  getProjectDocuments,
  deleteProject,
} from '../services/api'

const SYSTEM_PROMPT = `You are an AI intent router. Given a user request about projects, output ONLY JSON: {"action": "list"|"context"|"delete", "project": "name or empty"}. If delete intent, include project name. If context intent, include project name. If list intent, project can be empty. Never add extra text.`

function BotBubble({ text }) {
  return (
    <div className="rounded-sm bg-brand-panel border border-brand-border p-3 text-[13px] text-brand-text leading-relaxed">
      {text}
    </div>
  )
}

function UserBubble({ text }) {
  return (
    <div className="rounded-sm bg-brand-blue text-black p-3 text-[13px] leading-relaxed">
      {text}
    </div>
  )
}

export default function Assistant() {
  const [messages, setMessages] = useState([
    { role: 'bot', text: 'Hi! Ask me to list projects, show context for a project, or delete a project.' }
  ])
  const [input, setInput] = useState('')
  const [projects, setProjects] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    refreshProjects()
  }, [])

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
    return projects.find(p => (p.name || '').toLowerCase() === name.toLowerCase())
      || projects.find(p => (p.name || '').toLowerCase().includes(name.toLowerCase()))
  }

  const deterministicIntent = (text) => {
    const lc = text.toLowerCase()
    if (lc === 'list projects' || lc === 'projects' || lc === 'show projects') return { action: 'list', project: '' }
    if (lc.startsWith('show context for') || lc.startsWith('context for') || lc.startsWith('show project')) {
      return { action: 'context', project: text.replace(/show context for|context for|show project/i, '').trim() }
    }
    if (lc.startsWith('delete project') || lc.startsWith('remove project')) {
      return { action: 'delete', project: text.replace(/delete project|remove project/i, '').trim() }
    }
    return null
  }

  const callGroq = async (userText) => {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY
    if (!apiKey) throw new Error('Missing VITE_GROQ_API_KEY in frontend env')
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-70b-versatile',
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userText }
        ],
      })
    })
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Groq error ${res.status}: ${errText.slice(0, 180)}`)
    }
    const data = await res.json()
    const raw = data?.choices?.[0]?.message?.content || '{}'
    try { return JSON.parse(raw) } catch { throw new Error('Groq returned non-JSON content') }
  }

  const runIntent = async (intent) => {
    const action = intent?.action
    const projectName = intent?.project?.trim() || ''

    if (action === 'list') {
      if (!projects.length) { push('bot', 'No projects found.'); return }
      push('bot', 'Projects:\n- ' + projects.map(p => p.name || 'Unnamed').join('\n- '))
      return
    }

    if (action === 'context') {
      if (!projectName) { push('bot', 'Which project?'); return }
      const proj = findProject(projectName)
      if (!proj) { push('bot', `Could not find project matching "${projectName}".`); return }
      setBusy(true)
      try {
        const [ctx, emailsRes, docsRes] = await Promise.all([
          getProjectContext(proj.id).catch(() => ({})),
          getProjectEmails(proj.id).catch(() => ({ emails: [] })),
          getProjectDocuments(proj.id).catch(() => ({ documents: [] })),
        ])
        const emails = emailsRes.emails || []
        const docs = docsRes.documents || []
        const ctxText = ctx.context || ctx.full_text || '(no aggregated context)'
        const summary = [
          `Workspace: ${proj.name || 'Untitled'}`,
          `Emails: ${emails.length}, Documents: ${docs.length}`,
          '',
          'Context preview:',
          ctxText.slice(0, 800) + (ctxText.length > 800 ? ' …' : ''),
        ].join('\n')
        push('bot', summary)
      } catch {
        push('bot', 'Failed to fetch context.')
      }
      setBusy(false)
      return
    }

    if (action === 'delete') {
      if (!projectName) { push('bot', 'Name the project to delete.'); return }
      const proj = findProject(projectName)
      if (!proj) { push('bot', `No project found for "${projectName}".`); return }
      setBusy(true)
      try {
        await deleteProject(proj.id)
        push('bot', `Deleted project "${proj.name}".`)
        refreshProjects()
      } catch {
        push('bot', 'Delete failed.')
      }
      setBusy(false)
      return
    }

    push('bot', 'I can: list projects, show context for <project>, or delete project <name>.')
  }

  const handleCommand = async (raw) => {
    const text = raw.trim()
    if (!text) return
    push('user', text)
    setInput('')
    setBusy(true)
    try {
      const deterministic = deterministicIntent(text)
      let intent = deterministic
      if (!intent) {
        try {
          intent = await callGroq(text)
        } catch (e) {
          push('bot', `Groq intent failed: ${(e && e.message) || 'unknown error'}. Falling back to local rules.`)
          intent = deterministicIntent(text) || { action: 'list', project: '' }
        }
      }
      await runIntent(intent || { action: 'list', project: '' })
    } finally {
      setBusy(false)
    }
  }

  const onSubmit = (e) => {
    e.preventDefault()
    handleCommand(input)
  }

  return (
    <div className="pb-20">
      <div className="mb-8 mt-6 flex items-center gap-3">
        <Sparkles className="text-brand-blue" />
        <div>
          <div className="htag mb-1">Assistant / Command Agent</div>
          <h1 className="font-bebas text-[clamp(36px,6vw,72px)] leading-[0.9] uppercase">AI Ops Chat</h1>
        </div>
      </div>

      <div className="grid md:grid-cols-[2fr,1fr] gap-6">
        <div className="border border-brand-border rounded-sm p-4 flex flex-col gap-3" style={{ background: '#050505' }}>
          <div className="font-space text-[9px] uppercase tracking-widest text-brand-muted">Messages</div>
          <div className="flex-1 min-h-[320px] max-h-[520px] overflow-y-auto space-y-3 pr-1">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                {m.role === 'user' ? <UserBubble text={m.text} /> : <BotBubble text={m.text} />}
              </div>
            ))}
          </div>
          <form onSubmit={onSubmit} className="flex items-center gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="e.g., show context for Apollo project"
              className="flex-1 bg-brand-input border border-brand-border text-brand-text px-3 py-2 rounded-sm font-dm text-[13px] outline-none focus:border-brand-blue"
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()}
              className="px-3 py-2 bg-brand-blue text-black rounded-sm font-space text-[10px] uppercase tracking-widest flex items-center gap-2 disabled:opacity-60">
              <Send size={14} />
            </button>
          </form>
        </div>

        <div className="border border-brand-border rounded-sm p-4 space-y-3" style={{ background: '#050505' }}>
          <div className="font-space text-[9px] uppercase tracking-widest text-brand-muted">Quick actions</div>
          <button onClick={() => handleCommand('list projects')} className="w-full flex items-center gap-2 px-3 py-2 rounded-sm border border-brand-border text-brand-muted hover:text-white hover:border-brand-blue/40 transition-colors font-space text-[10px] uppercase tracking-widest">
            <List size={12} /> List projects
          </button>
          <button onClick={() => handleCommand('show context for ' + (projects[0]?.name || ''))}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-sm border border-brand-border text-brand-muted hover:text-white hover:border-brand-blue/40 transition-colors font-space text-[10px] uppercase tracking-widest" disabled={!projects.length}>
            <BookOpen size={12} /> Context for first project
          </button>
          <div className="text-[12px] text-brand-muted leading-relaxed">
            Examples:
            <div>• show context for Apollo project</div>
            <div>• delete project Apollo</div>
            <div>• list projects</div>
          </div>
        </div>
      </div>
    </div>
  )
}

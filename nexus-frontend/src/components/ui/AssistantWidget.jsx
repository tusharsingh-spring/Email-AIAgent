import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, X, Trash2, Wand2 } from 'lucide-react'
import {
  getProjects,
  getProjectContext,
  getProjectEmails,
  getProjectDocuments,
  deleteProject,
} from '../../services/api'

const SYSTEM_PROMPT = `You are an AI intent router. Given a user request about projects, output ONLY JSON: {"action": "list"|"context"|"delete", "project": "name or empty"}. If delete intent, include project name. If context intent, include project name. If list intent, project can be empty. Never add extra text.`

export default function AssistantWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([{ role: 'bot', text: 'Ask me to list projects, show context, or delete a project.' }])
  const [loading, setLoading] = useState(false)
  const [projects, setProjects] = useState([])
  const listRef = useRef(null)

  useEffect(() => {
    getProjects().then(d => setProjects(d.projects || [])).catch(() => setProjects([]))
  }, [])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  const push = (role, text) => setMessages(m => [...m, { role, text }])

  const findProject = (name) => {
    if (!name) return null
    return projects.find(p => (p.name || '').toLowerCase() === name.toLowerCase())
      || projects.find(p => (p.name || '').toLowerCase().includes(name.toLowerCase()))
  }

  const runIntent = async (intent) => {
    const action = intent.action
    const projectName = intent.project?.trim() || ''

    if (action === 'list') {
      if (!projects.length) { push('bot', 'No projects found.'); return }
      push('bot', 'Projects:\n- ' + projects.map(p => p.name || 'Unnamed').join('\n- '))
      return
    }

    if (action === 'context') {
      if (!projectName) { push('bot', 'Which project?'); return }
      const proj = findProject(projectName)
      if (!proj) { push('bot', `Could not find project matching "${projectName}".`); return }
      setLoading(true)
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
          ctxText.slice(0, 900) + (ctxText.length > 900 ? ' …' : ''),
        ].join('\n')
        push('bot', summary)
      } catch {
        push('bot', 'Failed to fetch context.')
      }
      setLoading(false)
      return
    }

    if (action === 'delete') {
      if (!projectName) { push('bot', 'Name the project to delete.'); return }
      const proj = findProject(projectName)
      if (!proj) { push('bot', `No project found for "${projectName}".`); return }
      setLoading(true)
      try {
        await deleteProject(proj.id)
        push('bot', `Deleted project "${proj.name}".`)
        const d = await getProjects()
        setProjects(d.projects || [])
      } catch {
        push('bot', 'Delete failed.')
      }
      setLoading(false)
      return
    }

    push('bot', 'I can list projects, show context, or delete projects.')
  }

  const callGroq = async (userText) => {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY
    if (!apiKey) {
      throw new Error('Missing VITE_GROQ_API_KEY in frontend env')
    }
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    push('user', text)
    setInput('')
    setLoading(true)
    try {
      const intent = await callGroq(text)
      await runIntent(intent || { action: 'list', project: '' })
    } catch (e) {
      push('bot', `Intent failed: ${(e && e.message) || 'unknown error'}`)
    }
    setLoading(false)
  }

  return (
    <div className="fixed bottom-4 right-4 z-[6000]">
      {open && (
        <div className="w-[340px] h-[440px] bg-brand-panel border border-brand-border rounded-sm shadow-2xl flex flex-col mb-3" style={{ backdropFilter: 'blur(6px)' }}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-brand-border">
            <div className="flex items-center gap-2 font-space text-[10px] uppercase tracking-widest text-brand-muted">
              <Wand2 size={14} className="text-brand-blue" /> AI Ops Agent
            </div>
            <button onClick={() => setOpen(false)} className="p-1 text-brand-muted hover:text-white">
              <X size={14} />
            </button>
          </div>
          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                {m.role === 'user' ? (
                  <div className="max-w-[80%] bg-brand-blue text-black px-3 py-2 rounded-sm text-[12px] leading-relaxed">{m.text}</div>
                ) : (
                  <div className="max-w-[80%] bg-brand-input border border-brand-border px-3 py-2 rounded-sm text-[12px] leading-relaxed text-brand-text whitespace-pre-line">{m.text}</div>
                )}
              </div>
            ))}
          </div>
          <form onSubmit={handleSubmit} className="p-3 border-t border-brand-border flex items-center gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask me to show context..."
              className="flex-1 bg-brand-input border border-brand-border text-brand-text px-3 py-2 rounded-sm text-[12px] outline-none focus:border-brand-blue"
              disabled={loading}
            />
            <button type="submit" disabled={loading || !input.trim()}
              className="p-2 bg-brand-blue text-black rounded-sm disabled:opacity-60">
              <Send size={14} />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        className="w-12 h-12 rounded-full bg-brand-blue text-black flex items-center justify-center shadow-lg hover:scale-[1.05] transition-transform"
        aria-label="Open assistant"
      >
        {open ? <X size={18} /> : <MessageCircle size={18} />}
      </button>
    </div>
  )
}

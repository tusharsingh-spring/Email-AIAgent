import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, LayoutDashboard, FolderKanban, Settings2,
  Activity, AlertTriangle, BarChart2, Inbox, FileText,
  FolderPlus, RefreshCw, Network, X, Folder, ArrowRight
} from 'lucide-react'
import { scanIngest, forceRecluster, getProjects, createProject } from '../../services/api'
import { useApp } from '../../context/AppContext'

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [recentProjects, setRecentProjects] = useState([])
  const [creatingProject, setCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const inputRef = useRef(null)
  const newProjRef = useRef(null)
  const navigate = useNavigate()
  const { toast = () => {} } = useApp() || {}

  /* ─── Open/close via global event or Cmd+K ─── */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    const onEvent = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('nexus:openPalette', onEvent)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('nexus:openPalette', onEvent)
    }
  }, [])

  /* ─── Focus input when opened ─── */
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      getProjects().then(d => setRecentProjects((d.projects || []).slice(0, 3))).catch(() => {})
      setQuery('')
      setActiveIdx(0)
      setCreatingProject(false)
      setNewProjectName('')
    }
  }, [open])

  useEffect(() => {
    if (creatingProject) setTimeout(() => newProjRef.current?.focus(), 50)
  }, [creatingProject])

  /* ─── Build items ─── */
  const STATIC_ITEMS = [
    {
      group: 'Quick Actions',
      items: [
        { label: 'New Project', icon: FolderPlus, shortcut: '', action: () => setCreatingProject(true) },
        { label: 'Force Ingest Sync', icon: RefreshCw, shortcut: '', action: async () => {
          await scanIngest().catch(() => {}); toast('Ingest triggered', 'ok'); setOpen(false)
        }},
        { label: 'Force Re-Cluster', icon: Network, shortcut: '', action: async () => {
          await forceRecluster(10).catch(() => {}); toast('Clustering executed', 'ok'); setOpen(false)
        }},
      ]
    },
    {
      group: 'Navigate',
      items: [
        { label: 'Command Center', icon: LayoutDashboard, shortcut: 'G H', action: () => { navigate('/'); setOpen(false) } },
        { label: 'Project Studio',  icon: FolderKanban,   shortcut: 'G P', action: () => { navigate('/projects'); setOpen(false) } },
        { label: 'Actions',         icon: Activity,       shortcut: 'G A', action: () => { navigate('/actions'); setOpen(false) } },
        { label: 'Escalations',     icon: AlertTriangle,  shortcut: 'G E', action: () => { navigate('/escalations'); setOpen(false) } },
        { label: 'Metrics',         icon: BarChart2,      shortcut: 'G M', action: () => { navigate('/metrics'); setOpen(false) } },
        { label: 'Inbox',           icon: Inbox,          shortcut: 'G I', action: () => { navigate('/inbox'); setOpen(false) } },
        { label: 'BRDs',            icon: FileText,       shortcut: 'G B', action: () => { navigate('/brds'); setOpen(false) } },
        { label: 'Agent Directives',icon: Settings2,      shortcut: 'G S', action: () => { navigate('/settings'); setOpen(false) } },
      ]
    },
  ]

  const projectItems = recentProjects.map(p => ({
    group: 'Recent Projects',
    label: p.name || 'Unnamed Project',
    icon: Folder,
    shortcut: '',
    action: () => { navigate('/projects'); setOpen(false) }
  }))

  /* Flatten for keyboard navigation */
  const flatItems = [
    ...STATIC_ITEMS.flatMap(g => g.items),
    ...projectItems,
  ]

  /* Filter by query */
  const filtered = query.trim()
    ? flatItems.filter(i => i.label.toLowerCase().includes(query.toLowerCase()))
    : flatItems

  /* Keyboard navigation */
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' && !creatingProject) {
        e.preventDefault()
        filtered[activeIdx]?.action()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, activeIdx, filtered, creatingProject])

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return
    try {
      await createProject(newProjectName.trim(), 'Created via Command Palette')
      toast(`Project "${newProjectName.trim()}" created`, 'ok')
      navigate('/projects')
      setOpen(false)
    } catch { toast('Creation failed', 'err') }
  }

  /* Group filtered items for rendering */
  const groupedFiltered = query.trim()
    ? [{ group: 'Results', items: filtered }]
    : [
        ...STATIC_ITEMS.map(g => ({ group: g.group, items: g.items })),
        ...(projectItems.length > 0 ? [{ group: 'Recent Projects', items: projectItems }] : [])
      ]

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[18vh]"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(12px)' }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-[580px] mx-4 rounded-[12px] overflow-hidden"
        style={{
          background: '#070707',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 50px 100px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.04)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ─── Search bar ─── */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-brand-border">
          <Search size={16} style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
          {creatingProject ? (
            <input
              ref={newProjRef}
              type="text"
              placeholder="Project name..."
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateProject()
                if (e.key === 'Escape') { setCreatingProject(false); setNewProjectName('') }
              }}
              className="flex-1 bg-transparent outline-none font-dm text-[16px] text-white placeholder:text-white/20"
            />
          ) : (
            <input
              ref={inputRef}
              type="text"
              placeholder="Type a command or search..."
              value={query}
              onChange={e => { setQuery(e.target.value); setActiveIdx(0) }}
              className="flex-1 bg-transparent outline-none font-dm text-[16px] text-white placeholder:text-white/20"
            />
          )}
          <span className="font-space text-[9px] text-white/20 shrink-0 border border-white/10 px-1.5 py-0.5 rounded-sm">ESC</span>
          <button onClick={() => setOpen(false)} className="text-white/20 hover:text-white/60 transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* ─── New project inline form ─── */}
        {creatingProject && (
          <div className="px-4 py-3 border-b border-brand-border flex items-center gap-3">
            <span className="font-space text-[10px] uppercase tracking-widest text-brand-blue">New Project</span>
            <div className="flex-1" />
            <button
              onClick={handleCreateProject}
              className="flex items-center gap-1.5 bg-brand-blue text-black px-4 py-1.5 rounded-sm font-space text-[10px] uppercase tracking-widest font-bold hover:bg-white transition-colors"
            >
              Create <ArrowRight size={12} />
            </button>
            <button
              onClick={() => { setCreatingProject(false); setNewProjectName('') }}
              className="font-space text-[10px] uppercase tracking-widest text-brand-muted hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ─── Items ─── */}
        <div className="max-h-[380px] overflow-y-auto py-2">
          {(() => {
            let globalIdx = 0
            return groupedFiltered.map(({ group, items }) => {
              if (!items.length) return null
              return (
                <div key={group}>
                  <div className="px-4 py-2 font-space text-[9px] uppercase tracking-[0.2em] text-white/20">
                    {group}
                  </div>
                  {items.map((item) => {
                    const idx = globalIdx++
                    const isActive = activeIdx === idx
                    return (
                      <button
                        key={item.label + idx}
                        onClick={item.action}
                        onMouseEnter={() => setActiveIdx(idx)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left"
                        style={{ background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent' }}
                      >
                        <item.icon
                          size={15}
                          className="shrink-0"
                          style={{ color: isActive ? 'var(--color-brand-blue)' : 'rgba(255,255,255,0.3)' }}
                        />
                        <span className="flex-1 font-dm text-[13px]"
                          style={{ color: isActive ? '#fff' : 'rgba(255,255,255,0.65)' }}>
                          {item.label}
                        </span>
                        {item.shortcut && (
                          <span className="font-space text-[9px] text-white/20 shrink-0">{item.shortcut}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })
          })()}
          {filtered.length === 0 && (
            <div className="py-10 text-center font-space text-[10px] uppercase tracking-widest text-white/20">
              No results for "{query}"
            </div>
          )}
        </div>

        {/* ─── Footer ─── */}
        <div className="px-4 py-2.5 border-t border-brand-border flex items-center gap-4">
          <span className="font-space text-[9px] text-white/20">↑↓ navigate</span>
          <span className="font-space text-[9px] text-white/20">↵ select</span>
          <span className="font-space text-[9px] text-white/20">esc close</span>
        </div>
      </div>
    </div>
  )
}

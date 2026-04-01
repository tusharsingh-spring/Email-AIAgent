import { NavLink, useLocation } from 'react-router-dom'
import { 
  LayoutDashboard, FolderKanban, Settings2, Activity, 
  AlertTriangle, BarChart2, Inbox, FileText, Command, 
  X, Upload, CalendarRange, Map, Bot, Brain 
} from 'lucide-react'
import { useApp } from '../../context/AppContext'

const NAV_GROUPS = [
  {
    label: 'Core',
    items: [
      { name: 'Command Center', path: '/', icon: LayoutDashboard },
    ]
  },
  {
    label: 'Workflow',
    items: [
      { name: 'Inbox', path: '/inbox', icon: Inbox },
      { name: 'Actions', path: '/actions', icon: Activity },
      { name: 'BRDs', path: '/brds', icon: FileText },
      { name: 'Calendar', path: '/calendar', icon: CalendarRange },
    ]
  },
  {
    label: 'Operations',
    items: [
      { name: 'Escalations', path: '/escalations', icon: AlertTriangle },
      { name: 'Project Map', path: '/map', icon: Map },
      { name: 'Project Studio', path: '/projects', icon: FolderKanban },
      { name: 'Upload Resources', path: '/upload', icon: Upload },
    ]
  },
  {
    label: 'Intelligence',
    items: [
      { name: 'Metrics', path: '/metrics', icon: BarChart2 },
      { name: 'Bandit Lab', path: '/bandit', icon: Brain },
      { name: 'Assistant', path: '/assistant', icon: Bot },
    ]
  },
  {
    label: 'System',
    items: [
      { name: 'Agent Directives', path: '/settings', icon: Settings2 },
    ]
  },
]

export default function Sidebar({ mobileOpen, onClose }) {
  const { state } = useApp()
  const location = useLocation()
  const email = state?.ownerEmail || ''

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[4998] lg:hidden" onClick={onClose} />
      )}

      <div
        className={`fixed top-0 left-0 w-[260px] h-screen border-r border-brand-border z-[5000] flex flex-col overflow-hidden transition-transform duration-300
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0`}
        style={{ background: '#050505' }}
      >
        {/* Brand Section */}
        <div className="px-7 pt-7 pb-4 border-b border-brand-border relative z-10">
          <div className="flex items-center gap-2">
            <div className="font-bebas text-5xl tracking-widest text-brand-text leading-none">
              Codeapex<span className="text-brand-blue">.</span>
            </div>
            <div className="pulse-dot w-2 h-2 rounded-full bg-brand-blue mt-1 shrink-0" style={{ boxShadow: '0 0 6px rgba(0,181,226,0.8)' }} />
          </div>
          <div className="font-space text-[9px] uppercase tracking-[0.22em] text-brand-muted mt-1.5 opacity-60">
            AI Agent Platform
          </div>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto relative z-10 pt-4 pb-2 custom-scrollbar">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-3"> {/* Tightened group spacing */}
              <div className="px-6 mb-1 text-[9px] font-space uppercase tracking-[0.25em] text-brand-muted/30">
                {group.label}
              </div>
              <div className="space-y-0.5"> {/* Minimal gap between individual links */}
                {group.items.map((item) => {
                  const isActive = item.path === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(item.path)
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={onClose}
                      className={`flex items-center gap-3.5 px-4 py-2 mx-2 rounded-sm transition-all duration-150 font-dm text-[13px] relative group
                        ${isActive ? 'text-white bg-white/5' : 'text-brand-muted hover:text-white hover:bg-white/[0.02]'}`}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-brand-blue shadow-[0_0_8px_rgba(0,181,226,0.6)]" />
                      )}
                      <item.icon size={15} className={`shrink-0 ${isActive ? 'text-brand-blue' : 'text-inherit opacity-60 group-hover:opacity-100'}`} />
                      <span className={`tracking-wide ${isActive ? 'font-semibold' : 'font-medium'}`}>
                        {item.name}
                      </span>
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Command Palette - Now tucked closely beneath the nav groups */}
          <div className="mx-4 mt-2">
            <button
              onClick={() => { window.dispatchEvent(new CustomEvent('nexus:openPalette')); onClose?.() }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-sm border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-blue/30 transition-all group bg-[#0a0a0a]/50"
            >
              <div className="flex items-center gap-2 font-space text-[10px] uppercase tracking-widest">
                <Command size={12} className="group-hover:text-brand-blue transition-colors" />
                Command Palette
              </div>
              <span className="font-space text-[9px] text-brand-muted/40 border border-brand-border/50 px-1.5 py-0.5 rounded-sm bg-black">⌘K</span>
            </button>
          </div>
        </div>

        {/* Status Footer */}
        <div className="p-4 border-t border-brand-border bg-[#080808] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#00ff9d] shadow-[0_0_8px_rgba(0,255,157,0.5)]" />
            <div className="min-w-0">
              <div className="font-space text-[9px] uppercase text-[#00ff9d]/80 leading-none tracking-wider">Node Online</div>
              {email && (
                <div className="font-space text-[8px] text-brand-muted truncate mt-1 opacity-50 lowercase">{email}</div>
              )}
            </div>
          </div>
          <div className="shrink-0 w-8 h-1 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full bg-brand-blue w-1/3 animate-pulse" />
          </div>
        </div>
      </div>
    </>
  )
}
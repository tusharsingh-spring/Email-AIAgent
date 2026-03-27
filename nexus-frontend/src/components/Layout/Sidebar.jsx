import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, FolderKanban, Settings2, Activity, AlertTriangle, BarChart2, Inbox, FileText, Command, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'

const NAV_GROUPS = [
  {
    label: 'Core',
    items: [
      { name: 'Command Center', path: '/', icon: LayoutDashboard },
      { name: 'Project Studio', path: '/projects', icon: FolderKanban },
    ]
  },
  {
    label: 'Review',
    items: [
      { name: 'Actions', path: '/actions', icon: Activity },
      { name: 'Escalations', path: '/escalations', icon: AlertTriangle },
    ]
  },
  {
    label: 'Intelligence',
    items: [
      { name: 'Metrics', path: '/metrics', icon: BarChart2 },
      { name: 'Inbox', path: '/inbox', icon: Inbox },
      { name: 'BRDs', path: '/brds', icon: FileText },
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
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[4998] lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <div
        className={`fixed top-0 left-0 w-[260px] h-screen border-r border-brand-border z-[5000] flex flex-col overflow-hidden transition-transform duration-300
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0`}
        style={{ background: '#050505' }}
      >
        {/* Ambient glow */}
        <div className="absolute top-0 left-0 w-48 h-48 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at top left, rgba(0,181,226,0.07) 0%, transparent 70%)' }} />

        {/* Brand */}
        <div className="px-7 pt-7 pb-5 border-b border-brand-border relative z-10 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="font-bebas text-5xl tracking-widest text-brand-text leading-none">
                NEXUS<span className="text-brand-blue">.</span>
              </div>
              <div className="pulse-dot w-2 h-2 rounded-full bg-brand-blue mt-1 shrink-0"
                style={{ boxShadow: '0 0 6px rgba(0,181,226,0.8)' }} />
            </div>
            <div className="font-space text-[9px] uppercase tracking-[0.22em] text-brand-muted mt-1.5">
              AI Agent Platform
            </div>
          </div>
          {/* Close button — mobile only */}
          <button onClick={onClose}
            className="lg:hidden p-1.5 text-brand-muted hover:text-white transition-colors rounded-sm hover:bg-brand-hover">
            <X size={16} />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto relative z-10 py-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.items.map((item) => {
                const isActive = item.path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.path)
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={onClose}
                    className={`flex items-center gap-3.5 px-4 py-2.5 mx-2 rounded-sm transition-all duration-200 font-dm text-[13px] relative group
                      ${isActive
                        ? 'text-white bg-[rgba(0,181,226,0.08)]'
                        : 'text-brand-muted hover:text-white hover:bg-[rgba(255,255,255,0.03)]'
                      }`}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-brand-blue"
                        style={{ boxShadow: '0 0 10px rgba(0,181,226,0.9)' }} />
                    )}
                    <item.icon
                      size={15}
                      className="shrink-0 transition-colors"
                      style={{ color: isActive ? 'var(--color-brand-blue)' : 'inherit' }}
                    />
                    <span className="font-medium">{item.name}</span>
                  </NavLink>
                )
              })}
            </div>
          ))}

          {/* Cmd+K button */}
          <div className="mx-4 mt-4 mb-2">
            <button
              onClick={() => { window.dispatchEvent(new CustomEvent('nexus:openPalette')); onClose?.() }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-sm border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-blue/30 transition-all group"
            >
              <div className="flex items-center gap-2 font-space text-[10px] uppercase tracking-widest">
                <Command size={12} className="group-hover:text-brand-blue transition-colors" />
                Command Palette
              </div>
              <span className="font-space text-[9px] text-brand-muted/50 border border-brand-border px-1.5 py-0.5 rounded-sm">⌘K</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-brand-border relative z-10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="shrink-0 w-2 h-2 rounded-full bg-[#00ff9d]"
              style={{ boxShadow: '0 0 8px rgba(0,255,157,0.8)' }} />
            <div className="min-w-0">
              <div className="font-space text-[10px] uppercase text-[#00ff9d] leading-none">Online</div>
              {email && (
                <div className="font-space text-[9px] text-brand-muted truncate mt-0.5 max-w-[140px]">{email}</div>
              )}
            </div>
          </div>
          <div className="shrink-0 w-2 h-2 rounded-full" style={{ background: 'rgba(0,181,226,0.25)' }} />
        </div>
      </div>
    </>
  )
}

import { NavLink } from 'react-router-dom'
import { LayoutDashboard, FolderKanban, Settings2, Sun, Moon } from 'lucide-react'
import { useApp } from '../../context/AppContext'

export default function Sidebar() {
  const { theme, toggleTheme } = useApp()
  const navItems = [
    { name: 'Command Center', path: '/', icon: LayoutDashboard },
    { name: 'Project Studio', path: '/projects', icon: FolderKanban },
    { name: 'Agent Directives', path: '/settings', icon: Settings2 },
  ]

  return (
    <div className="fixed top-0 left-0 w-[260px] h-screen border-r border-brand-border bg-brand-black/95 backdrop-blur-xl z-[5000] flex flex-col hidden lg:flex">
      
      {/* Brand Section */}
      <div className="p-8 border-b border-brand-border mb-4">
        <div className="font-bebas text-5xl tracking-widest text-brand-text leading-none">
          NEXUS<span className="text-brand-blue">.</span>
        </div>
        <div className="font-space text-[9px] uppercase tracking-[0.2em] text-brand-muted mt-2">
          AI Agent Platform
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 px-4 flex flex-col gap-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-4 px-4 py-3 rounded-sm transition-all duration-300 font-space text-[11px] uppercase tracking-widest relative group overflow-hidden
              ${isActive ? 'bg-brand-input text-brand-text font-bold' : 'text-brand-muted hover:text-brand-text hover:bg-brand-hover'}`
            }
          >
            {({ isActive }) => (
              <>
                {/* Neon Indicator */}
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-blue shadow-[0_0_12px_rgba(0,181,226,1)]"></div>
                )}
                
                <item.icon className="w-4 h-4 shrink-0 transition-colors" style={{ color: isActive ? 'var(--color-brand-blue)' : 'inherit' }} />
                <span>{item.name}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Footer / System Status */}
      <div className="p-6 border-t border-brand-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#00ff9d] shadow-[0_0_8px_rgba(0,255,157,0.8)]"></div>
          <div>
            <div className="font-space text-[10px] uppercase text-[#00ff9d]">Systems Online</div>
            <div className="font-space text-[9px] uppercase text-brand-muted opacity-60 mt-1">WS Connected</div>
          </div>
        </div>

        <button 
          onClick={toggleTheme} 
          className="p-2 text-brand-muted hover:text-brand-text transition-colors rounded-sm hover:bg-brand-hover cursor-pointer"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

    </div>
  )
}

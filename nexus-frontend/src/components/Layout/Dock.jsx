import { NavLink } from 'react-router-dom'
import { LayoutDashboard, FolderKanban, Settings2 } from 'lucide-react'

export default function Dock() {
  const navItems = [
    { name: 'Command Center', path: '/', icon: LayoutDashboard },
    { name: 'Project Studio', path: '/projects', icon: FolderKanban },
    { name: 'Rules & Settings', path: '/settings', icon: Settings2 },
  ]

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[5000]">
      <div className="flex items-center gap-2 p-2 rounded-full border border-white/10 bg-brand-black/80 backdrop-blur-xl shadow-2xl">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300 relative group
              ${isActive ? 'bg-white/10 text-brand-blue' : 'text-white/40 hover:text-white hover:bg-white/5'}`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                
                {/* Tooltip */}
                <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-sm bg-brand-black border border-white/10 font-space text-[10px] tracking-[0.1em] text-white opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none uppercase">
                  {item.name}
                </span>

                {/* Active Indicator Dot */}
                {isActive && (
                  <span className="absolute -bottom-1 w-1 h-1 rounded-full bg-brand-blue shadow-[0_0_8px_rgba(0,181,226,1)]"></span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  )
}

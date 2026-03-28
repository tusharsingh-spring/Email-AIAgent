import { 
  Inbox, 
  Zap, 
  FileText, 
  Calendar, 
  AlertTriangle, 
  Map, 
  Cpu, 
  CloudUpload,
  Terminal
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom' // Assuming you're using React Router

const NAV_ITEMS = [
  { label: 'Inbox', icon: Inbox, path: '/inbox', color: 'text-brand-blue' },
  { label: 'Actions', icon: Zap, path: '/actions', color: 'text-brand-yellow' },
  { label: 'BRDs', icon: FileText, path: '/brds', color: 'text-purple-400' },
  { label: 'Calendar', icon: Calendar, path: '/calendar', color: 'text-teal-400' },
  { label: 'Escalations', icon: AlertTriangle, path: '/escalations', color: 'text-red-500' },
  { label: 'Project Map', icon: Map, path: '/map', color: 'text-brand-blue' },
  { label: 'Project Studio', icon: Cpu, path: '/studio', color: 'text-brand-blue' },
  { label: 'Upload Resources', icon: CloudUpload, path: '/upload', color: 'text-brand-muted' },
]

export default function MainSidebar() {
  const location = useLocation()

  return (
    <div className="h-screen w-[240px] flex flex-col bg-[#050505] border-r border-brand-border shrink-0 sticky top-0">
      
      {/* BRAND / LOGO AREA */}
      <div className="p-6 mb-4">
        <div className="flex items-center gap-3 mb-2">
          <Terminal size={20} className="text-brand-blue" />
          <span className="font-bebas text-2xl tracking-wider text-white">NEXUS AI</span>
        </div>
        <div className="font-space text-[9px] uppercase tracking-[0.3em] text-brand-muted">
          Ops Management System
        </div>
      </div>

      {/* NAVIGATION LINKS */}
      <nav className="flex-1 px-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path
          const Icon = item.icon

          return (
            <Link
              key={item.label}
              to={item.path}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-sm transition-all group
                ${isActive 
                  ? 'bg-brand-blue/10 border-l-2 border-brand-blue' 
                  : 'hover:bg-white/5 border-l-2 border-transparent'
                }
              `}
            >
              <Icon 
                size={18} 
                className={`transition-colors ${isActive ? item.color : 'text-brand-muted group-hover:text-white'}`} 
              />
              <span className={`
                font-space text-[11px] uppercase tracking-widest transition-colors
                ${isActive ? 'text-white font-bold' : 'text-brand-muted group-hover:text-white'}
              `}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* FOOTER / SYSTEM STATUS */}
      <div className="p-6 border-t border-brand-border bg-[#0a0a0a]/50">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#00ff9d] animate-pulse" />
          <span className="font-space text-[9px] uppercase tracking-widest text-brand-muted">System Live</span>
        </div>
        <div className="font-dm text-[10px] text-brand-muted opacity-50">
          v2.4.0-stable
        </div>
      </div>
    </div>
  )
}
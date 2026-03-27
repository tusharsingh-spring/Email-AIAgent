import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useEffect, useState } from 'react'
import { getStats, getProjects } from '../../services/api'

const NAV = [
  { group: 'Overview' },
  { path: '/', label: 'Dashboard', ico: '⬡' },
  { group: 'Email Agent' },
  { path: '/inbox', label: 'Unassigned Inbox', ico: '✉', badge: 'inbox' },
  { path: '/actions', label: 'Actions', ico: '⚡', badge: 'actions', badgeCls: 'nb-a' },
  { path: '/escalations', label: 'Escalations', ico: '▲', badge: 'esc', badgeCls: 'nb-r' },
  { group: 'Project Management' },
  { path: '/projects', label: 'Projects', ico: '🗂', badge: 'projects', badgeCls: 'nb-g' },
  { path: '/upload', label: 'Upload Resources', ico: '⬆' },
  { group: 'Intelligence' },
  { path: '/metrics', label: 'Live Metrics', ico: '▣' },
  { group: 'Calendar' },
  { path: '/calendar', label: 'Events', ico: '▦' },
  { group: 'System' },
  { path: '/settings', label: 'Settings', ico: '◌' },
  { path: '/setup', label: 'Setup & Auth', ico: '◉' },
]

export default function Sidebar({ wsStatus }) {
  const { state } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [badges, setBadges] = useState({ inbox: 0, actions: 0, esc: 0, projects: 0 })

  useEffect(() => {
    const load = async () => {
      try {
        const [s, p] = await Promise.all([getStats(), getProjects()])
        setBadges({
          inbox: s.unassigned_emails || 0,
          actions: (s.pending || 0) + (s.pending_clusters || 0),
          esc: s.escalations || 0,
          projects: (p.projects || []).length,
        })
      } catch {}
    }
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [])

  const dotCls = wsStatus === 'connected' ? 'dot dot-g pulse' : wsStatus === 'error' ? 'dot dot-r' : 'dot dot-a pulse'
  const wsLabel = wsStatus === 'connected' ? 'Connected · LangGraph active' : wsStatus === 'error' ? 'Error — check backend' : 'Connecting...'

  return (
    <aside className="rail">
      <div className="brand">
        <div className="brand-inner">
          <div className="brand-mark">NX</div>
          <div>
            <div className="brand-name">NEXUS</div>
            <div className="brand-sub">langgraph · gmail · calendar</div>
          </div>
        </div>
      </div>

      {NAV.map((item, i) => {
        if (item.group) {
          return <div key={i} className="nav-grp">{item.group}</div>
        }
        const isActive = location.pathname === item.path ||
          (item.path !== '/' && location.pathname.startsWith(item.path))
        return (
          <div
            key={item.path}
            className={`nav-i${isActive ? ' on' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <span className="ico">{item.ico}</span>
            {item.label}
            {item.badge && (
              <span className={`nav-nb ${item.badgeCls || 'nb-a'}`}>
                {badges[item.badge] || 0}
              </span>
            )}
          </div>
        )
      })}

      <div className="rail-foot">
        <div className="status-row">
          <div className={dotCls} />
          <span>{wsLabel}</span>
        </div>
        <div style={{ fontSize: '9px', color: 'var(--tx3)', marginTop: '3px', fontFamily: "'DM Mono',monospace" }}>
          {state.ownerEmail || 'Not authenticated'}
        </div>
        <div style={{ fontSize: '9px', color: 'var(--tx3)', marginTop: '2px', fontFamily: "'DM Mono',monospace" }}>
          LangGraph + Groq Llama 3.1
        </div>
      </div>
    </aside>
  )
}

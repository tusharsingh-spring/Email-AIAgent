import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { getStats, getAuthStatus } from '../../services/api'
import { useEffect } from 'react'

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/inbox': 'Inbox',
  '/actions': 'Actions',
  '/escalations': 'Escalations',
  '/projects': 'Projects',
  '/upload': 'Upload Resources',
  '/metrics': 'Live Metrics',
  '/calendar': 'Calendar',
  '/settings': 'Settings',
  '/setup': 'Setup & Auth',
}

export default function Topbar({ onRefresh }) {
  const { state, dispatch } = useApp()
  const location = useLocation()

  const path = Object.keys(PAGE_TITLES).find(k =>
    k === '/' ? location.pathname === '/' : location.pathname.startsWith(k)
  ) || '/'
  const title = PAGE_TITLES[path] || 'NEXUS'

  useEffect(() => {
    getAuthStatus().then(d => {
      if (d.authenticated) dispatch({ type: 'SET_AUTH', authenticated: true, email: d.email })
    }).catch(() => {})
    // Check for ?auth=success redirect from Google OAuth
    if (new URLSearchParams(window.location.search).get('auth') === 'success') {
      window.history.replaceState({}, document.title, '/')
    }
  }, [])

  return (
    <header className="topbar">
      <div className="tb-title">{title}</div>
      <div className="tb-right">
        <div style={{ fontSize: '10px', color: 'var(--tx2)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div className="dot dot-g pulse" />polling every 30s
        </div>
        {state.authenticated ? (
          <span className="btn btn-grn btn-sm" style={{ pointerEvents: 'none' }}>✓ Connected</span>
        ) : (
          <a className="btn btn-g btn-sm" href="/auth/login" target="_blank">🔑 Connect Google</a>
        )}
        <button className="btn btn-a btn-sm" onClick={onRefresh}>↻</button>
      </div>
    </header>
  )
}

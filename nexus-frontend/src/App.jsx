import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { AppProvider } from './context/AppContext'
import WebSocketProvider from './context/WebSocketProvider'
import Sidebar from './components/Layout/Sidebar'
import Topbar from './components/Layout/Topbar'
import AuditSidebar from './components/Layout/AuditSidebar'
import AuthBanner from './components/Layout/AuthBanner'
import ToastContainer from './components/ui/ToastContainer'

import Dashboard from './pages/Dashboard'
import Inbox from './pages/Inbox'
import Actions from './pages/Actions'
import Escalations from './pages/Escalations'
import Projects from './pages/Projects'
import UploadResources from './pages/UploadResources'
import Metrics from './pages/Metrics'
import Calendar from './pages/Calendar'
import BRDs from './pages/BRDs'
import Settings from './pages/Settings'
import Setup from './pages/Setup'

import { getStats, getActions, getBRDList } from './services/api'
import { useApp } from './context/AppContext'

function LayoutShell() {
  const { dispatch } = useApp()
  const [wsStatus, setWsStatus] = useState('connecting')

  const refreshAll = () => {
    getStats().then(d => dispatch({ type: 'SET_STATS', stats: d })).catch(() => {})
    getActions().then(d => dispatch({ type: 'SET_ACTIONS', actions: d.actions || [] })).catch(() => {})
    getBRDList().then(d => {
      const brds = {}
      ;(d.brds || []).forEach(b => { brds[b.job_id] = { title: b.title, sections_count: b.sections_count || '?', metadata: b.metadata || {} } })
      dispatch({ type: 'SET_BRDS', brds })
    }).catch(() => {})
  }

  return (
    <div className="shell">
      <Sidebar wsStatus={wsStatus} />
      <div className="main-body">
        <Topbar onRefresh={refreshAll} />
        <div className="content">
          <AuthBanner />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/actions" element={<Actions />} />
            <Route path="/escalations" element={<Escalations />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/upload" element={<UploadResources />} />
            <Route path="/metrics" element={<Metrics />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/brds" element={<BRDs />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
      <AuditSidebar />
      <ToastContainer />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <WebSocketProvider>
          <LayoutShell />
        </WebSocketProvider>
      </HashRouter>
    </AppProvider>
  )
}

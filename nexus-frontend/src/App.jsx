import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import WebSocketProvider from './context/WebSocketProvider'
import ToastContainer from './components/ui/ToastContainer'
import { Menu } from 'lucide-react'

import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import Settings from './pages/Settings'
import Actions from './pages/Actions'
import Inbox from './pages/Inbox'
import Metrics from './pages/Metrics'
import BRDs from './pages/BRDs'
import Escalations from './pages/Escalations'
import Upload from './pages/Upload'
import Calendar from './pages/Calendar'
import ProjectMap from './pages/ProjectMap'
import Assistant from './pages/Assistant'
import Bandit from './pages/Bandit'

import Sidebar from './components/Layout/Sidebar'
import CommandPalette from './components/ui/CommandPalette'
import DynamicIsland from './components/ui/DynamicIsland'
import AssistantWidget from './components/ui/AssistantWidget'

function IntroLoader() {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 100)
    const t2 = setTimeout(() => setStage(2), 280)
    const t3 = setTimeout(() => setStage(3), 350)
    const t4 = setTimeout(() => setStage(4), 1400)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
  }, [])

  if (stage === 4) return null

  return (
    <div className={`loader ${stage === 4 ? 'done' : ''}`}>
      <div className="loader-word">
        <span className={stage >= 1 ? 'up' : ''}>WELCOME</span>
      </div>
      <div className="loader-word" style={{ color: 'var(--color-brand-blue)' }}>
        <span className={stage >= 2 ? 'up' : ''}>NEXUS</span>
      </div>
      <div className="w-[160px] h-[1px] bg-white/10 mt-5">
        <div className="h-full bg-brand-blue transition-all duration-700 ease-out"
          style={{ width: stage >= 3 ? '100%' : '0%' }} />
      </div>
    </div>
  )
}

function LayoutShell() {
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  /* Close mobile nav on route change */
  useEffect(() => { setMobileNavOpen(false) }, [location.pathname])

  /* Custom Cursor */
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [ringPos, setRingPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const move = (e) => setMousePos({ x: e.clientX, y: e.clientY })
    window.addEventListener('mousemove', move)
    return () => window.removeEventListener('mousemove', move)
  }, [])

  useEffect(() => {
    let id
    const animate = () => {
      setRingPos(prev => ({
        x: prev.x + (mousePos.x - prev.x) * 0.12,
        y: prev.y + (mousePos.y - prev.y) * 0.12,
      }))
      id = requestAnimationFrame(animate)
    }
    animate()
    return () => cancelAnimationFrame(id)
  }, [mousePos])

  /* Scroll progress */
  const [scrollProgress, setScrollProgress] = useState(0)
  useEffect(() => {
    const onScroll = () => {
      const scrollPx = document.documentElement.scrollTop
      const winH = document.documentElement.scrollHeight - document.documentElement.clientHeight
      setScrollProgress(winH > 0 ? `${(scrollPx / winH) * 100}%` : '0%')
    }
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const isWide = location.pathname === '/projects'

  return (
    <>
      <IntroLoader />

      {/* Scroll progress bar */}
      <div className="fixed top-0 left-0 h-[2px] bg-brand-blue z-[7000] transition-all duration-100"
        style={{ width: scrollProgress || '0%' }} />

      {/* Custom cursor (desktop only) */}
      <div className="cursor hidden md:block" style={{ left: mousePos.x, top: mousePos.y }} />
      <div className="cursor-ring hidden md:block" style={{ left: ringPos.x, top: ringPos.y }} />

      {/* Dynamic Island */}
      <DynamicIsland />

      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 h-14 lg:hidden z-[4900] flex items-center justify-between px-4"
        style={{ background: '#050505', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <button
          onClick={() => setMobileNavOpen(v => !v)}
          className="p-2 text-brand-muted hover:text-white transition-colors"
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        <div className="font-bebas text-2xl tracking-widest">
          NEXUS<span style={{ color: 'var(--color-brand-blue)' }}>.</span>
        </div>
        <div className="w-9" />
      </div>

      <div className="min-h-screen bg-brand-black text-white relative flex">
        <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

        {/* Main content */}
        <div className="flex-1 lg:ml-[260px] pt-14 lg:pt-0 pb-28 lg:pb-8">
          <main
            key={location.pathname}
            className={`page-enter w-full mx-auto pt-8 lg:pt-14 z-10 transition-all
              ${isWide ? 'max-w-[1600px] px-5 lg:px-8' : 'max-w-[1040px] px-5 lg:px-12'}`}
          >
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/actions" element={<Actions />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/metrics" element={<Metrics />} />
              <Route path="/brds" element={<BRDs />} />
              <Route path="/escalations" element={<Escalations />} />
              <Route path="/upload" element={<Upload />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/map" element={<ProjectMap />} />
              <Route path="/assistant" element={<Assistant />} />
              <Route path="/bandit" element={<Bandit />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>

      <CommandPalette />
      <AssistantWidget />
      <ToastContainer />
    </>
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

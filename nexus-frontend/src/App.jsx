import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import WebSocketProvider from './context/WebSocketProvider'
import ToastContainer from './components/ui/ToastContainer'

import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import Settings from './pages/Settings'
import Sidebar from './components/Layout/Sidebar'

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
        <div className="h-full bg-brand-blue transition-all duration-700 ease-out" style={{ width: stage >= 3 ? '100%' : '0%' }}></div>
      </div>
    </div>
  )
}

function LayoutShell() {
  const { dispatch } = useApp()
  const location = useLocation()
  
  // Custom Cursor
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [ringPos, setRingPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = (e) => setMousePos({ x: e.clientX, y: e.clientY })
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  useEffect(() => {
    let animationFrameId
    const animate = () => {
      setRingPos(prev => ({
        x: prev.x + (mousePos.x - prev.x) * 0.12,
        y: prev.y + (mousePos.y - prev.y) * 0.12
      }))
      animationFrameId = requestAnimationFrame(animate)
    }
    animate()
    return () => cancelAnimationFrame(animationFrameId)
  }, [mousePos])

  // Simple progress bar based on scroll
  const [scrollProgress, setScrollProgress] = useState(0)
  useEffect(() => {
    const handleScroll = () => {
      const scrollPx = document.documentElement.scrollTop
      const winHeightPx = document.documentElement.scrollHeight - document.documentElement.clientHeight
      setScrollProgress(`${(scrollPx / winHeightPx) * 100}%`)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <>
      <IntroLoader />
      <div className="fixed top-0 left-0 h-[3px] bg-brand-blue z-[7000] transition-all duration-100" style={{ width: scrollProgress || '0%' }}></div>
      <div className="cursor hidden md:block" style={{ left: mousePos.x, top: mousePos.y }}></div>
      <div className="cursor-ring hidden md:block" style={{ left: ringPos.x, top: ringPos.y }}></div>

      <div className="min-h-screen bg-brand-black text-white relative flex">
        <Sidebar />
        
        {/* The Stream Content */}
        <div className="flex-1 lg:ml-[260px] pb-24 lg:pb-0">
          <main className={`w-full ${location.pathname === '/projects' ? 'max-w-[1600px] px-5 lg:px-8' : 'max-w-[1040px] px-5 lg:px-12'} pt-16 z-10 mx-auto transition-all`}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
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

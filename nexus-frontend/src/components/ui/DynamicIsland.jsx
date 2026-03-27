import { useState, useEffect, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import { CheckCircle2, XCircle, Cpu } from 'lucide-react'

const STEPS = [
  'Extracting intents...',
  'Analyzing stakeholders...',
  'Writing Executive Summary...',
  'Detecting requirement gaps...',
  'Composing BRD sections...',
  'Assembling final document...',
]

export default function DynamicIsland() {
  const { state } = useApp() || {}
  const [status, setStatus] = useState('hidden') // hidden | running | complete | error
  const [stepIdx, setStepIdx] = useState(0)
  const [progress, setProgress] = useState(0)
  const [hovered, setHovered] = useState(false)
  const stepRef = useRef(null)
  const progressRef = useRef(null)

  /* Listen for BRD status from global state */
  useEffect(() => {
    if (state?.brdRunning) {
      setStatus('running')
      setStepIdx(0)
      setProgress(0)
    }
  }, [state?.brdRunning])

  /* Listen for WebSocket events via custom events */
  useEffect(() => {
    const onBrdEvent = (e) => {
      const { type } = e.detail || {}
      if (type === 'brd_running') { setStatus('running'); setStepIdx(0); setProgress(0) }
      if (type === 'brd_complete') {
        setStatus('complete')
        setProgress(100)
        setTimeout(() => setStatus('hidden'), 5000)
      }
      if (type === 'brd_error') {
        setStatus('error')
        setTimeout(() => setStatus('hidden'), 4000)
      }
    }
    window.addEventListener('nexus:brdStatus', onBrdEvent)
    return () => window.removeEventListener('nexus:brdStatus', onBrdEvent)
  }, [])

  /* Cycle through steps when running */
  useEffect(() => {
    if (status !== 'running') return
    stepRef.current = setInterval(() => {
      setStepIdx(i => (i + 1) % STEPS.length)
      setProgress(p => Math.min(p + Math.random() * 15 + 8, 90))
    }, 2200)
    return () => clearInterval(stepRef.current)
  }, [status])

  if (status === 'hidden') return null

  const isRunning  = status === 'running'
  const isComplete = status === 'complete'
  const isError    = status === 'error'

  const pillBg     = isComplete ? 'rgba(0,255,157,0.08)'    : isError ? 'rgba(255,80,80,0.08)'    : 'rgba(10,10,10,0.96)'
  const pillBorder = isComplete ? 'rgba(0,255,157,0.4)'     : isError ? 'rgba(255,80,80,0.4)'     : 'rgba(255,255,255,0.1)'
  const dotColor   = isComplete ? '#00ff9d'                 : isError ? '#ff5080'                 : '#FFE234'
  const textColor  = isComplete ? '#00ff9d'                 : isError ? '#ff5080'                 : 'rgba(255,255,255,0.8)'

  return (
    <div
      className="fixed top-5 left-1/2 z-[8500] flex flex-col items-center"
      style={{ transform: 'translateX(-50%)' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Pill */}
      <div
        style={{
          background: pillBg,
          border: `1px solid ${pillBorder}`,
          borderRadius: '999px',
          backdropFilter: 'blur(20px)',
          boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)`,
          transition: 'all 0.4s cubic-bezier(0.16,1,0.3,1)',
          width: hovered && isRunning ? '440px' : '210px',
          height: hovered && isRunning ? '96px' : '44px',
          overflow: 'hidden',
          cursor: isComplete ? 'pointer' : 'default',
        }}
        onClick={() => isComplete && window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        {/* Collapsed content */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '0 18px',
            height: '44px',
            opacity: hovered && isRunning ? 0 : 1,
            transition: 'opacity 0.2s ease',
          }}
        >
          {/* Status dot */}
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: dotColor,
            boxShadow: `0 0 8px ${dotColor}`,
            animation: isRunning ? 'pulseDot 1.5s ease-in-out infinite' : 'none',
            flexShrink: 0,
          }} />
          <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '11px', letterSpacing: '0.1em', color: textColor, whiteSpace: 'nowrap' }}>
            {isRunning  && 'Pipeline Active'}
            {isComplete && '✓ BRD Ready'}
            {isError    && '✗ Pipeline Failed'}
          </span>
        </div>

        {/* Expanded content (hover) */}
        {isRunning && (
          <div style={{
            position: 'absolute',
            inset: 0,
            padding: '16px 20px',
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.25s ease 0.1s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Cpu size={13} style={{ color: '#FFE234', flexShrink: 0 }} />
              <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                9-Agent Pipeline
              </span>
            </div>
            <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', color: 'rgba(255,255,255,0.8)', marginBottom: 12, lineHeight: 1.4 }}>
              {STEPS[stepIdx]}
            </p>
            {/* Progress bar */}
            <div style={{ height: 2, background: 'rgba(255,255,255,0.08)', borderRadius: 1, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                background: '#FFE234',
                borderRadius: 1,
                width: `${progress}%`,
                transition: 'width 2s ease',
                boxShadow: '0 0 8px rgba(255,226,52,0.6)',
              }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

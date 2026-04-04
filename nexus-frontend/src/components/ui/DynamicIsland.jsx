import { useState, useEffect, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import { Cpu, Database, TerminalSquare } from 'lucide-react'

// --- ADVANCED SIMULATION LOG DATA ---
const AUDIT_TRAILS = [
  { 
    title: 'INITIALIZING_SWARM', 
    logs: [
      { source: 'FRONTEND', msg: 'Dispatched EVENT_BRD_GENERATE payload.' },
      { source: 'BACKEND', msg: '202 ACCEPTED. Initializing worker swarm.' },
      { source: 'SYSTEM', msg: 'Allocating 8192MB virtual memory...' },
      { source: 'BACKEND', msg: 'Mounting project context to secure volume.' }
    ] 
  },
  { 
    title: 'CONTEXT_EXTRACTION', 
    logs: [
      { source: 'BACKEND', msg: 'Querying PostgreSQL vector embeddings...' },
      { source: 'SYSTEM', msg: 'Parsing 14 email threads...' },
      { source: 'LLM_NODE', msg: 'Tokenizing raw transcripts. (Chunk size: 512)' },
      { source: 'BACKEND', msg: 'Sanitizing UTF-8 encodings.' }
    ] 
  },
  { 
    title: 'STAKEHOLDER_ANALYSIS', 
    logs: [
      { source: 'LLM_NODE', msg: 'Executing NER (Named Entity Recognition).' },
      { source: 'SYSTEM', msg: 'Mapping user roles and permissions...' },
      { source: 'BACKEND', msg: 'Extracting decision matrices.' },
      { source: 'LLM_NODE', msg: 'Cross-referencing implicit intents.' }
    ] 
  },
  { 
    title: 'GAP_DETECTION', 
    logs: [
      { source: 'SYSTEM', msg: 'Running logic constraint validation...' },
      { source: 'LLM_NODE', msg: 'Flagging 3 missing edge-case constraints.' },
      { source: 'BACKEND', msg: 'Querying historical conflict resolutions.' },
      { source: 'FRONTEND', msg: 'Received partial state update via WSS.' }
    ] 
  },
  { 
    title: 'BRD_COMPOSITION', 
    logs: [
      { source: 'LLM_NODE', msg: 'Drafting Executive Summary...' },
      { source: 'LLM_NODE', msg: 'Writing Functional Reqs (FR-001 to FR-012).' },
      { source: 'SYSTEM', msg: 'Structuring NFRs (Security, Performance).' },
      { source: 'BACKEND', msg: 'Formatting Markdown layout.' }
    ] 
  },
  { 
    title: 'FINAL_ASSEMBLY', 
    logs: [
      { source: 'BACKEND', msg: 'Compiling JSON schema blocks.' },
      { source: 'SYSTEM', msg: 'Validating output against strict schema.' },
      { source: 'BACKEND', msg: 'Preparing DOCX buffer stream...' },
      { source: 'FRONTEND', msg: 'Awaiting final checksum verification.' }
    ] 
  }
]

// Colors for audit sources
const SOURCE_COLORS = {
  FRONTEND: '#0055ff', // Deep Blue
  BACKEND: '#a855f7',  // Purple
  SYSTEM: '#00f0ff',   // Cyan
  LLM_NODE: '#00ff9d', // Emerald
  ERROR: '#ff003c'     // Red
}

export default function DynamicIsland() {
  const { state } = useApp() || {}
  const [status, setStatus] = useState('hidden') // hidden | running | complete | error
  const [hovered, setHovered] = useState(false)
  
  // Simulation State
  const [phaseIdx, setPhaseIdx] = useState(0)
  const [progress, setProgress] = useState(0)
  const [tokens, setTokens] = useState(0)
  const [auditLogs, setAuditLogs] = useState([]) // Live scrolling logs
  
  const logEndRef = useRef(null)

  /* Listen for BRD status from global state / WebSockets */
  useEffect(() => {
    if (state?.brdRunning) triggerStart()
  }, [state?.brdRunning])

  useEffect(() => {
    const onBrdEvent = (e) => {
      const { type } = e.detail || {}
      if (type === 'brd_running') triggerStart()
      if (type === 'brd_complete') triggerComplete()
      if (type === 'brd_error') triggerError()
    }
    window.addEventListener('nexus:brdStatus', onBrdEvent)
    return () => window.removeEventListener('nexus:brdStatus', onBrdEvent)
  }, [])

  // Auto-scroll logs
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [auditLogs, hovered])

  const addLog = (source, msg) => {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12) // HH:MM:SS.mmm
    setAuditLogs(prev => [...prev.slice(-40), { id: Math.random(), time: timestamp, source, msg }])
  }

  const triggerStart = () => {
    setStatus('running')
    setPhaseIdx(0)
    setProgress(0)
    setTokens(0)
    setAuditLogs([])
    addLog('SYSTEM', 'Initializing remote execution sequence.')
  }

  const triggerComplete = () => {
    setStatus('complete')
    setProgress(100)
    setPhaseIdx(AUDIT_TRAILS.length - 1)
    addLog('BACKEND', '200 OK. Checksum verified.')
    addLog('FRONTEND', 'Received BRD payload. Rendering UI.')
    setTimeout(() => setStatus('hidden'), 6000)
  }

  const triggerError = () => {
    setStatus('error')
    addLog('ERROR', 'CRITICAL FAILURE IN PIPELINE.')
    setTimeout(() => setStatus('hidden'), 5000)
  }

  /* --- FRONTEND SIMULATION ENGINE --- */
  useEffect(() => {
    if (status !== 'running') return

    let isActive = true
    let currentPhase = 0
    let currentProgress = 0
    
    let subTaskInterval = null
    let phaseTimeout = null

    const runSimulationPhase = () => {
      if (!isActive) return

      if (currentPhase >= AUDIT_TRAILS.length) {
        addLog('SYSTEM', 'Holding for server confirmation...')
        return
      }

      setPhaseIdx(currentPhase)
      const phaseDuration = Math.random() * 2000 + 1500

      subTaskInterval = setInterval(() => {
        if (!isActive) return
        const phaseData = AUDIT_TRAILS[currentPhase]
        
        // Pick a random log from the current phase and push it to the audit trail
        const randomLog = phaseData.logs[Math.floor(Math.random() * phaseData.logs.length)]
        addLog(randomLog.source, randomLog.msg)
        
        setTokens(t => t + Math.floor(Math.random() * 450 + 50))
        currentProgress += (95 - currentProgress) * 0.05
        setProgress(currentProgress)
      }, 600) // Emit a new log every 600ms

      phaseTimeout = setTimeout(() => {
        clearInterval(subTaskInterval)
        currentPhase++
        runSimulationPhase()
      }, phaseDuration)
    }

    runSimulationPhase()

    return () => {
      isActive = false
      clearInterval(subTaskInterval)
      clearTimeout(phaseTimeout)
    }
  }, [status])

  // --- RENDER LOGIC ---
  if (status === 'hidden') return null

  const isRunning  = status === 'running'
  const isComplete = status === 'complete'
  const isError    = status === 'error'

  const pillBg     = isComplete ? 'rgba(0, 255, 157, 0.05)' : isError ? 'rgba(255, 0, 60, 0.05)' : 'rgba(5, 5, 8, 0.95)'
  const pillBorder = isComplete ? 'rgba(0, 255, 157, 0.3)'  : isError ? 'rgba(255, 0, 60, 0.3)'  : 'rgba(0, 240, 255, 0.2)'
  const dotColor   = isComplete ? '#00ff9d'                 : isError ? '#ff003c'                : '#00f0ff'
  const textColor  = isComplete ? '#00ff9d'                 : isError ? '#ff003c'                : '#00f0ff'

  return (
    <div
      className="fixed top-6 right-6 z-[8500] flex flex-col items-end"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Container */}
      <div
        style={{
          background: pillBg,
          border: `1px solid ${pillBorder}`,
          borderRadius: hovered && isRunning ? '12px' : '999px',
          backdropFilter: 'blur(24px)',
          boxShadow: `0 10px 40px rgba(0,0,0,0.8), inset 0 0 15px ${pillBorder}`,
          transition: 'all 0.4s cubic-bezier(0.16,1,0.3,1)',
          width: hovered && isRunning ? '420px' : '220px',
          height: hovered && isRunning ? '280px' : '44px', /* Taller for audit logs */
          overflow: 'hidden',
          cursor: isComplete ? 'pointer' : 'default',
        }}
        onClick={() => isComplete && window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        {/* --- COLLAPSED STATE (The Pill) --- */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '0 18px',
            height: '44px',
            opacity: hovered && isRunning ? 0 : 1,
            transition: 'opacity 0.2s ease',
          }}
        >
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: dotColor,
            boxShadow: `0 0 10px ${dotColor}`,
            animation: isRunning ? 'pulseDot 1s ease-in-out infinite' : 'none',
            flexShrink: 0,
          }} />
          <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.15em', color: textColor, whiteSpace: 'nowrap' }}>
            {isRunning  && 'PIPELINE_ACTIVE'}
            {isComplete && 'DOC_GENERATED'}
            {isError    && 'SYS_FAILURE'}
          </span>
        </div>

        {/* --- EXPANDED STATE (The HUD Terminal) --- */}
        {isRunning && (
          <div style={{
            position: 'absolute',
            inset: 0,
            padding: '16px',
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.3s ease 0.1s',
            display: 'flex',
            flexDirection: 'column',
            pointerEvents: hovered ? 'auto' : 'none'
          }}>
            <div className="w-full flex flex-col h-full">
              
              {/* Header */}
              <div className="flex items-center justify-between mb-3 border-b border-[#00f0ff]/20 pb-2 shrink-0">
                <div className="flex items-center gap-2 text-[#00f0ff]">
                  <Cpu size={12} />
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] font-bold">NEXUS_ORCHESTRATOR</span>
                </div>
                <div className="font-mono text-[9px] text-[#00f0ff] font-bold">
                  {Math.round(progress)}%
                </div>
              </div>

              {/* Phase Title */}
              <div className="flex items-center justify-between mb-2 shrink-0">
                <span className="font-mono text-[10px] text-white font-bold tracking-widest uppercase">
                  {AUDIT_TRAILS[phaseIdx]?.title || 'PROCESSING'}
                </span>
                <span className="font-mono text-[9px] text-zinc-500 tracking-widest">
                  [{String(phaseIdx + 1).padStart(2, '0')}/{String(AUDIT_TRAILS.length).padStart(2, '0')}]
                </span>
              </div>
              
              {/* Live Audit Log Terminal */}
              <div className="flex-1 bg-black/60 border border-white/5 rounded-sm p-3 overflow-y-auto mb-3 custom-scrollbar">
                <div className="font-mono text-[8.5px] leading-relaxed space-y-1.5">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2 break-words">
                      <span className="text-zinc-600 shrink-0">[{log.time}]</span>
                      <span 
                        className="shrink-0 font-bold" 
                        style={{ color: SOURCE_COLORS[log.source] || '#fff' }}
                      >
                        [{log.source}]
                      </span>
                      <span className="text-zinc-300">{log.msg}</span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>

              {/* Footer / Progress */}
              <div className="mt-auto shrink-0">
                <div className="flex items-center justify-between mb-1.5 font-mono text-[8px] text-zinc-500 uppercase tracking-widest">
                  <span className="flex items-center gap-1"><Database size={10} /> TOKENS: {tokens.toLocaleString()}</span>
                  <span className="text-[#00f0ff] animate-pulse flex items-center gap-1"><TerminalSquare size={10}/> TRAIL_ACTIVE</span>
                </div>
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden" style={{ maskImage: 'repeating-linear-gradient(to right, black, black 4px, transparent 4px, transparent 5px)' }}>
                  <div className="h-full bg-[#00f0ff] transition-all duration-300 ease-out shadow-[0_0_8px_#00f0ff]" style={{ width: `${progress}%` }} />
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
      
      {/* Required style block for the pulse keyframe */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulseDot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; box-shadow: 0 0 20px ${dotColor}; }
        }
      `}} />
    </div>
  )
}
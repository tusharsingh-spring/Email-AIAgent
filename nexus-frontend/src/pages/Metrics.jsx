import { useEffect, useState } from 'react'
import { getMetrics } from '../services/api'
import { useApp } from '../context/AppContext'
import { Activity, Calendar, AlertTriangle, BarChart2, Loader2, RefreshCw, Cpu, Zap, Server, Globe, Database, Terminal, Network } from 'lucide-react'

const PIPELINE_NODES = [
  'ROUTER', 'EXTRACT', 'GAP_DET', 'WRITER_X6', 'ASSEMBLER', 'CALENDAR', 'COMPOSER', 'ESCALATE'
]

// --- ADVANCED CSS INJECTION ---
const AdvancedStyles = () => (
  <style>{`
    @keyframes spin-slow {
      100% { transform: rotate(360deg); }
    }
    @keyframes data-packet {
      0% { left: 0%; opacity: 0; box-shadow: 0 0 0px #00f0ff; }
      10% { opacity: 1; box-shadow: 0 0 20px #00f0ff, 0 0 40px #00f0ff; }
      90% { opacity: 1; box-shadow: 0 0 20px #00f0ff, 0 0 40px #00f0ff; }
      100% { left: 100%; opacity: 0; box-shadow: 0 0 0px #00f0ff; }
    }
    @keyframes scanline {
      0% { transform: translateY(-100%); }
      100% { transform: translateY(1000%); }
    }
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
    .hud-corner {
      position: absolute; width: 8px; height: 8px; border-color: rgba(0, 240, 255, 0.5); transition: all 0.3s ease;
    }
    .group:hover .hud-corner { border-color: rgba(0, 240, 255, 1); width: 12px; height: 12px; }
    .hud-tl { top: -1px; left: -1px; border-top-width: 2px; border-left-width: 2px; }
    .hud-tr { top: -1px; right: -1px; border-top-width: 2px; border-right-width: 2px; }
    .hud-bl { bottom: -1px; left: -1px; border-bottom-width: 2px; border-left-width: 2px; }
    .hud-br { bottom: -1px; right: -1px; border-bottom-width: 2px; border-right-width: 2px; }
    
    .glass-panel {
      background: linear-gradient(135deg, rgba(10,10,12,0.9) 0%, rgba(5,5,5,0.95) 100%);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.05);
    }
  `}</style>
)

// --- ADVANCED ROTATING BORDER CARD ---
function HeroStat({ icon: Icon, label, value, loading, delay = 0 }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setTimeout(() => setMounted(true), delay) }, [delay])

  return (
    <div className={`relative p-[1px] overflow-hidden rounded-xl group transition-all duration-1000 ease-out transform ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'}`}>
      <div className="absolute inset-[-50%] bg-[conic-gradient(from_0deg,transparent_0_340deg,#00f0ff_360deg)] animate-[spin-slow_4s_linear_infinite] opacity-30 group-hover:opacity-100" />
      
      <div className="relative h-full w-full bg-[#050505] rounded-xl p-6 flex flex-col justify-between z-10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#00f0ff]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        
        <div className="hud-corner hud-tl" />
        <div className="hud-corner hud-tr" />
        <div className="hud-corner hud-bl" />
        <div className="hud-corner hud-br" />

        <div className="flex items-center justify-between mb-8 relative z-20">
          <div className="flex items-center gap-3">
            <Icon size={16} className="text-[#00f0ff]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-bold group-hover:text-[#00f0ff] transition-colors">
              {label}
            </span>
          </div>
          {!loading && <div className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] animate-[blink_1.5s_infinite] shadow-[0_0_10px_#00f0ff]" />}
        </div>
        
        <div className="relative z-20">
          <div className="font-sans font-bold text-[clamp(40px,5vw,56px)] leading-none text-white tracking-tighter">
            {loading ? <Loader2 size={32} className="animate-spin text-[#00f0ff]/50 my-2" /> : value ?? '0'}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- EQUALIZER BAR ---
function EqualizerBar({ percentage }) {
  const segments = 25; 
  const activeSegments = Math.round((percentage / 100) * segments);

  return (
    <div className="flex items-center gap-[2px] h-2 w-full mt-2">
      {Array.from({ length: segments }).map((_, i) => (
        <div 
          key={i} 
          className={`h-full flex-1 rounded-[1px] transition-all duration-500 ${
            i < activeSegments 
              ? 'bg-[#00f0ff] shadow-[0_0_5px_#00f0ff]' 
              : 'bg-white/5'
          }`}
          style={{ transitionDelay: `${i * 20}ms` }}
        />
      ))}
    </div>
  )
}

export default function Metrics() {
  const { toast } = useApp() || {}
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setData(await getMetrics()) }
    catch { toast?.('Metrics unavailable', 'warn') }
    finally { setLoading(false) }
  }

  useEffect(() => { 
    load(); 
    setTimeout(() => setMounted(true), 100) 
  }, [])

  const summary = data?.summary || {}
  const intent = data?.intent_breakdown || {}
  const maxIntent = Object.values(intent).length ? Math.max(...Object.values(intent)) : 1

  const totalProcessed = summary.total_emails_processed ?? summary.total_processed ?? 0
  const meetingsScheduled = summary.meetings_scheduled ?? summary.calendar_events ?? 0
  const escalationsCount = summary.escalations ?? summary.total_escalations ?? 0

  return (
    <div className="relative min-h-screen pb-24 font-sans selection:bg-[#00f0ff]/30 text-white bg-[#020202] overflow-hidden">
      <AdvancedStyles />

      {/* Extreme Deep Tech Background */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-40">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#00f0ff08_1px,transparent_1px),linear-gradient(to_bottom,#00f0ff08_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#0055ff] rounded-full mix-blend-screen filter blur-[150px] opacity-20" />
        <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] bg-[#00f0ff] rounded-full mix-blend-screen filter blur-[150px] opacity-10" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-6 pt-10">
        
        {/* --- HEADER --- */}
        <div className={`mb-16 transition-all duration-1000 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-8'}`}>
          <div className="flex items-center justify-between mb-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-[#00f0ff] flex items-center gap-3 font-bold">
               <span className="animate-[blink_1s_infinite]">[SYS.ONLINE]</span>
               <span className="w-8 h-[1px] bg-[#00f0ff]/50" />
               NEXUS ORCHESTRATION KERNEL
            </div>
            <div className="font-mono text-[10px] text-zinc-500 hidden sm:flex items-center gap-6 font-bold tracking-widest">
              <span className="flex items-center gap-2"><Server size={12} className="text-[#0055ff]" /> CORE_ACTIVE</span>
              <span className="flex items-center gap-2"><Globe size={12} className="text-[#0055ff]" /> PING: 12ms</span>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
            <div>
              <h1 className="font-sans font-black text-[clamp(48px,8vw,100px)] leading-[0.85] tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/40 drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                KD METRICS
              </h1>
              <p className="font-mono text-[12px] text-[#00f0ff]/70 mt-6 max-w-2xl leading-relaxed uppercase tracking-widest">
                <span className="text-white">&gt; Monitoring live data streams.</span> Analyzing orchestration logic, throughput, and sub-routine classification across the neural network.
              </p>
            </div>
            
            <button
              onClick={load}
              disabled={loading}
              className="group relative flex items-center gap-3 bg-[#00f0ff]/5 border border-[#00f0ff]/20 text-[#00f0ff] hover:bg-[#00f0ff]/10 transition-all px-8 py-4 rounded-none font-mono text-[11px] uppercase tracking-[0.3em] font-bold shadow-[0_0_20px_rgba(0,240,255,0.05)] hover:shadow-[0_0_30px_rgba(0,240,255,0.2)]"
            >
              <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#00f0ff]" />
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#00f0ff]" />
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-700" />}
              {loading ? 'SYNCING...' : 'FORCE SYNC'}
            </button>
          </div>
        </div>

        {/* --- HERO STATS --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <HeroStat icon={Activity} label="SYS_THROUGHPUT" value={totalProcessed} loading={loading} delay={100} />
          <HeroStat icon={Calendar} label="CONVERSIONS_LOG" value={meetingsScheduled} loading={loading} delay={200} />
          <HeroStat icon={AlertTriangle} label="ANOMALY_DETECT" value={escalationsCount} loading={loading} delay={300} />
        </div>

        {/* --- MAIN MODULES --- */}
        <div className="grid lg:grid-cols-2 gap-6 mb-12">
          
          {/* INTENT SPECTRUM ANALYZER */}
          <div className={`glass-panel p-8 relative overflow-hidden group transition-all duration-1000 delay-400 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
            <div className="hud-corner hud-tl" /> <div className="hud-corner hud-br" />
            
            <div className="flex items-start justify-between mb-12 border-b border-white/5 pb-6">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#0055ff] mb-2 font-bold flex items-center gap-2">
                  <BarChart2 size={12} /> Spectrum Analysis
                </div>
                <div className="font-sans text-3xl font-black text-white tracking-tight">INTENT_VECTORS</div>
              </div>
            </div>

            <div className="space-y-8">
              {Object.entries(intent).length > 0 ? (
                Object.entries(intent).map(([name, count]) => {
                  const pct = (count / maxIntent) * 100;
                  return (
                    <div key={name} className="relative">
                      <div className="flex items-end justify-between mb-1">
                        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-300 font-bold">
                          {name}
                        </span>
                        <span className="font-mono text-sm font-bold text-[#00f0ff]">{count}</span>
                      </div>
                      <EqualizerBar percentage={loading ? 0 : pct} />
                    </div>
                  )
                })
              ) : (
                <div className="py-20 flex flex-col items-center justify-center gap-4 text-zinc-600">
                  <div className="animate-[spin_4s_linear_infinite]"><Loader2 size={32} /></div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.3em]">AWAITING_SIGNAL...</div>
                </div>
              )}
            </div>
          </div>

          {/* DATA PIPELINE STREAM */}
          <div className={`glass-panel p-8 relative overflow-hidden flex flex-col transition-all duration-1000 delay-500 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
            <div className="hud-corner hud-tr" /> <div className="hud-corner hud-bl" />
            
            <div className="flex items-start justify-between mb-12 border-b border-white/5 pb-6">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f0ff] mb-2 font-bold flex items-center gap-2">
                  <Network size={12} /> Node Orchestration
                </div>
                <div className="font-sans text-3xl font-black text-white tracking-tight">LOGIC_STREAM</div>
              </div>
            </div>

            {/* Animated Graph Nodes */}
            <div className="relative w-full h-40 flex items-center justify-between px-2 my-auto border border-white/5 bg-black/50 rounded-lg overflow-hidden">
              <div className="absolute w-[200%] h-[2px] bg-[#00f0ff]/20 blur-sm rotate-45 animate-[scanline_3s_linear_infinite]" />
              <div className="absolute left-6 right-6 top-1/2 h-[1px] bg-[#0055ff]/40 -translate-y-1/2" />
              <div className="absolute top-1/2 -translate-y-1/2 w-8 h-[2px] bg-[#00f0ff] animate-[data-packet_2s_linear_infinite]" />
              <div className="absolute top-1/2 -translate-y-1/2 w-16 h-[1px] bg-white animate-[data-packet_3s_linear_infinite_1s]" />

              {PIPELINE_NODES.map((node, i) => {
                const isTop = i % 2 === 0;
                return (
                  <div key={node} className="relative z-10 flex flex-col items-center group cursor-crosshair">
                    <div className="w-2.5 h-2.5 bg-black border border-[#00f0ff] rotate-45 group-hover:bg-[#00f0ff] transition-all duration-300 shadow-[0_0_10px_rgba(0,240,255,0.3)] group-hover:shadow-[0_0_20px_rgba(0,240,255,1)] group-hover:scale-150" />
                    <div className={`absolute w-[1px] h-8 bg-[#00f0ff]/20 group-hover:bg-[#00f0ff] transition-colors ${isTop ? 'bottom-full mb-1' : 'top-full mt-1'}`} />
                    <div className={`absolute font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-500 group-hover:text-white transition-colors whitespace-nowrap font-bold ${isTop ? 'bottom-[calc(100%+2rem)]' : 'top-[calc(100%+2rem)]'}`}>
                      {node}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
              {[
                { label: 'EMBEDDINGS', value: 'MiniLM-L6' },
                { label: 'CORE_LLM', value: 'Llama-3-70B' },
                { label: 'ENGINE', value: 'LangGraph' },
                { label: 'HARDWARE', value: 'Groq LPU' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-black/40 border border-white/5 p-3 rounded-none border-l-2 border-l-[#0055ff] hover:border-l-[#00f0ff] transition-colors">
                  <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-zinc-500 mb-1 font-bold">{label}</div>
                  <div className="font-mono text-[11px] font-bold text-white tracking-widest">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* --- RAW TELEMETRY TERMINAL (CRASH FIXED) --- */}
        {Object.keys(summary).length > 0 && (
          <div className={`glass-panel border-t-2 border-t-[#00f0ff] p-8 shadow-2xl relative overflow-hidden transition-all duration-1000 delay-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#00f0ff]/10 blur-[50px] pointer-events-none" />
            
            <div className="flex items-center justify-between mb-10">
               <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00f0ff] mb-2 font-bold flex items-center gap-2">
                    <Terminal size={12} /> Matrix Output
                  </div>
                  <div className="font-sans text-3xl font-black text-white tracking-tight">RAW_REGISTRY</div>
               </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
              {Object.entries(summary).map(([k, v], i) => {
                // BUG FIX: Safely parse objects/arrays to text so React doesn't crash!
                const displayValue = v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v);
                
                // Deterministic hex code (No Math.random to prevent re-render flickering)
                const hexAddress = ((i + 1) * 0x0A4B).toString(16).toUpperCase().padStart(4, '0');

                return (
                  <div key={k} className="p-5 bg-black/40 border border-white/5 hover:bg-[#00f0ff]/5 transition-all relative group overflow-hidden">
                    <div className="absolute top-0 left-0 w-[2px] h-full bg-[#00f0ff] opacity-0 group-hover:opacity-100 transition-opacity shadow-[0_0_10px_#00f0ff]" />
                    
                    <div className="font-mono text-[10px] text-[#0055ff] mb-4 font-bold tracking-widest">
                      [0x{hexAddress}]
                    </div>
                    
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400 mb-2 truncate font-bold group-hover:text-white transition-colors" title={k.replace(/_/g, ' ')}>
                      {k.replace(/_/g, ' ')}
                    </div>
                    
                    <div 
                      className="font-mono text-[clamp(18px,2vw,30px)] font-light text-white group-hover:text-[#00f0ff] transition-colors tracking-tighter drop-shadow-[0_0_8px_rgba(0,240,255,0.5)] truncate"
                      title={displayValue}
                    >
                      {displayValue}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
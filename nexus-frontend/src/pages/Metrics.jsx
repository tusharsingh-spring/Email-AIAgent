import { useEffect, useState } from 'react'
import { getMetrics } from '../services/api'
import { useApp } from '../context/AppContext'
import IntentChart from '../components/charts/IntentChart'
import { Activity, Calendar, AlertTriangle, BarChart2, Loader2, RefreshCw, Cpu, Zap, ChevronRight } from 'lucide-react'

const PIPELINE_NODES = [
  { label: 'Router', color: '#00B5E2' },
  { label: 'Extract', color: '#a855f7' },
  { label: 'Gap Det.', color: '#a855f7' },
  { label: 'Writer ×6', color: '#a855f7' },
  { label: 'Assembler', color: '#a855f7' },
  { label: 'Calendar', color: '#00bfa5' },
  { label: 'Composer', color: '#00ff9d' },
  { label: 'Escalate', color: '#ff5080' },
]

const INTENT_COLORS = {
  brd: '#a855f7',
  schedule: '#00B5E2',
  escalate: '#ff5080',
  general: 'rgba(255,255,255,0.4)',
  status: '#FFE234',
}

function StatCard({ icon: Icon, label, value, color, loading }) {
  return (
    <div className="bg-[#050505] border border-brand-border rounded-sm p-6 relative overflow-hidden group transition-all hover:border-white/20 shadow-xl">
      {/* Top Status Bar */}
      <div className="absolute top-0 left-0 w-full h-[2px] opacity-50 group-hover:opacity-100 transition-opacity" style={{ background: color }} />
      
      {/* Background Glow */}
      <div
        className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-[60px] pointer-events-none opacity-10 group-hover:opacity-20 transition-opacity"
        style={{ background: color }}
      />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-6">
          <div className="p-2 rounded-sm bg-white/5 border border-white/5">
             <Icon size={16} style={{ color }} />
          </div>
          <span className="font-space text-[10px] uppercase tracking-[0.25em] text-brand-muted">
            {label}
          </span>
        </div>
        
        <div className="flex items-baseline gap-2">
          <div className="font-bebas text-[clamp(44px,5vw,64px)] leading-none text-white">
            {loading ? <Loader2 size={32} className="animate-spin text-brand-muted/20" /> : value ?? '0'}
          </div>
          {!loading && <Zap size={14} className="text-white/10 mb-1" />}
        </div>
      </div>
    </div>
  )
}

export default function Metrics() {
  const { toast } = useApp() || {}
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setData(await getMetrics()) }
    catch { toast?.('Metrics unavailable', 'warn') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const summary = data?.summary || {}
  const intent = data?.intent_breakdown || {}
  const maxIntent = Object.values(intent).length ? Math.max(...Object.values(intent)) : 1

  const totalProcessed = summary.total_emails_processed ?? summary.total_processed ?? 0
  const meetingsScheduled = summary.meetings_scheduled ?? summary.calendar_events ?? 0
  const escalationsCount = summary.escalations ?? summary.total_escalations ?? 0

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="mb-12">
        <div className="htag mb-4 font-space text-[11px] uppercase tracking-widest text-brand-muted flex items-center gap-2">
           <Activity size={12} className="text-brand-blue" />
           Intelligence / Live Analytics
        </div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="font-bebas text-[clamp(42px,7vw,88px)] leading-[0.85] tracking-tight uppercase text-white">
              Pipeline Metrics
            </h1>
            <p className="font-dm text-[13px] text-brand-muted mt-4 max-w-xl">
              Real-time throughput and intent classification across the LangGraph orchestration layer. 
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-3 bg-[#0a0a0a] border border-brand-border text-brand-muted hover:text-white hover:border-brand-blue transition-all px-6 py-3 rounded-sm font-space text-[11px] uppercase tracking-widest active:scale-95"
          >
            {loading ? <Loader2 size={14} className="animate-spin text-brand-blue" /> : <RefreshCw size={14} />}
            Synchronize Data
          </button>
        </div>
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
        <StatCard icon={Activity} label="Throughput" value={totalProcessed} color="#FFE234" loading={loading} />
        <StatCard icon={Calendar} label="Conversions" value={meetingsScheduled} color="#00B5E2" loading={loading} />
        <StatCard icon={AlertTriangle} label="Anomalies" value={escalationsCount} color="#ff5080" loading={loading} />
      </div>

      {/* Two-Column Layout */}
      <div className="grid lg:grid-cols-2 gap-8 mb-12">
        
        {/* Intent Breakdown */}
        <div className="bg-[#050505] border border-brand-border rounded-sm p-8 shadow-xl">
          <div className="flex items-center justify-between mb-10">
            <div>
              <div className="font-space text-[10px] uppercase tracking-[0.2em] text-brand-blue mb-2">Signal Analysis</div>
              <div className="font-bebas text-3xl text-white">Intent Classification</div>
            </div>
            <BarChart2 size={24} className="text-brand-muted/20" />
          </div>

          <div className="space-y-6">
            {Object.entries(intent).length > 0 ? (
              Object.entries(intent).map(([name, count]) => {
                const pct = Math.round((count / maxIntent) * 100)
                const color = INTENT_COLORS[name] || '#666'
                return (
                  <div key={name} className="group">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-space text-[11px] uppercase tracking-widest text-white flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                        {name}
                      </span>
                      <span className="font-bebas text-2xl text-brand-muted group-hover:text-white transition-colors">{count}</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000 ease-out"
                        style={{ width: loading ? '0%' : `${pct}%`, background: color }}
                      />
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="py-20 text-center font-space text-[11px] text-brand-muted/40 uppercase tracking-widest">
                Awaiting Data Signal...
              </div>
            )}
          </div>

          {Object.keys(intent).length > 0 && (
            <div className="mt-12 pt-8 border-t border-brand-border/50">
              <IntentChart data={intent} />
            </div>
          )}
        </div>

        {/* Pipeline Map */}
        <div className="bg-[#050505] border border-brand-border rounded-sm p-8 shadow-xl">
          <div className="flex items-center justify-between mb-10">
            <div>
              <div className="font-space text-[10px] uppercase tracking-[0.2em] text-brand-yellow mb-2">Orchestration</div>
              <div className="font-bebas text-3xl text-white">Logic Sequence</div>
            </div>
            <Cpu size={24} className="text-brand-muted/20" />
          </div>

          <div className="relative mb-10">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-4">
              {PIPELINE_NODES.map((n, i) => (
                <div key={n.label} className="flex items-center gap-2">
                  <div 
                    className="font-space text-[10px] px-3 py-1.5 rounded-sm border uppercase tracking-tighter"
                    style={{ color: n.color, borderColor: `${n.color}30`, background: `${n.color}05` }}
                  >
                    {n.label}
                  </div>
                  {i < PIPELINE_NODES.length - 1 && (
                    <ChevronRight size={12} className="text-brand-muted/20" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 border-t border-brand-border/50 pt-8">
            <div className="font-space text-[10px] uppercase tracking-widest text-brand-muted/50 mb-2">Stack Configuration</div>
            {[
              { label: 'Embeddings', value: 'all-MiniLM-L6-v2' },
              { label: 'Core LLM', value: 'Llama 3.3-70B' },
              { label: 'Orchestrator', value: 'LangGraph v0.2' },
              { label: 'Inference', value: 'Groq LPU™' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between group">
                <span className="font-space text-[10px] uppercase tracking-widest text-brand-muted group-hover:text-white transition-colors">{label}</span>
                <span className="font-dm text-[12px] text-brand-blue/80">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Raw Data Module */}
      {Object.keys(summary).length > 0 && (
        <div className="bg-[#050505] border border-brand-border rounded-sm p-8 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between mb-8">
             <div>
                <div className="font-space text-[10px] uppercase tracking-[0.2em] text-brand-muted/50 mb-2">Data Table</div>
                <div className="font-bebas text-3xl text-white uppercase tracking-wider">Metric Registry</div>
             </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 border-t border-l border-brand-border/50">
            {Object.entries(summary).map(([k, v]) => (
              <div key={k} className="p-6 border-r border-b border-brand-border/50 bg-[#0a0a0a]/30 hover:bg-brand-blue/[0.02] transition-colors">
                <div className="font-space text-[9px] uppercase tracking-[0.25em] text-brand-muted mb-3 truncate">
                  {k.replace(/_/g, ' ')}
                </div>
                <div className="font-bebas text-3xl text-brand-blue">{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
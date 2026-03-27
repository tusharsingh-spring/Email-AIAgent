import { useEffect, useState } from 'react'
import { getMetrics } from '../services/api'
import { useApp } from '../context/AppContext'
import IntentChart from '../components/charts/IntentChart'
import { Activity, Calendar, AlertTriangle, BarChart2, Loader2, RefreshCw, Cpu } from 'lucide-react'

const PIPELINE_NODES = [
  { label: 'Intent Router', color: '#00B5E2' },
  { label: 'BRD Extract', color: '#a855f7' },
  { label: 'Gap Detect', color: '#a855f7' },
  { label: 'BRD Writer ×6', color: '#a855f7' },
  { label: 'Assembler', color: '#a855f7' },
  { label: 'Calendar Agent', color: '#00bfa5' },
  { label: 'Reply Composer', color: '#00ff9d' },
  { label: 'Escalation', color: '#ff5080' },
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
    <div className="bg-brand-panel border border-brand-border rounded-sm p-6 relative overflow-hidden group hover:border-white/10 transition-colors">
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl pointer-events-none opacity-20 group-hover:opacity-30 transition-opacity"
        style={{ background: color }}
      />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <Icon size={14} style={{ color }} />
          <span className="font-space text-[9px] uppercase tracking-[0.2em]" style={{ color }}>
            {label}
          </span>
        </div>
        <div className="font-bebas text-[clamp(36px,5vw,56px)] leading-none" style={{ color }}>
          {loading ? '—' : value ?? '—'}
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
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const summary = data?.summary || {}
  const intent = data?.intent_breakdown || {}
  const maxIntent = Object.values(intent).length ? Math.max(...Object.values(intent)) : 1

  /* derive hero stats from summary keys */
  const totalProcessed = summary.total_emails_processed ?? summary.total_processed ?? '—'
  const meetingsScheduled = summary.meetings_scheduled ?? summary.calendar_events ?? '—'
  const escalationsCount = summary.escalations ?? summary.total_escalations ?? '—'

  return (
    <div className="pb-20">

      {/* HEADER */}
      <div className="mb-10">
        <div className="htag mb-4">Intelligence / Analytics</div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
          <h1 className="font-bebas text-[clamp(38px,6.5vw,80px)] leading-[0.9] tracking-[0.01em] uppercase text-brand-text">
            Pipeline Metrics
          </h1>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 border border-brand-border text-brand-muted hover:text-white hover:border-white/20 px-5 py-2.5 rounded-sm font-space text-[10px] uppercase tracking-widest transition-colors hover:scale-[1.02] active:scale-[0.98]"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Refresh
          </button>
        </div>
      </div>

      {/* HERO STAT CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        <StatCard icon={Activity} label="Total Processed" value={totalProcessed} color="#FFE234" loading={loading} />
        <StatCard icon={Calendar} label="Meetings Scheduled" value={meetingsScheduled} color="#00B5E2" loading={loading} />
        <StatCard icon={AlertTriangle} label="Escalations" value={escalationsCount} color="#ff5080" loading={loading} />
      </div>

      {/* 2-COL GRID */}
      <div className="grid lg:grid-cols-2 gap-8 mb-8">

        {/* INTENT BREAKDOWN */}
        <div className="bg-brand-panel border border-brand-border rounded-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="font-space text-[9px] uppercase tracking-[0.2em] text-brand-muted/50 mb-1">Intent Breakdown</div>
              <div className="font-bebas text-2xl text-brand-text">Email Classification</div>
            </div>
            <BarChart2 size={18} className="text-brand-muted/30" />
          </div>

          {Object.keys(intent).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(intent).map(([name, count]) => {
                const pct = Math.round((count / maxIntent) * 100)
                const color = INTENT_COLORS[name] || 'rgba(255,255,255,0.4)'
                return (
                  <div key={name}>
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="font-space text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-sm border"
                        style={{ color, borderColor: color, background: `${color}14` }}
                      >
                        {name}
                      </span>
                      <span className="font-bebas text-xl" style={{ color }}>{count}</span>
                    </div>
                    <div className="h-1 bg-brand-border/30 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center py-10 gap-3">
              <BarChart2 size={36} className="text-white/10" />
              <div className="font-space text-[10px] uppercase tracking-widest text-brand-muted/40">
                {loading ? 'Loading...' : 'No data — click Refresh'}
              </div>
            </div>
          )}

          {/* IntentChart from charts */}
          {Object.keys(intent).length > 0 && (
            <div className="mt-6 pt-6 border-t border-brand-border">
              <IntentChart data={intent} />
            </div>
          )}
        </div>

        {/* PIPELINE ARCHITECTURE */}
        <div className="bg-brand-panel border border-brand-border rounded-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="font-space text-[9px] uppercase tracking-[0.2em] text-brand-muted/50 mb-1">System Architecture</div>
              <div className="font-bebas text-2xl text-brand-text">LangGraph Pipeline</div>
            </div>
            <Cpu size={18} className="text-brand-muted/30" />
          </div>

          <div className="font-space text-[9px] uppercase tracking-[0.15em] text-brand-muted/30 mb-4">
            Node Execution Flow
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-6">
            {PIPELINE_NODES.map((n, i) => (
              <div key={n.label} className="flex items-center gap-1">
                <span
                  className="font-space text-[10px] px-2 py-1 rounded-sm border"
                  style={{ color: n.color, borderColor: `${n.color}40`, background: `${n.color}08` }}
                >
                  {n.label}
                </span>
                {i < PIPELINE_NODES.length - 1 && (
                  <span className="text-brand-muted/30 text-[10px]">→</span>
                )}
              </div>
            ))}
          </div>

          {/* Tech stack */}
          <div className="border-t border-brand-border pt-4 space-y-2">
            {[
              { label: 'Clustering', value: 'all-MiniLM-L6-v2' },
              { label: 'LLM', value: 'llama-3.3-70b-versatile (Groq)' },
              { label: 'Framework', value: 'LangGraph' },
              { label: 'Backend', value: 'FastAPI + WebSocket' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="font-space text-[9px] uppercase tracking-widest text-brand-muted/40 w-24">{label}</span>
                <span className="font-space text-[10px] text-brand-blue/80 bg-brand-blue/5 px-2 py-0.5 rounded-sm">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FULL SUMMARY TABLE */}
      {Object.keys(summary).length > 0 && (
        <div className="bg-brand-panel border border-brand-border rounded-sm p-6">
          <div className="font-space text-[9px] uppercase tracking-[0.2em] text-brand-muted/50 mb-1">Raw Pipeline Data</div>
          <div className="font-bebas text-2xl text-brand-text mb-6">Summary Report</div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-px bg-brand-border">
            {Object.entries(summary).map(([k, v]) => (
              <div key={k} className="bg-brand-panel p-4">
                <div className="font-space text-[9px] uppercase tracking-widest text-brand-muted/40 mb-1">
                  {k.replace(/_/g, ' ')}
                </div>
                <div className="font-bebas text-2xl text-brand-blue">{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

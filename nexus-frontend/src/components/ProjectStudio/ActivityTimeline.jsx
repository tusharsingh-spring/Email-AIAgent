import { Clock, Activity, FileCheck, Info } from 'lucide-react'

export default function ActivityTimeline({ project, contextCount, brdIsReady }) {
  // Synthesize a log based on project status, since we don't have a granular DB table for this yet.
  const logs = [
    { time: new Date(project.created_at).toLocaleTimeString(), title: 'Workspace Initialized', type: 'info' }
  ]

  if (contextCount > 0) {
    logs.push({ time: 'Updated', title: `${contextCount} Data Nodes Ingested`, type: 'activity' })
  }

  if (brdIsReady) {
    logs.push({ time: 'Pipeline Completed', title: 'Intelligence Agents Synthesized BRD', type: 'success' })
  }

  const getLogIcon = (t) => {
    switch(t) {
      case 'activity': return <Activity size={12} className="text-brand-blue" />
      case 'success': return <FileCheck size={12} className="text-[#00ff9d]" />
      default: return <Info size={12} className="text-brand-muted" />
    }
  }

  return (
    <div className="w-[240px] shrink-0 bg-brand-base border-l border-brand-border p-6 h-full overflow-y-auto">
      <h4 className="font-space text-[10px] tracking-[0.2em] text-brand-muted uppercase mb-8 flex items-center gap-2">
        <Clock size={12} /> Live Event Ledger
      </h4>

      <div className="flex flex-col gap-6 relative before:absolute before:inset-y-0 before:left-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-[1px] before:bg-brand-border">
        {logs.map((log, i) => (
          <div key={i} className="relative flex items-center gap-4">
             <div className="z-10 w-4 h-4 rounded-full bg-brand-input border border-brand-border flex items-center justify-center shrink-0">
               {getLogIcon(log.type)}
             </div>
             <div>
               <div className="font-space text-[9px] uppercase tracking-widest text-brand-muted mb-0.5">{log.time}</div>
               <div className="font-dm text-[13px] text-brand-text">{log.title}</div>
             </div>
          </div>
        ))}

        <div className="relative flex items-center gap-4 opacity-30 mt-4">
           <div className="z-10 w-4 h-4 rounded-full bg-transparent border border-brand-border flex items-center justify-center shrink-0">
             <div className="w-1 h-1 bg-brand-border rounded-full animate-pulse"></div>
           </div>
           <div className="font-space text-[9px] uppercase tracking-widest text-brand-muted">Awaiting Events...</div>
        </div>
      </div>
    </div>
  )
}

import { FileText, Database, Webhook, Cog, CheckCircle2, Loader2, Download } from 'lucide-react'

// Simple SVG Line Connector
const Connector = ({ active, animate }) => (
  <div className="flex-1 h-[2px] mx-4 relative overflow-hidden bg-brand-border/50">
    <div className={`absolute top-0 left-0 h-full w-full ${active ? 'bg-brand-blue' : ''} ${animate ? 'animate-[slideRight_1.5s_linear_infinite] bg-brand-yellow/50' : ''}`} style={{ width: active ? '100%' : '0%' }}></div>
  </div>
)

const PipelineNode = ({ icon: Icon, label, status, subtext }) => {
  const getColors = () => {
    switch(status) {
      case 'active': return 'border-brand-yellow text-brand-yellow bg-brand-yellow/5'
      case 'complete': return 'border-brand-blue text-brand-blue bg-brand-blue/5'
      default: return 'border-brand-border text-brand-muted bg-brand-input hover:border-white/20'
    }
  }

  return (
    <div className={`p-4 rounded-sm border transition-colors flex flex-col items-center justify-center text-center w-36 h-36 relative ${getColors()}`}>
      {status === 'active' && (
        <div className="absolute inset-0 border border-brand-yellow animate-ping rounded-sm opacity-20"></div>
      )}
      {status === 'active' ? <Loader2 size={24} className="mb-3 animate-spin" /> : <Icon size={24} className="mb-3" />}
      <div className="font-bebas text-lg leading-none tracking-wide">{label}</div>
      {subtext && <div className="font-space text-[9px] uppercase tracking-widest opacity-60 mt-2">{subtext}</div>}
    </div>
  )
}

export default function PipelineGraph({ contextCount, isRunning, brdIsReady, activeBrdId, onDownload, onRun }) {
  // Determine Node States
  const hasContext = contextCount > 0
  const n1 = hasContext ? 'complete' : 'pending' // Ingress
  const n2 = isRunning ? 'active' : (brdIsReady ? 'complete' : (hasContext ? 'pending' : 'pending')) // Synthesis
  const n3 = brdIsReady ? 'complete' : 'pending' // Output

  return (
    <div className="h-full flex flex-col p-6 md:p-10 relative bg-brand-panel/50">
      
      {/* HEADER */}
      <div className="mb-8 border-b border-brand-border pb-6 flex justify-between items-center">
        <div>
          <h2 className="font-space text-[12px] tracking-[0.2em] text-brand-muted uppercase mb-1">Intelligence Pipeline</h2>
          <div className="font-bebas text-3xl tracking-[0.02em] text-brand-text">Data Synthesis Graph</div>
        </div>
        <div>
          {brdIsReady ? (
             <button onClick={() => onDownload(activeBrdId)} className="bg-brand-blue hover:bg-white text-brand-black px-6 py-3 rounded-sm font-space text-[10px] uppercase tracking-widest font-bold transition-all flex items-center gap-2">
               <Download size={14} /> Fetch BRD Document
             </button>
          ) : (
             <button onClick={onRun} disabled={!hasContext || isRunning} className="bg-brand-text hover:bg-brand-yellow text-brand-black disabled:opacity-30 disabled:hover:bg-brand-text px-6 py-3 rounded-sm font-space text-[10px] uppercase tracking-widest font-bold transition-all flex items-center gap-2">
               {isRunning ? 'System Active...' : 'Execute Agents'}
             </button>
          )}
        </div>
      </div>

      {/* GRAPH CONTAINER */}
      <div className="flex-1 flex items-center justify-center min-h-[300px]">
        <div className="flex items-center w-full max-w-4xl px-8">
           
           <PipelineNode 
             icon={Database} 
             label="Context Ingress" 
             status={n1} 
             subtext={`${contextCount} Linked Inputs`} 
           />
           
           <Connector active={hasContext && !isRunning} animate={isRunning} />
           
           <PipelineNode 
             icon={Cog} 
             label="Agent Synthesis" 
             status={n2} 
             subtext={isRunning ? 'Processing 9 Agents' : 'Awaiting Execution'} 
           />
           
           <Connector active={brdIsReady} animate={isRunning} />
           
           <PipelineNode 
             icon={FileText} 
             label="BRD Output" 
             status={n3} 
             subtext={brdIsReady ? 'Document Compiled' : 'Pending'} 
           />
           
        </div>
      </div>

      {/* METADATA OVERLAY (Optional decorative elements) */}
      <div className="absolute bottom-6 right-6 flex items-center gap-3">
         <div className="px-3 py-1 bg-brand-input border border-brand-border font-space text-[9px] uppercase tracking-widest text-[#00ff9d] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff9d] animate-pulse"></span>
            Graph Connection Live
         </div>
      </div>
    </div>
  )
}

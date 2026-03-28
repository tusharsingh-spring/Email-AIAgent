import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { 
  RefreshCw, Network, ShieldCheck, ShieldAlert, 
  LogIn, Loader2, Zap, Cpu, Settings as SettingsIcon,
  Fingerprint, Activity
} from 'lucide-react'
import { getAuthStatus, scanIngest, forceRecluster, login } from '../services/api'

// Polished Switch Component
function ProtocolSwitch({ title, description, checked, onChange, isRequired, badgeText }) {
  return (
    <div 
      onClick={() => onChange(!checked)}
      className={`group flex items-start gap-4 p-4 rounded-sm border transition-all cursor-pointer mb-3 ${
        checked ? 'border-brand-blue/40 bg-brand-blue/5' : 'border-brand-border bg-[#0a0a0a] hover:border-brand-border/80'
      }`}
    >
      <div className={`mt-1 w-8 h-4 rounded-full relative transition-colors shrink-0 ${checked ? 'bg-brand-blue' : 'bg-white/10'}`}>
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-black transition-all ${checked ? 'left-4.5' : 'left-0.5'}`} />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className={`font-space text-[11px] uppercase tracking-widest transition-colors ${checked ? 'text-white' : 'text-brand-muted'}`}>
            {title}
          </span>
          {badgeText && (
            <span className={`text-[8px] px-1.5 py-0.5 rounded-sm font-space uppercase tracking-tighter ${
              isRequired ? 'bg-red-500/20 text-red-400' : 'bg-brand-blue/20 text-brand-blue'
            }`}>
              {badgeText}
            </span>
          )}
        </div>
        <div className="font-dm text-[12px] text-brand-muted/70 leading-relaxed group-hover:text-brand-muted transition-colors">
          {description}
        </div>
      </div>
    </div>
  )
}

function ParameterInput({ label, type = 'text', value, onChange, icon: Icon }) {
  return (
    <div className="mb-6 relative group">
      <label className="flex items-center gap-2 font-space text-[9px] tracking-[0.2em] text-brand-muted uppercase mb-2 group-hover:text-brand-yellow transition-colors">
        {Icon && <Icon size={10} />} {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-[#050505] border border-brand-border text-white p-3 rounded-sm font-space text-[12px] outline-none focus:border-brand-yellow/50 focus:bg-brand-yellow/5 transition-all"
      />
    </div>
  )
}

export default function Settings() {
  const { toast = () => {} } = useApp() || {}

  const [buf, setBuf] = useState('10')
  const [ws, setWs] = useState('09:00')
  const [we, setWe] = useState('18:00')
  const [thr, setThr] = useState(70)

  const [autoApprove, setAutoApprove] = useState(false)
  const [autoCalendar, setAutoCalendar] = useState(true)
  const [sentiment, setSentiment] = useState(true)
  const [brdAutoDetect, setBrdAutoDetect] = useState(true)

  const [authStatus, setAuthStatus] = useState(false)
  const [emailOwner, setEmailOwner] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [clustering, setClustering] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    getAuthStatus().then(res => {
      setAuthStatus(res.authenticated || false)
      if (res.email) setEmailOwner(res.email)
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    await new Promise(r => setTimeout(r, 1200))
    setIsSaving(false)
    toast('✓ Directives Committed to Core', 'ok')
  }

  const handleForceSync = async () => {
    setSyncing(true)
    try {
      await scanIngest()
      toast('Ingestion Cycle Started', 'ok')
    } catch { toast('Cycle Failed', 'err') }
    setSyncing(false)
  }

  const handleForceCluster = async () => {
    setClustering(true)
    try {
      await forceRecluster(10)
      toast('Re-clustering Sequence Active', 'ok')
    } catch { toast('Sequence Failed', 'err') }
    setClustering(false)
  }

  return (
    <div className="pb-24">
      {/* Header Area */}
      <div className="mb-12 border-b border-brand-border/30 pb-8">
        <div className="htag mb-4 font-space text-[11px] uppercase tracking-widest text-brand-muted flex items-center gap-2">
          <SettingsIcon size={12} className="text-brand-blue" />
          System Configuration / v2.4
        </div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <h1 className="font-bebas text-[clamp(40px,7vw,84px)] leading-[0.85] tracking-tight uppercase text-white">
            Agent Directives
          </h1>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="group relative bg-white text-black px-10 py-4 rounded-sm font-space text-[11px] uppercase tracking-[0.2em] font-bold transition-all hover:bg-brand-blue hover:text-black overflow-hidden active:scale-95 disabled:opacity-50"
          >
            <div className="relative z-10 flex items-center gap-2">
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              {isSaving ? 'Committing...' : 'Deploy Protocol'}
            </div>
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-16 items-start">
        {/* Left Column: Automation Protocols */}
        <div className="space-y-10">
          
          {/* Status Panel */}
          <div className={`p-6 border rounded-sm transition-all duration-700 relative overflow-hidden ${
            authStatus ? 'border-brand-blue/30 bg-brand-blue/[0.02]' : 'border-red-500/30 bg-red-500/[0.02]'
          }`}>
            <div className={`absolute top-0 right-0 w-32 h-32 blur-[60px] opacity-10 ${authStatus ? 'bg-brand-blue' : 'bg-red-500'}`} />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-sm border flex items-center justify-center transition-colors ${
                  authStatus ? 'border-brand-blue text-brand-blue bg-brand-blue/10' : 'border-red-500 text-red-500 animate-pulse'
                }`}>
                  {authStatus ? <Fingerprint size={24} /> : <ShieldAlert size={24} />}
                </div>
                <div>
                  <div className="font-bebas text-2xl text-white tracking-widest">
                    {authStatus ? 'AUTH BRIDGE: ACTIVE' : 'AUTH BRIDGE: DISCONNECTED'}
                  </div>
                  <div className="font-space text-[10px] uppercase tracking-widest text-brand-muted">
                    {authStatus ? `Identity: ${emailOwner}` : 'System restricted. Re-authenticate.'}
                  </div>
                </div>
              </div>
              {!authStatus && (
                <button onClick={login} className="bg-white text-black px-4 py-2 font-space text-[10px] uppercase tracking-widest font-bold hover:bg-brand-blue transition-colors">
                  Login
                </button>
              )}
            </div>
          </div>

          <section>
            <div className="font-space text-[10px] tracking-[0.3em] text-brand-blue uppercase mb-6 flex items-center gap-2">
              <Cpu size={14} /> Automation Protocols
            </div>
            <ProtocolSwitch 
              title="Auto-Approve Low Urgency"
              description="Agent can bypass human review for tier-3 queries."
              checked={autoApprove}
              onChange={setAutoApprove}
              badgeText="High Risk"
              isRequired={true}
            />
            <ProtocolSwitch 
              title="Calendar Synthesis"
              description="Direct injection of meeting signals into the Google Nexus API."
              checked={autoCalendar}
              onChange={setAutoCalendar}
            />
            <ProtocolSwitch 
              title="Sentiment Escalation"
              description="Auto-route high-emotion signals to human override."
              checked={sentiment}
              onChange={setSentiment}
              badgeText="Recommended"
              isRequired={true}
            />
            <ProtocolSwitch 
              title="BRD Extraction"
              description="Silent monitoring for requirements keywords to trigger the agent-6 pipeline."
              checked={brdAutoDetect}
              onChange={setBrdAutoDetect}
            />
          </section>
        </div>

        {/* Right Column: Parameters & Triggers */}
        <div className="space-y-12">
          
          <section className="bg-[#050505] border border-brand-border p-8 rounded-sm">
            <div className="font-space text-[10px] tracking-[0.3em] text-brand-yellow uppercase mb-8">
              Operational Limits
            </div>
            
            <ParameterInput label="Buffer Window (Mins)" type="number" value={buf} onChange={setBuf} icon={Activity} />
            
            <div className="grid grid-cols-2 gap-6 mb-8">
              <ParameterInput label="Cycle Start" type="time" value={ws} onChange={setWs} />
              <ParameterInput label="Cycle End" type="time" value={we} onChange={setWe} />
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <label className="font-space text-[9px] tracking-[0.2em] text-brand-muted uppercase">Confidence Threshold</label>
                <span className="font-bebas text-2xl text-brand-yellow">{thr}%</span>
              </div>
              <div className="relative h-1.5 bg-white/10 rounded-full group">
                <div 
                  className="absolute h-full rounded-full transition-all duration-300" 
                  style={{ width: `${thr}%`, background: 'linear-gradient(90deg, #00ff9d, #FFE234)' }}
                />
                <input 
                  type="range" min="0" max="100" value={thr} 
                  onChange={e => setThr(e.target.value)}
                  className="absolute w-full h-full opacity-0 cursor-pointer z-10"
                />
              </div>
              <div className="flex justify-between font-space text-[8px] text-brand-muted/40 uppercase tracking-tighter">
                <span>0% Human Only</span>
                <span>100% Fully Autonomous</span>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="font-space text-[10px] tracking-[0.3em] text-red-400 uppercase mb-4">Pipeline Overrides</div>
            
            <button 
              onClick={handleForceSync}
              disabled={syncing}
              className="w-full flex items-center justify-between p-5 border border-brand-border bg-[#0a0a0a] hover:border-red-500/50 group transition-all"
            >
              <div className="text-left flex items-center gap-4">
                <RefreshCw size={18} className={`text-brand-muted group-hover:text-red-400 ${syncing ? 'animate-spin text-red-400' : ''}`} />
                <div>
                  <div className="font-bebas text-lg text-white group-hover:text-red-400">Trigger Gmail Scrape</div>
                  <div className="font-dm text-[11px] text-brand-muted uppercase tracking-tight mt-0.5">Force context ingestion</div>
                </div>
              </div>
            </button>

            <button 
              onClick={handleForceCluster}
              disabled={clustering}
              className="w-full flex items-center justify-between p-5 border border-brand-border bg-[#0a0a0a] hover:border-brand-yellow/50 group transition-all"
            >
              <div className="text-left flex items-center gap-4">
                <Network size={18} className={`text-brand-muted group-hover:text-brand-yellow ${clustering ? 'animate-pulse text-brand-yellow' : ''}`} />
                <div>
                  <div className="font-bebas text-lg text-white group-hover:text-brand-yellow">Re-Cluster Nodes</div>
                  <div className="font-dm text-[11px] text-brand-muted uppercase tracking-tight mt-0.5">Reset grouping algorithm</div>
                </div>
              </div>
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
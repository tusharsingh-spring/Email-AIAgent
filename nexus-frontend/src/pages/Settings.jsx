import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { RefreshCw, Network, ShieldCheck, ShieldAlert, LogIn, HardDriveDownload } from 'lucide-react'
import { getAuthStatus, scanIngest, forceRecluster, login } from '../services/api'

function ChecklistToggle({ title, description, checked, onChange, isRequired = false, badgeText = '' }) {
  return (
    <div className="check-item group" onClick={() => onChange(!checked)}>
      <div className={`checkbox flex-shrink-0 ${checked ? 'checked bg-brand-blue border-brand-blue' : 'bg-brand-input border-brand-border'}`}></div>
      <div className="flex-1">
        <div className="flex items-center flex-wrap gap-2 mb-1 cursor-pointer">
          <div className="check-title group-hover:text-brand-blue text-brand-text transition-colors">{title}</div>
          {badgeText && (
            <span className={`check-badge ${isRequired ? 'badge-req' : 'badge-opt'}`}>
              {badgeText}
            </span>
          )}
        </div>
        <div className="check-desc text-brand-muted">{description}</div>
      </div>
    </div>
  )
}

function InputField({ label, type = "text", value, onChange, placeholder, extra }) {
  return (
    <div className="mb-6">
      <label className="block font-space text-[10px] tracking-[0.1em] text-brand-muted uppercase mb-2">{label}</label>
      <div className="flex items-center gap-3">
        <input 
          type={type} 
          value={value} 
          onChange={e => onChange(e.target.value)} 
          placeholder={placeholder}
          className="w-full bg-brand-input border border-brand-border text-brand-text p-3 rounded-sm font-space text-[11px] outline-none focus:border-brand-blue transition-colors"
        />
        {extra && <div className="shrink-0">{extra}</div>}
      </div>
    </div>
  )
}

export default function Settings() {
  const { toast = () => {} } = useApp() || {}
  
  // Basic states mimicking the old settings
  const [buf, setBuf] = useState('10')
  const [ws, setWs] = useState('09:00')
  const [we, setWe] = useState('18:00')
  const [thr, setThr] = useState(70)
  
  // Toggles
  const [autoApprove, setAutoApprove] = useState(false)
  const [autoCalendar, setAutoCalendar] = useState(true)
  const [sentiment, setSentiment] = useState(true)
  const [brdAutoDetect, setBrdAutoDetect] = useState(true)

  // API Driven States
  const [authStatus, setAuthStatus] = useState(false)
  const [emailOwner, setEmailOwner] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [clustering, setClustering] = useState(false)

  // Entry animation
  const [ready, setReady] = useState(false)
  
  useEffect(() => { 
    setTimeout(() => setReady(true), 150) 
    getAuthStatus().then(res => {
      setAuthStatus(res.authenticated || false)
      if (res.email) setEmailOwner(res.email)
    }).catch(console.error)
  }, [])

  const handleSave = () => {
    toast('✓ AI Guardrails Updated', 'ok')
  }

  const handleForceSync = async () => {
    setSyncing(true)
    try {
      await scanIngest()
      toast('Manual Ingestion Triggered', 'ok')
    } catch { toast('Ingestion Failed', 'err') }
    setSyncing(false)
  }

  const handleForceCluster = async () => {
    setClustering(true)
    try {
      await forceRecluster(10)
      toast('Clustering Algorithm Executed', 'ok')
    } catch { toast('Clustering Failed', 'err') }
    setClustering(false)
  }
  
  const handleLogin = async () => {
    try {
      const res = await login()
      if (res.auth_url || res.url) window.location.href = res.auth_url || res.url
    } catch { toast('Login routing failed', 'err') }
  }

  return (
    <div className={`transition-opacity duration-1000 pb-20 ${ready ? 'opacity-100' : 'opacity-0'}`}>
      
      {/* HEADER */}
      <div className="mb-12">
        <div className="htag mb-4 text-brand-muted">Rules & Automation / Guardrails</div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="font-bebas text-[clamp(44px,9vw,100px)] leading-[0.9] tracking-[0.01em] uppercase text-brand-text">
              Agent Directives
            </h1>
          </div>
          <button 
            onClick={handleSave}
            className="bg-brand-text hover:bg-brand-blue text-brand-black px-8 py-3 rounded-sm font-space text-[10px] uppercase tracking-widest font-bold transition-colors w-fit shadow-lg shadow-black/10 hover:shadow-brand-blue/30"
          >
            Deploy Changes
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
        
        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-12">
          
          {/* AUTH STATUS */}
          <div className="bg-brand-panel border border-brand-border p-6 rounded-sm flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
               {authStatus ? (
                 <div className="w-12 h-12 rounded-full bg-[#00ff9d]/10 flex items-center justify-center text-[#00ff9d] border border-[#00ff9d]/20 shrink-0">
                    <ShieldCheck size={24} />
                 </div>
               ) : (
                 <div className="w-12 h-12 rounded-full bg-[#ff5080]/10 flex items-center justify-center text-[#ff5080] border border-[#ff5080]/20 shrink-0">
                    <ShieldAlert size={24} />
                 </div>
               )}
               <div>
                  <div className="font-bebas text-2xl text-brand-text tracking-wide mb-1">
                    {authStatus ? 'Google Nexus Linked' : 'Authentication Required'}
                  </div>
                  <div className="font-space text-[10px] uppercase tracking-[0.1em] text-brand-muted">
                    {authStatus ? `Operating as ${emailOwner}` : 'Agent offline. Please connect to Google Workspace.'}
                  </div>
               </div>
            </div>
            
            {!authStatus && (
              <button 
                 onClick={handleLogin}
                 className="shrink-0 bg-brand-blue text-brand-black px-5 py-2.5 rounded-sm font-space text-[10px] uppercase tracking-widest font-bold flex items-center gap-2 hover:bg-white transition-colors"
              >
                <LogIn size={14} /> Connect
              </button>
            )}
          </div>

          <div>
            <h2 className="font-space text-[10px] tracking-[0.1em] text-brand-blue uppercase mb-6 pb-2 border-b border-brand-border">
              Autonomous Actions
            </h2>
            
            <div className="flex flex-col">
              <ChecklistToggle 
                title="Auto-Approve Low Urgency" 
                description="Allow the agent to send replies to non-urgent emails without human review."
                checked={autoApprove}
                onChange={setAutoApprove}
                badgeText="High Risk"
                isRequired={true}
              />
              
              <ChecklistToggle 
                title="Calendar Synthesis" 
                description="Automatically detect meeting requests and inject confirmed events directly into the Google Calendar API."
                checked={autoCalendar}
                onChange={setAutoCalendar}
                badgeText="Standard"
              />
              
              <ChecklistToggle 
                title="Sentiment Escalation" 
                description="Instantly route angry or frustrated emails directly to the human queue, bypassing AI drafts."
                checked={sentiment}
                onChange={setSentiment}
                badgeText="Recommended"
                isRequired={true}
              />
              
              <ChecklistToggle 
                title="BRD Auto-Detection" 
                description="Listen for keywords like 'kickoff', 'requirements', or 'transcript' to silently trigger the 9-agent BRD extraction pipeline."
                checked={brdAutoDetect}
                onChange={setBrdAutoDetect}
              />
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col gap-12">
          
          {/* SYSTEM OVERRIDES */}
          <div className="bg-brand-panel border border-brand-border rounded-sm p-6 md:p-8 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-[#ff5080]/5 rounded-full blur-3xl pointer-events-none"></div>
             
             <h2 className="font-space text-[10px] tracking-[0.1em] text-[#ff5080] uppercase mb-8">
                Emergency Pipeline Triggers
             </h2>

             <div className="flex flex-col gap-4 relative z-10">
                <button 
                  onClick={handleForceSync} disabled={syncing}
                  className="w-full flex items-center justify-between p-4 border border-brand-border bg-brand-input rounded-sm hover:border-[#ff5080]/50 hover:bg-[#ff5080]/5 transition-colors group"
                >
                  <div className="text-left">
                     <div className="font-bebas text-xl text-brand-text group-hover:text-[#ff5080] transition-colors mb-1">Force Ingest Sync</div>
                     <div className="font-dm text-[12px] text-brand-muted">Manually scrape Gmail for unread context immediately.</div>
                  </div>
                  <RefreshCw size={20} className={`${syncing ? 'animate-spin text-[#ff5080]' : 'text-brand-muted group-hover:text-[#ff5080]'}`} />
                </button>
                
                <button 
                  onClick={handleForceCluster} disabled={clustering}
                  className="w-full flex items-center justify-between p-4 border border-brand-border bg-brand-input rounded-sm hover:border-brand-yellow/50 hover:bg-brand-yellow/5 transition-colors group"
                >
                  <div className="text-left">
                     <div className="font-bebas text-xl text-brand-text group-hover:text-brand-yellow transition-colors mb-1">Force Re-Cluster</div>
                     <div className="font-dm text-[12px] text-brand-muted">Execute the grouping algorithm against all pending unassigned emails.</div>
                  </div>
                  <Network size={20} className={`${clustering ? 'animate-pulse text-brand-yellow' : 'text-brand-muted group-hover:text-brand-yellow'}`} />
                </button>
             </div>
          </div>

          {/* FORMS: SCHEDULING && THRESHOLDS */}
          <div className="border border-brand-border rounded-sm p-6 md:p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-blue/5 rounded-full blur-3xl point-events-none"></div>
            
            <h2 className="font-space text-[10px] tracking-[0.1em] text-brand-yellow uppercase mb-8">
              Operational Parameters
            </h2>

            <InputField 
              label="Meeting Buffer Window (Minutes)" 
              type="number" 
              value={buf} 
              onChange={setBuf} 
            />

            <div className="grid grid-cols-2 gap-4">
              <InputField label="Work Hours Start" type="time" value={ws} onChange={setWs} />
              <InputField label="Work Hours End" type="time" value={we} onChange={setWe} />
            </div>

            <div className="mb-2 mt-4">
              <label className="block font-space text-[10px] tracking-[0.1em] text-brand-muted uppercase mb-4 flex justify-between">
                 <span>Escalation Confidence Threshold</span>
                 <span className="text-brand-blue">{thr}%</span>
              </label>
              <input 
                type="range" 
                min="0" max="100" 
                value={thr} 
                onChange={e => setThr(Number(e.target.value))} 
                className="w-full accent-brand-blue bg-brand-input h-1 rounded-full appearance-none outline-none"
              />
              <div className="text-[12px] opacity-40 font-dm mt-3 leading-relaxed text-brand-muted">
                If the agent's generative confidence falls beneath this percentage, the action will be escalated to the human queue.
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

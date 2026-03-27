import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { Activity, MailQuestion, Calendar as CalIcon, ArrowRight, Layers } from 'lucide-react'
import { getActionsBySections, getPendingClusters, approveAction, editDraft, rejectAction } from '../services/api'

export default function Dashboard() {
  const appState = useApp() || {}
  const { state = { stats: {}, actions: [] }, dispatch, toast = () => {} } = appState
  const { stats } = state
  
  const [sections, setSections] = useState({})
  const [clusters, setClusters] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [draftEdits, setDraftEdits] = useState({})
  
  const [ready, setReady] = useState(false)
  
  useEffect(() => { 
    setTimeout(() => setReady(true), 150)
    
    // Fetch mapped data
    getActionsBySections().then(data => setSections(data || {})).catch(console.error)
    getPendingClusters().then(data => setClusters(data || [])).catch(console.error)
  }, [])

  const handleDraftChange = (id, val) => {
    setDraftEdits(prev => ({...prev, [id]: val}))
  }

  const handleApprove = async (action, originalDraft) => {
    const id = action.action_id
    try {
      const finalDraft = draftEdits[id] !== undefined ? draftEdits[id] : originalDraft
      
      // If user edited it, save the draft first via PUT
      if (draftEdits[id] !== undefined) {
         await editDraft(id, { final_response: finalDraft })
      }
      
      // Approve via POST
      await approveAction(id, { final_response: finalDraft })
      
      toast('✓ Action Approved & Sent', 'ok')
      
      // Remove from UI
      setSections(prev => {
        const next = {...prev}
        for (let key in next) {
           next[key] = next[key].filter(a => a.action_id !== id)
        }
        return next
      })
      setExpandedId(null)
    } catch (e) {
      toast('Failed to approve', 'err')
      console.error(e)
    }
  }

  const handleReject = async (id) => {
    try {
      await rejectAction(id)
      toast('✕ Action Rejected', 'ok')
      setSections(prev => {
        const next = {...prev}
        for (let key in next) {
           next[key] = next[key].filter(a => a.action_id !== id)
        }
        return next
      })
      setExpandedId(null)
    } catch (e) {
      console.error(e)
    }
  }

  // Calculate totals from the dynamic sections
  const allPending = Object.values(sections).filter(Array.isArray).flat()
  const escalations = Array.isArray(sections['Escalation']) ? sections['Escalation'] : []

  return (
    <div className={`transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'}`}>
      
      {/* HEADER SECTION */}
      <div className="mb-16 md:mb-24 mt-8">
        <div className="htag mb-4 text-brand-muted">Command Center / Daily Briefing</div>
        <h1 className="font-bebas text-[clamp(48px,12vw,120px)] leading-[0.88] tracking-[-0.01em] uppercase mb-6">
          <span className="block translate-y-0 text-brand-muted">Good Morning</span>
          <span className="block translate-y-0 text-brand-blue">Commander</span>
        </h1>
        
        <p className="text-[clamp(15px,2vw,19px)] leading-[1.78] text-brand-muted max-w-2xl font-dm">
          I've automatically drafted {allPending.length} replies, analyzed {clusters.length} project clusters, and encountered {escalations.length} issues needing your attention.
        </p>

        {/* Quick Stats Tags */}
        <div className="flex flex-wrap gap-2.5 mt-8">
          <span className="bg-brand-black text-brand-yellow font-space text-[10px] tracking-[0.1em] uppercase py-2 px-4 border border-brand-border rounded-sm inline-flex items-center gap-2">
            <Activity size={12} /> {stats.total_processed || 0} Processed
          </span>
          <span className="bg-brand-black text-brand-blue font-space text-[10px] tracking-[0.1em] uppercase py-2 px-4 border border-brand-border rounded-sm inline-flex items-center gap-2">
            <CalIcon size={12} /> {stats.total_meetings || 0} Meetings
          </span>
          {escalations.length > 0 && (
            <span className="bg-[rgba(255,0,80,0.1)] text-[#ff5080] font-space text-[10px] tracking-[0.1em] uppercase py-2 px-4 border border-[#ff5080]/20 rounded-sm inline-flex items-center gap-2">
              <MailQuestion size={12} /> {escalations.length} Escalations
            </span>
          )}
          {clusters.length > 0 && (
            <span className="bg-[rgba(0,255,157,0.1)] text-[#00ff9d] font-space text-[10px] tracking-[0.1em] uppercase py-2 px-4 border border-[#00ff9d]/20 rounded-sm inline-flex items-center gap-2">
              <Layers size={12} /> {clusters.length} Suggested Clusters
            </span>
          )}
        </div>
      </div>

      {/* CLUSTER SUGGESTIONS */}
      {clusters.length > 0 && (
        <div className="mb-16">
           <div className="flex items-center gap-4 mb-8">
             <div className="snum !mb-0 text-[#00ff9d] scale-150 transform origin-left">01</div>
             <h2 className="stitle !mb-0 text-brand-text">Project Clustering</h2>
           </div>
           <div className="grid md:grid-cols-2 gap-4">
              {clusters.map((c, i) => (
                <div key={i} className="bg-brand-panel border border-brand-border p-6 rounded-sm hover:-translate-y-1 transition-transform cursor-pointer hover:border-[#00ff9d] group">
                   <div className="font-space text-[10px] text-[#00ff9d] uppercase mb-2 tracking-widest">{c.email_ids?.length || 0} Emails Found</div>
                   <h3 className="font-bebas text-3xl text-brand-text mb-4 group-hover:text-[#00ff9d] transition-colors">{c.suggested_title || 'Untitled Cluster'}</h3>
                   <button className="text-[11px] font-space uppercase border border-[#00ff9d]/30 text-[#00ff9d] px-4 py-2 rounded-sm w-full hover:bg-[#00ff9d] hover:text-brand-black transition-colors font-bold">
                     Create Project Workspace
                   </button>
                </div>
              ))}
           </div>
        </div>
      )}

      {/* THE STREAM: PENDING ACTIONS BY SECTION */}
      <div className="mb-16">
        <div className="flex items-center gap-4 mb-8">
          <div className="snum !mb-0 text-brand-blue scale-150 transform origin-left">{clusters.length > 0 ? '02' : '01'}</div>
          <h2 className="stitle !mb-0 text-brand-text">Needs Approval</h2>
        </div>

        {allPending.length === 0 ? (
          <div className="py-12 border-y border-brand-border text-center text-brand-muted font-space text-xs uppercase tracking-widest">
            ALL CLEAR. No pending actions.
          </div>
        ) : (
          <div className="flex flex-col gap-12">
            {Object.entries(sections).map(([sectionName, sectActions]) => {
              if (!Array.isArray(sectActions) || sectActions.length === 0) return null;
              
              return (
                <div key={sectionName}>
                  <div className="border border-brand-border rounded-md overflow-hidden bg-brand-panel">
                    {/* Section Header */}
                    <div className="bg-brand-black/50 border-b border-brand-border px-6 py-3 font-space text-[11px] text-brand-muted uppercase tracking-[0.2em] flex justify-between items-center">
                      <span>{sectionName}</span>
                      <span className="text-brand-blue">{sectActions.length} Pending</span>
                    </div>

                    <div className="flex flex-col">
                      {sectActions.map((action, i) => {
                        const intention = action.agent_state?.intent?.category || action.action_type || 'General'
                        const isExpanded = expandedId === action.action_id
                        const draftText = draftEdits[action.action_id] !== undefined 
                          ? draftEdits[action.action_id] 
                          : (action.agent_state?.final_response || '')

                        return (
                          <div 
                            key={action.action_id} 
                            className={`border-b border-brand-border transition-all duration-300 last:border-b-0
                              ${isExpanded ? 'bg-brand-input' : 'hover:bg-brand-hover cursor-pointer'}`}
                            onClick={() => !isExpanded && setExpandedId(action.action_id)}
                          >
                            <div className="grid grid-cols-[50px_1fr] md:grid-cols-[72px_1fr]">
                              <div className="flex items-start justify-center pt-6 md:pt-8 font-bebas text-2xl md:text-3xl text-brand-blue opacity-40 border-r border-brand-border">
                                {String(i + 1).padStart(2, '0')}
                              </div>
                              <div className="p-5 md:p-8">
                                <div className="flex justify-between items-start flex-wrap gap-4 mb-2">
                                  <div>
                                    <h3 className="font-bebas text-[clamp(20px,2.5vw,28px)] text-brand-text tracking-[0.02em] leading-none mb-2 uppercase">
                                      {action.email_context?.sender_name || action.email_context?.sender || 'Unknown Target'}
                                    </h3>
                                    <div className="font-space text-[9px] tracking-[0.1em] text-brand-blue border border-brand-blue/20 bg-brand-blue/5 px-2 py-0.5 rounded-sm inline-block uppercase">
                                      Intent: {intention.replace('_', ' ')}
                                    </div>
                                  </div>
                                  {action.email_context && (
                                    <div className="text-right">
                                      <div className="text-xs text-brand-muted md:w-64 truncate">
                                        Subj: {action.email_context.subject}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Expanding Content */}
                                <div className={`grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isExpanded ? 'grid-rows-[1fr] opacity-100 mt-6' : 'grid-rows-[0fr] opacity-0 mt-0'}`}>
                                  <div className="overflow-hidden">
                                    
                                    <div className="grid md:grid-cols-2 gap-6 bg-brand-black border border-brand-border rounded-sm p-4 md:p-6 mb-6">
                                      {/* Original */}
                                      <div>
                                        <div className="font-space text-[10px] tracking-[0.1em] text-brand-muted uppercase mb-3">// Original Message Context</div>
                                        <p className="text-[13px] text-brand-muted leading-[1.65] font-dm line-clamp-6">
                                          {action.email_context?.body_snippet || action.email_context?.body || 'No snippet available...'}
                                        </p>
                                      </div>
                                      
                                      {/* Draft */}
                                      <div>
                                        <div className="font-space text-[10px] tracking-[0.1em] text-brand-blue uppercase mb-3">// AI Drafted Reply</div>
                                        <textarea 
                                          className="w-full h-40 bg-transparent text-[13px] text-brand-text leading-[1.65] font-dm border-none outline-none resize-none focus:ring-0 p-0"
                                          value={draftText}
                                          onChange={e => handleDraftChange(action.action_id, e.target.value)}
                                        />
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); handleApprove(action, action.agent_state?.final_response || '') }}
                                        className="bg-brand-blue hover:bg-brand-text text-black px-6 py-3 rounded-sm font-space text-[11px] uppercase tracking-widest font-bold transition-colors flex items-center gap-2"
                                      >
                                        Approve & Send <ArrowRight size={14} />
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); handleReject(action.action_id) }}
                                        className="px-4 py-3 text-brand-muted hover:text-[#ff5080] font-space text-[11px] uppercase tracking-widest transition-colors"
                                      >
                                        Reject Draft
                                      </button>
                                      <div className="flex-1"></div>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setExpandedId(null) }}
                                        className="px-4 py-3 text-brand-muted hover:text-brand-text font-space text-[11px] uppercase tracking-widest transition-colors"
                                      >
                                        Close
                                      </button>
                                    </div>

                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}

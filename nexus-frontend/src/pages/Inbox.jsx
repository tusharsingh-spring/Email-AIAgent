import { useEffect, useState, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { getEmails, processEmail, clusterManual, getProjects, attachEmailToProject } from '../services/api'
import { Inbox as InboxIcon, RefreshCw, Loader2, X, Link, Cpu, CheckSquare } from 'lucide-react'

const FT = iso => {
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return iso || '' }
}

const initials = (sender = '') => {
  const name = sender.split('@')[0]
  return name.slice(0, 2).toUpperCase() || 'EX'
}

function EmailRow({ email, isSelected, onSelect, onClick, isOpen, projects, onAssign, onProcess }) {
  const [selProject, setSelProject] = useState(email.project_suggestion?.project_id || '')
  const [assigning, setAssigning] = useState(false)

  const ini = initials(email.sender)

  const handleAssign = async (e) => {
    e.stopPropagation()
    if (!selProject) return
    setAssigning(true)
    await onAssign(email.id, selProject)
    setAssigning(false)
  }

  return (
    <div
      className={`border-b border-white/5 last:border-0 cursor-pointer group transition-colors duration-200 ${isOpen ? 'bg-white/[0.02]' : 'hover:bg-white/[0.02]'}`}
      onClick={onClick}
    >
      <div className="flex items-start gap-4 p-5">
        <div className="pt-1 shrink-0" onClick={e => { e.stopPropagation(); onSelect(email.id) }}>
          <div className={`w-4 h-4 rounded border transition-colors flex items-center justify-center ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-white/20 bg-transparent group-hover:border-white/40'}`}>
            {isSelected && <CheckSquare size={12} className="text-white opacity-0" />}
            {isSelected && (
              <svg className="w-3 h-3 text-white absolute" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>

        <div className="w-9 h-9 rounded-full flex items-center justify-center font-mono text-xs font-semibold shrink-0 bg-white/10 text-zinc-300">
          {ini}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-sans text-lg font-medium text-zinc-100 truncate">
              {(email.sender || '').split('@')[0] || 'Unknown'}
            </span>
            <span className="font-mono text-[11px] text-zinc-500 shrink-0">{FT(email.received_at || email.date)}</span>
          </div>
          <div className="font-sans text-sm text-zinc-400 truncate mb-1">{email.subject || '—'}</div>
          {!isOpen && <div className="font-sans text-sm text-zinc-600 line-clamp-1">{email.snippet || ''}</div>}

          {!isOpen && email.project_suggestion && !email.project_id && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[10px] uppercase tracking-widest text-purple-400 border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 rounded font-medium">AI Suggestion</span>
              <span className="font-sans text-sm text-zinc-300">{email.project_suggestion.project_name}</span>
            </div>
          )}

          {!isOpen && email.project_id && (
            <div className="mt-2 font-mono text-[10px] text-emerald-400 uppercase tracking-widest font-medium border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 rounded inline-block">✓ Linked</div>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.35s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          {isOpen && (
            <div className="pl-[76px] pr-5 pb-6 pt-0" onClick={e => e.stopPropagation()}>
              
              <div className="font-mono text-[11px] text-zinc-500 mb-4 flex items-center gap-2">
                <span>From:</span> <span className="text-zinc-300 font-sans text-sm">{email.sender}</span>
              </div>

              <div className="font-sans text-sm leading-relaxed text-zinc-400 bg-[#121214] border border-white/5 p-4 rounded-lg mb-6 max-h-[300px] overflow-y-auto whitespace-pre-wrap shadow-inner">
                {email.body || email.snippet || '(empty)'}
              </div>

              {/* FIXED LAYOUT: Switched to robust flexbox instead of grid to prevent overlapping */}
              <div className="flex flex-col lg:flex-row gap-4 items-stretch">
                
                {/* Assignment Card */}
                <div className="flex-1 bg-[#121214] border border-white/5 rounded-lg p-5 shadow-inner flex flex-col">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-4 font-medium">Assignment</div>
                  
                  {email.project_suggestion && !email.project_id && (
                    <div className="mb-4 bg-purple-500/5 border border-purple-500/20 rounded-md p-3">
                      <div className="font-mono text-[10px] text-purple-400 uppercase tracking-widest mb-1 font-medium">AI Match</div>
                      <div className="font-sans text-sm text-zinc-200">{email.project_suggestion.project_name}</div>
                      {email.project_suggestion.reason && <div className="font-sans text-xs text-zinc-500 mt-1">{email.project_suggestion.reason}</div>}
                    </div>
                  )}

                  <div className="mt-auto flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 min-w-0 relative">
                      <select
                        value={selProject}
                        onChange={e => setSelProject(e.target.value)}
                        className="w-full bg-zinc-900 border border-white/10 text-zinc-300 font-sans text-sm pl-3 pr-8 py-2.5 rounded-md outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all appearance-none truncate"
                        disabled={assigning}
                      >
                        <option value="">— Select project —</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      {/* Custom caret for the select input */}
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                    
                    <button
                      onClick={handleAssign}
                      disabled={!selProject || assigning}
                      className="shrink-0 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-md font-sans text-sm font-medium transition-colors disabled:opacity-50 shadow-sm"
                    >
                      {assigning ? <Loader2 size={16} className="animate-spin" /> : <Link size={16} />}
                      {email.project_id ? 'Update' : 'Assign'}
                    </button>
                  </div>
                  
                  {email.project_id && (
                    <div className="mt-3 font-mono text-[11px] text-emerald-400">✓ Currently linked</div>
                  )}
                </div>

                {/* Automation Card */}
                <div className="lg:w-72 shrink-0 bg-[#121214] border border-white/5 rounded-lg p-5 shadow-inner flex flex-col">
                   <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-4 font-medium">Automation</div>
                   <p className="font-sans text-sm text-zinc-500 mb-4 flex-1">
                     Send this email through the agent pipeline to automatically extract tasks or draft replies.
                   </p>
                   <button
                    onClick={() => onProcess(email.id)}
                    className="w-full mt-auto flex justify-center items-center gap-2 border border-white/10 text-zinc-300 bg-white/5 hover:bg-white/10 px-4 py-2.5 rounded-md font-sans text-sm font-medium transition-colors"
                  >
                    <Cpu size={16} className="text-blue-400" /> Process via LangGraph
                  </button>
                </div>

              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Inbox() {
  const { state, dispatch, toast, addLog } = useApp() || {}
  const [loading, setLoading] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [projects, setProjects] = useState([])
  const [clusterModal, setClusterModal] = useState(false)
  const [clusterName, setClusterName] = useState('')
  const clusterRef = useRef(null)

  useEffect(() => {
    loadEmails()
    loadProjects()
  }, [])

  useEffect(() => {
    if (clusterModal) setTimeout(() => clusterRef.current?.focus(), 50)
  }, [clusterModal])

  const loadEmails = async () => {
    setLoading(true)
    addLog?.('info', 'Fetching real Gmail inbox...')
    try {
      const d = await getEmails(10)
      if (d.error) { toast?.(d.error, 'warn'); addLog?.('error', d.error); setLoading(false); return }
      dispatch?.({ type: 'SET_EMAILS', emails: d.emails || [] })
      addLog?.('ok', `${(d.emails || []).length} emails fetched`)
    } catch { toast?.('Backend not running', 'warn') }
    setLoading(false)
  }

  const loadProjects = async () => {
    try { const d = await getProjects(); setProjects(d.projects || []) } catch {}
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleCluster = async () => {
    if (!clusterName.trim() || !selectedIds.size) return
    try {
      const r = await clusterManual(Array.from(selectedIds), clusterName.trim())
      if (r.error) { toast?.(r.error, 'warn'); return }
      toast?.(`Clustered ${selectedIds.size} emails into "${clusterName.trim()}"`, 'ok')
      setSelectedIds(new Set())
      setClusterModal(false)
      setClusterName('')
    } catch { toast?.('Cluster failed', 'warn') }
  }

  const handleAssign = async (emailId, projectId) => {
    if (!projectId) { toast?.('Select a project first', 'warn'); return }
    try {
      const res = await attachEmailToProject(projectId, emailId)
      if (res.error) throw new Error(res.error)
      toast?.('Email linked to project', 'ok')
      addLog?.('ok', `Email ${emailId} → project ${projectId}`)
      dispatch?.({ type: 'SET_EMAILS', emails: (state?.emails || []).map(e => e.id === emailId ? { ...e, project_id: projectId } : e) })
    } catch (e) { toast?.(e.message || 'Attach failed', 'warn') }
  }

  const handleProcess = async (id) => {
    try { await processEmail(id); toast?.('Processing triggered', 'ok'); addLog?.('info', `Manual trigger: ${id}`) }
    catch { toast?.('Failed', 'warn') }
  }

  const emails = state?.emails || []
  const hasSelected = selectedIds.size > 0

  return (
    <div className="min-h-screen pb-24 font-sans text-zinc-100 selection:bg-blue-500/30">

      <div className="max-w-6xl mx-auto pt-12 px-6 lg:px-8 mb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="font-mono text-[11px] text-zinc-500 uppercase tracking-widest mb-2 font-medium">Communication</div>
            <h1 className="font-sans text-4xl font-semibold tracking-tight text-white flex items-center gap-3">
              <InboxIcon className="text-zinc-500" size={32} /> Inbox
            </h1>
          </div>
          
          <button
            onClick={loadEmails}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-sm font-medium text-zinc-300 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {loading ? 'Fetching...' : 'Fetch Emails'}
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        <div className="bg-[#0a0a0a] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
          <div className="bg-white/[0.02] border-b border-white/10 px-6 py-3 flex items-center justify-between min-h-[50px]">
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 font-medium">
              {emails.length} messages
            </span>
            
            {hasSelected && (
              <div className="flex items-center gap-4 animate-in fade-in duration-200">
                <span className="font-sans text-sm text-blue-400 font-medium">{selectedIds.size} selected</span>
                <button
                  onClick={() => setClusterModal(true)}
                  className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-md text-xs font-semibold transition-colors border border-white/10"
                >
                  <CheckSquare size={14} /> Cluster Selected
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-zinc-500 hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>

          {emails.length > 0 ? (
            <div className="flex flex-col">
              {emails.map(e => (
                <EmailRow
                  key={e.id}
                  email={e}
                  isSelected={selectedIds.has(e.id)}
                  onSelect={toggleSelect}
                  onClick={() => setOpenId(openId === e.id ? null : e.id)}
                  isOpen={openId === e.id}
                  projects={projects}
                  onAssign={handleAssign}
                  onProcess={handleProcess}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
              <div className="p-4 rounded-full bg-white/5 border border-white/5">
                <InboxIcon size={32} className="text-zinc-600" />
              </div>
              <div className="font-sans text-lg text-zinc-400 font-medium">
                {loading ? 'Fetching emails...' : 'Inbox is empty'}
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-out ${
          hasSelected ? 'translate-y-0 opacity-100' : 'translate-y-16 opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-4 bg-[#121214]/90 backdrop-blur-md border border-white/10 shadow-2xl rounded-full px-6 py-3">
          <span className="font-sans text-sm font-medium text-zinc-200">{selectedIds.size} Selected</span>
          <div className="w-px h-5 bg-white/10"></div>
          <button
            onClick={() => setClusterModal(true)}
            className="flex items-center gap-2 bg-white text-black px-4 py-1.5 rounded-full font-sans text-sm font-semibold hover:bg-zinc-200 transition-colors"
          >
            <CheckSquare size={16} /> Create Cluster
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="p-1.5 text-zinc-500 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {clusterModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setClusterModal(false)}
        >
          <div
            className="bg-[#121214] border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="font-mono text-[10px] uppercase tracking-widest text-blue-400 mb-2 font-medium">Manual Action</div>
            <h3 className="font-sans text-xl font-semibold text-white mb-6">Name this Cluster</h3>
            <input
              ref={clusterRef}
              type="text"
              placeholder="e.g. Q3 Roadmap Review"
              value={clusterName}
              onChange={e => setClusterName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCluster(); if (e.key === 'Escape') setClusterModal(false) }}
              className="w-full bg-[#0a0a0a] border border-white/10 text-white px-4 py-3 rounded-lg font-sans text-base outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all mb-6 placeholder:text-zinc-600"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => setClusterModal(false)}
                className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 rounded-lg font-sans text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCluster}
                disabled={!clusterName.trim()}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-sans text-sm font-medium transition-colors disabled:opacity-50 shadow-sm"
              >
                Cluster {selectedIds.size} Items
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
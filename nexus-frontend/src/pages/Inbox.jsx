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

const avatarColor = (sender = '') => {
  let h = 0
  for (let i = 0; i < sender.length; i++) h = (h * 31 + sender.charCodeAt(i)) % 360
  return `hsl(${h},55%,45%)`
}

function EmailRow({ email, isSelected, onSelect, onClick, isOpen, projects, onAssign, onProcess }) {
  const [selProject, setSelProject] = useState(email.project_suggestion?.project_id || '')
  const [assigning, setAssigning] = useState(false)

  const bg = avatarColor(email.sender || '')
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
      className="border-b border-brand-border last:border-0 cursor-pointer group transition-colors hover:bg-brand-hover"
      style={{ background: isOpen ? 'rgba(255,255,255,0.03)' : undefined }}
      onClick={onClick}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Checkbox */}
        <div className="pt-0.5 shrink-0" onClick={e => { e.stopPropagation(); onSelect(email.id) }}>
          <div className={`w-4 h-4 rounded-sm border transition-colors ${isSelected ? 'bg-brand-blue border-brand-blue' : 'border-brand-border hover:border-white/30'}`} />
        </div>

        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center font-space text-[10px] font-bold shrink-0"
          style={{ background: bg, color: 'rgba(0,0,0,0.8)' }}
        >
          {ini}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="font-bebas text-[18px] text-brand-text leading-none truncate">
              {(email.sender || '').split('@')[0] || 'Unknown'}
            </span>
            <span className="font-space text-[9px] text-brand-muted/40 shrink-0">{FT(email.received_at || email.date)}</span>
          </div>
          <div className="font-dm text-[12px] opacity-60 truncate mb-1">{email.subject || '—'}</div>
          <div className="font-dm text-[11px] opacity-30 line-clamp-1">{email.snippet || ''}</div>

          {email.project_id && (
            <div className="mt-1 font-space text-[9px] text-[#00ff9d]">✓ Linked to project</div>
          )}
        </div>
      </div>

      {/* Expanded */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.35s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          {isOpen && (
            <div className="px-4 pb-5 pt-0" onClick={e => e.stopPropagation()}>
              {/* Sender + date */}
              <div className="font-space text-[9px] text-brand-muted/30 mb-3">
                From: {email.sender} &nbsp;·&nbsp; {email.date || ''}
              </div>

              {/* Body */}
              <div className="font-dm text-[13px] leading-[1.65] opacity-60 bg-brand-input p-4 rounded-sm mb-4 max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                {email.body || email.snippet || '(empty)'}
              </div>

              {/* Project assignment */}
              {!email.project_id && (
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <select
                    value={selProject}
                    onChange={e => setSelProject(e.target.value)}
                    className="bg-brand-input border border-brand-border text-brand-text font-space text-[10px] px-3 py-2 rounded-sm outline-none focus:border-brand-blue transition-colors"
                    disabled={assigning}
                  >
                    <option value="">— Assign to project —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  {email.project_suggestion && (
                    <span className="font-space text-[9px] text-brand-blue/60">
                      AI suggests: {email.project_suggestion.project_name}
                    </span>
                  )}
                  <button
                    onClick={handleAssign}
                    disabled={!selProject || assigning}
                    className="flex items-center gap-1.5 bg-brand-blue text-brand-black px-4 py-2 rounded-sm font-space text-[9px] uppercase tracking-widest font-bold hover:bg-white transition-colors disabled:opacity-40"
                  >
                    {assigning ? <Loader2 size={10} className="animate-spin" /> : <Link size={10} />}
                    Assign
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onProcess(email.id)}
                  className="flex items-center gap-1.5 border border-brand-blue/40 text-brand-blue px-4 py-2 rounded-sm font-space text-[9px] uppercase tracking-widest hover:bg-brand-blue/10 transition-colors"
                >
                  <Cpu size={11} /> Process with LangGraph
                </button>
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
    <div className="pb-20">

      {/* HEADER */}
      <div className="mb-10">
        <div className="htag mb-4">Communication / Gmail</div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
          <h1 className="font-bebas text-[clamp(38px,6.5vw,80px)] leading-[0.9] tracking-[0.01em] uppercase text-brand-text">
            Real Inbox
          </h1>
          <button
            onClick={loadEmails}
            disabled={loading}
            className="flex items-center gap-2 border border-brand-border text-brand-muted hover:text-white hover:border-white/20 px-5 py-2.5 rounded-sm font-space text-[10px] uppercase tracking-widest transition-colors hover:scale-[1.02] active:scale-[0.98]"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {loading ? 'Fetching...' : 'Fetch Emails'}
          </button>
        </div>
      </div>

      {/* EMAIL LIST */}
      {emails.length > 0 ? (
        <div className="bg-brand-panel border border-brand-border rounded-sm overflow-hidden">
          {/* List header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-brand-border">
            <div className="font-space text-[9px] uppercase tracking-[0.2em] text-brand-muted/40">
              {emails.length} messages
            </div>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="font-space text-[9px] text-brand-blue">{selectedIds.size} selected</span>
                <button
                  onClick={() => setClusterModal(true)}
                  className="flex items-center gap-1.5 bg-brand-blue text-brand-black px-3 py-1.5 rounded-sm font-space text-[9px] uppercase tracking-widest font-bold hover:bg-white transition-colors"
                >
                  <CheckSquare size={10} /> Cluster & BRD
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-brand-muted/40 hover:text-white transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            )}
          </div>

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
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <InboxIcon size={48} style={{ color: 'rgba(255,255,255,0.08)' }} />
          <div className="font-space text-[10px] uppercase tracking-widest text-brand-muted/40">
            {loading ? 'Fetching emails from Gmail...' : 'Click "Fetch Emails" to load your real Gmail inbox'}
          </div>
        </div>
      )}

      {/* Floating selection bar */}
      <div
        style={{
          position: 'fixed',
          bottom: hasSelected ? '24px' : '-80px',
          left: '50%',
          transform: 'translateX(-50%)',
          transition: 'bottom 0.35s cubic-bezier(0.16,1,0.3,1)',
          zIndex: 8000,
        }}
        className="flex items-center gap-3 bg-[#111] border border-brand-border rounded-full px-5 py-3 shadow-2xl"
      >
        <span className="font-space text-[10px] text-brand-muted">{selectedIds.size} selected</span>
        <button
          onClick={() => setClusterModal(true)}
          className="flex items-center gap-1.5 bg-brand-blue text-brand-black px-4 py-1.5 rounded-full font-space text-[9px] uppercase tracking-widest font-bold hover:bg-white transition-colors"
        >
          <CheckSquare size={10} /> Cluster & BRD
        </button>
        <button
          onClick={() => setSelectedIds(new Set())}
          className="text-brand-muted/40 hover:text-white transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      {/* Cluster Modal */}
      {clusterModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}
          onClick={() => setClusterModal(false)}
        >
          <div
            className="bg-[#080808] border border-brand-border rounded-sm p-6 w-full max-w-[420px] mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="font-space text-[9px] uppercase tracking-[0.2em] text-brand-blue mb-1">Manual Cluster</div>
            <div className="font-bebas text-3xl text-brand-text mb-4">Name this Cluster</div>
            <input
              ref={clusterRef}
              type="text"
              placeholder="e.g. Website Rewrite Sprint"
              value={clusterName}
              onChange={e => setClusterName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCluster(); if (e.key === 'Escape') setClusterModal(false) }}
              className="w-full bg-brand-input border border-brand-border text-brand-text px-4 py-3 rounded-sm font-dm text-[14px] outline-none focus:border-brand-blue transition-colors mb-4"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={handleCluster}
                disabled={!clusterName.trim()}
                className="flex-1 bg-brand-blue text-brand-black py-2.5 rounded-sm font-space text-[10px] uppercase tracking-widest font-bold hover:bg-white transition-colors disabled:opacity-40"
              >
                Cluster {selectedIds.size} Emails
              </button>
              <button
                onClick={() => setClusterModal(false)}
                className="px-4 py-2.5 border border-brand-border text-brand-muted hover:text-white rounded-sm font-space text-[10px] uppercase tracking-widest transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

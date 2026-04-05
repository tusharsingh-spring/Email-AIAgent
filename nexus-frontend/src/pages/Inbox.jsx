import { useEffect, useState, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { getEmails, processEmail, clusterManual, getProjects, attachEmailToProject } from '../services/api'
import { Inbox as InboxIcon, RefreshCw, Loader2, Check, CheckSquare, Cpu, Link as LinkIcon } from 'lucide-react'

// Formatting helpers
const FT = iso => {
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return iso || '' }
}

const shortDate = iso => {
  try { 
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
  }
  catch { return '' }
}

const initials = (sender = '') => {
  const name = sender.split('@')[0]
  return name.slice(0, 2).toUpperCase() || 'EX'
}

// Function to safely turn plain text URLs into clickable blue links
const formatPlainText = (text) => {
  if (!text) return ''
  
  // 1. Remove angle brackets around URLs that some automated systems use (e.g., <https://...>)
  const cleanedText = text.replace(/<(https?:\/\/[^>]+)>/g, '$1')

  // 2. Regex to find standard URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts = cleanedText.split(urlRegex)

  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a 
          key={index} 
          href={part} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-[#8ab4f8] hover:underline break-all"
          onClick={e => e.stopPropagation()}
        >
          {part}
        </a>
      )
    }
    return <span key={index}>{part}</span>
  })
}

function EmailRow({ email, isSelected, onSelect, onClick, isOpen, projects, onAssign, onProcess }) {
  const [selProject, setSelProject] = useState(email.project_suggestion?.project_id || '')
  const [assigning, setAssigning] = useState(false)
  const iframeRef = useRef(null)

  const senderName = (email.sender || '').split('@')[0] || 'Unknown'
  const ini = initials(email.sender)

  const handleAssign = async (e) => {
    e.stopPropagation()
    if (!selProject) return
    setAssigning(true)
    await onAssign(email.id, selProject)
    setAssigning(false)
  }

  // Smarter HTML Detection
  const bodyContent = email.body || email.snippet || '(empty)'
  const isHtml = /<html|<body|<div|<table|<p>/i.test(bodyContent)

  // Gmail styling logic
  const rowBg = isSelected ? 'bg-[#c2e7ff]/[0.12]' : isOpen ? 'bg-[#303134]' : 'bg-[#202124]'
  const textWeight = isOpen ? 'font-normal text-[#bdc1c6]' : 'font-bold text-[#e8eaed]'

  // Securely inject a script to force the iframe to report its true height
  const getSecureHtml = (html) => {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <base target="_blank">
          <style>
            body { margin: 0; padding: 16px; font-family: Arial, sans-serif; word-wrap: break-word; }
            img { max-width: 100%; height: auto; }
          </style>
        </head>
        <body>
          ${html}
          <script>
            const updateHeight = () => {
              const height = document.documentElement.scrollHeight;
              window.parent.postMessage({ type: 'resize-iframe', height: height, id: '${email.id}' }, '*');
            };
            window.onload = updateHeight;
            new ResizeObserver(updateHeight).observe(document.body);
          </script>
        </body>
      </html>
    `
  }

  useEffect(() => {
    // Listen for resize messages from the iframe to prevent white/empty screens
    const handleMessage = (e) => {
      if (e.data.type === 'resize-iframe' && e.data.id === email.id && iframeRef.current) {
        iframeRef.current.style.height = `${e.data.height}px`;
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [email.id])

  return (
    <div className="flex flex-col relative group border-b border-[#4d5156] last:border-b-0">
      {/* GMAIL LIST ROW */}
      <div
        className={`flex items-center h-[40px] cursor-pointer ${rowBg} hover:shadow-[inset_1px_0_0_#dadce0,inset_-1px_0_0_#dadce0,0_1px_2px_0_rgba(60,64,67,0.3),0_1px_3px_1px_rgba(60,64,67,0.15)] hover:bg-[#303134] hover:z-10 hover:border-transparent transition-none px-4`}
        onClick={onClick}
      >
        <div className="flex items-center gap-2 w-[48px] shrink-0" onClick={e => e.stopPropagation()}>
          <div 
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 cursor-pointer"
            onClick={() => onSelect(email.id)}
          >
            <div className={`w-[18px] h-[18px] border-2 rounded-[2px] flex items-center justify-center ${isSelected ? 'border-[#8ab4f8] bg-[#8ab4f8]' : 'border-[#9aa0a6]'}`}>
              {isSelected && <Check size={14} className="text-[#202124] stroke-[3]" />}
            </div>
          </div>
        </div>

        <div className="w-[168px] shrink-0 pr-8">
          <span className={`text-[14px] truncate block ${textWeight}`}>
            {senderName}
          </span>
        </div>

        <div className="flex-1 min-w-0 flex items-center overflow-hidden text-[14px] whitespace-nowrap">
          <span className={`truncate ${textWeight}`}>
            {email.subject || '(no subject)'}
          </span>
          <span className="text-[#9aa0a6] mx-1">-</span>
          <span className="text-[#9aa0a6] truncate">
            {email.snippet || ''}
          </span>
        </div>

        <div className="w-[72px] shrink-0 text-right">
          <span className={`text-[12px] ${textWeight}`}>
            {shortDate(email.received_at || email.date)}
          </span>
        </div>
      </div>

      {/* GMAIL READING PANE (EXPANDED) */}
      {isOpen && (
        <div className="bg-[#202124] text-[#e8eaed] border-t border-[#4d5156] p-6 pb-10 shadow-inner">
          <div className="max-w-4xl mx-auto lg:ml-[72px]">
            
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[22px] font-normal text-[#e8eaed] leading-7">
                {email.subject || '(no subject)'}
                <span className="bg-[#3c4043] text-[#e8eaed] text-[10px] px-1.5 py-0.5 rounded ml-3 align-middle font-medium">Inbox x</span>
              </h2>
            </div>

            <div className="flex items-start justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#8ab4f8] flex items-center justify-center text-[#202124] text-lg font-medium shrink-0">
                  {ini}
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[14px] text-[#e8eaed]">{senderName}</span>
                    <span className="text-[12px] text-[#9aa0a6]">&lt;{email.sender}&gt;</span>
                  </div>
                  <span className="text-[12px] text-[#9aa0a6] flex items-center gap-1 mt-0.5">
                    to me
                  </span>
                </div>
              </div>
              <div className="text-[#9aa0a6] text-[12px]">
                {FT(email.received_at || email.date)}
              </div>
            </div>

            {/* SAFE EMAIL BODY RENDERER */}
            <div className="mb-12 font-sans overflow-hidden">
              {isHtml ? (
                <div className="bg-white rounded-[8px] overflow-hidden border border-[#4d5156] shadow-sm">
                  <iframe
                    ref={iframeRef}
                    srcDoc={getSecureHtml(bodyContent)}
                    title="Email Body"
                    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-scripts"
                    className="w-full min-h-[200px] border-none bg-white transition-all duration-300"
                    scrolling="no"
                  />
                </div>
              ) : (
                /* Enhanced Plain Text Box */
                <div className="bg-[#303134]/30 border border-[#5f6368]/30 rounded-lg p-5">
                  <div className="text-[14px] text-[#e8eaed] leading-[1.6rem] whitespace-pre-wrap break-words">
                    {formatPlainText(bodyContent)}
                  </div>
                </div>
              )}
            </div>

            {/* API ACTION CARDS */}
            <div className="border-t border-[#4d5156] pt-6 flex flex-col md:flex-row gap-4">
              <div className="flex-1 bg-[#202124] border border-[#5f6368] rounded-[8px] p-4 flex flex-col">
                <div className="flex items-center gap-2 text-[#8ab4f8] text-[14px] font-medium mb-4">
                  <LinkIcon size={18} /> Assign to Project
                </div>

                {email.project_suggestion && !email.project_id && (
                  <div className="mb-4 bg-[#c2e7ff]/[0.12] rounded p-3 text-[13px]">
                    <span className="font-bold text-[#8ab4f8] mr-2">Suggested Match:</span>
                    <span className="text-[#e8eaed]">{email.project_suggestion.project_name}</span>
                  </div>
                )}

                <div className="mt-auto flex gap-3">
                  <select
                    value={selProject}
                    onChange={e => setSelProject(e.target.value)}
                    className="flex-1 bg-[#303134] border border-[#5f6368] text-[#e8eaed] text-[14px] rounded px-3 py-1.5 focus:border-[#8ab4f8] outline-none hover:bg-[#3c4043] transition-colors appearance-none"
                    disabled={assigning}
                  >
                    <option value="">Select project...</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button
                    onClick={handleAssign}
                    disabled={!selProject || assigning}
                    className="bg-[#8ab4f8] hover:bg-[#aecbfa] text-[#202124] px-6 py-1.5 rounded-[4px] text-[14px] font-medium transition-colors disabled:opacity-50 disabled:bg-[#3c4043] disabled:text-[#9aa0a6] h-[36px] flex items-center justify-center gap-2"
                  >
                    {assigning ? <Loader2 size={16} className="animate-spin" /> : null}
                    {email.project_id ? 'Update' : 'Assign'}
                  </button>
                </div>
              </div>

              <div className="md:w-[280px] bg-[#202124] border border-[#5f6368] rounded-[8px] p-4 flex flex-col">
                <div className="flex items-center gap-2 text-[#fbbc04] text-[14px] font-medium mb-2">
                  <Cpu size={18} /> LangGraph Agent
                </div>
                <p className="text-[12px] text-[#9aa0a6] mb-4">
                  Process this email through the automated AI pipeline.
                </p>
                <button
                  onClick={() => onProcess(email.id)}
                  className="mt-auto border border-[#5f6368] text-[#8ab4f8] hover:bg-[#8ab4f8]/10 px-4 py-1.5 rounded-[4px] text-[14px] font-medium transition-colors h-[36px]"
                >
                  Process Email
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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

  const handleSelectAll = () => {
    const emails = state?.emails || [];
    if (selectedIds.size === emails.length && emails.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(emails.map(e => e.id)));
    }
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
  const allSelected = emails.length > 0 && selectedIds.size === emails.length

  return (
    <div className="min-h-screen w-full bg-[#202124] text-[#e8eaed] font-sans flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#4d5156]">
        <div className="flex items-center gap-3 text-xl text-[#e8eaed]">
          <InboxIcon size={24} className="text-[#e8eaed]" /> 
          <span className="font-normal text-[22px]">Inbox</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col max-w-[1400px] w-full mx-auto p-4 lg:p-6">
        <div className="bg-[#202124] rounded-xl border border-[#4d5156] flex-1 flex flex-col overflow-hidden shadow-sm">
          
          <div className="h-[48px] border-b border-[#4d5156] flex items-center px-4 justify-between bg-[#202124]">
            <div className="flex items-center gap-2">
              <div 
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#303134] cursor-pointer text-[#9aa0a6]"
                onClick={handleSelectAll}
                title="Select all"
              >
                <div className={`w-[18px] h-[18px] border-2 rounded-[2px] flex items-center justify-center ${allSelected ? 'border-[#8ab4f8] bg-[#8ab4f8]' : selectedIds.size > 0 ? 'border-[#8ab4f8] bg-[#8ab4f8]' : 'border-[#9aa0a6]'}`}>
                  {allSelected && <Check size={14} className="text-[#202124] stroke-[3]" />}
                  {!allSelected && selectedIds.size > 0 && <div className="w-[10px] h-[2px] bg-[#202124]" />}
                </div>
              </div>
              
              <div 
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#303134] cursor-pointer text-[#9aa0a6]"
                onClick={loadEmails}
                title="Refresh emails"
              >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              </div>

              {hasSelected && (
                <div className="w-[1px] h-5 bg-[#4d5156] mx-2" />
              )}
              {hasSelected && (
                <button
                  onClick={() => setClusterModal(true)}
                  className="flex items-center gap-2 text-[#e8eaed] bg-[#3c4043] hover:bg-[#4d5156] px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors"
                >
                  <CheckSquare size={16} /> Cluster Selected ({selectedIds.size})
                </button>
              )}
            </div>

            <div className="text-[#9aa0a6] text-[12px] pr-2">
              {emails.length > 0 ? `Total: ${emails.length}` : ''}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {emails.length > 0 ? (
              <div className="flex flex-col pb-10">
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
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-[#9aa0a6]">
                <span className="text-[16px]">
                  {loading ? 'Fetching emails...' : 'Your inbox is empty.'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {clusterModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
          onClick={() => setClusterModal(false)}
        >
          <div
            className="bg-[#202124] rounded-[8px] w-full max-w-[400px] shadow-[0_24px_38px_3px_rgba(0,0,0,0.14),0_9px_46px_8px_rgba(0,0,0,0.12),0_11px_15px_-7px_rgba(0,0,0,0.2)] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6">
              <h3 className="text-[16px] font-medium text-[#e8eaed] mb-4">Create cluster from {selectedIds.size} conversations</h3>
              
              <div className="relative mt-2">
                <input
                  ref={clusterRef}
                  type="text"
                  value={clusterName}
                  onChange={e => setClusterName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCluster(); if (e.key === 'Escape') setClusterModal(false) }}
                  className="w-full bg-transparent border border-[#5f6368] rounded-[4px] text-[#e8eaed] px-3 py-3 text-[16px] outline-none focus:border-[#8ab4f8] focus:border-2 peer placeholder-transparent"
                  placeholder="Cluster name"
                />
                <label className={`absolute left-3 px-1 bg-[#202124] text-[#9aa0a6] text-[12px] transition-all peer-placeholder-shown:text-[16px] peer-placeholder-shown:top-3.5 peer-focus:-top-2 peer-focus:text-[12px] peer-focus:text-[#8ab4f8] ${clusterName ? '-top-2' : 'top-3.5'}`}>
                  Cluster name
                </label>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 px-6 py-4">
              <button
                onClick={() => setClusterModal(false)}
                className="px-4 py-2 text-[#8ab4f8] hover:bg-[#8ab4f8]/10 rounded-[4px] text-[14px] font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCluster}
                disabled={!clusterName.trim()}
                className="px-4 py-2 text-[#8ab4f8] hover:bg-[#8ab4f8]/10 rounded-[4px] text-[14px] font-medium transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
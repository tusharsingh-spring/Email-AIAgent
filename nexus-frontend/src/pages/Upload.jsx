import { useEffect, useState, useRef } from 'react'
import { Upload as UploadIcon, FileText, Clipboard, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { getProjects, uploadProjectDoc, brdFromUpload } from '../services/api'
import { useApp } from '../context/AppContext'

export default function Upload() {
  const { toast = () => {} } = useApp() || {}
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState('')
  const [uploading, setUploading] = useState(false)
  const [pasting, setPasting] = useState(false)
  const labelRef = useRef(null)
  const pasteRef = useRef(null)

  useEffect(() => {
    const load = async () => {
      try {
        const d = await getProjects()
        setProjects(d.projects || [])
      } catch { setProjects([]) }
    }
    load()
  }, [])

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus('')
    setUploading(true)
    try {
      if (projectId) {
        await uploadProjectDoc(projectId, file)
        toast('Uploaded to project context', 'ok')
        setStatus('Saved to project context')
      } else {
        await brdFromUpload(file)
        toast('Uploaded for standalone BRD', 'ok')
        setStatus('Queued standalone BRD from upload')
      }
    } catch (err) {
      toast('Upload failed', 'warn')
      setStatus('Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handlePaste = async () => {
    const body = pasteRef.current?.value || ''
    const label = labelRef.current?.value || 'Transcript'
    if (!body.trim()) return toast('Paste some text first', 'warn')
    setStatus('')
    setPasting(true)
    try {
      const blob = new Blob([body], { type: 'text/plain' })
      const fd = new FormData()
      fd.append('file', blob, `${label || 'Transcript'}.txt`)

      const res = projectId
        ? await fetch(`/api/projects/${projectId}/upload-doc`, { method: 'POST', body: fd })
        : await fetch('/api/brd/from-upload', { method: 'POST', body: fd })

      if (!res.ok) throw new Error('Upload failed')
      toast(projectId ? 'Pasted into project' : 'Standalone BRD queued', 'ok')
      setStatus(projectId ? 'Pasted into project' : 'Standalone BRD queued')
      pasteRef.current.value = ''
      labelRef.current.value = ''
    } catch (err) {
      toast(err.message || 'Upload failed', 'warn')
      setStatus('Upload failed')
    } finally {
      setPasting(false)
    }
  }

  return (
    <div className="pb-20">
      <div className="mb-10">
        <div className="htag mb-4">Resources / Intake</div>
        <h1 className="font-bebas text-[clamp(38px,6vw,76px)] leading-[0.9] tracking-[0.01em] uppercase text-brand-text">Upload Resources</h1>
        <p className="text-brand-muted mt-2 max-w-2xl font-dm text-[14px]">
          Send transcripts or PDFs into the pipeline. Pick a project to attach context, or leave unassigned to create a standalone BRD job.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="border border-brand-border rounded-sm p-5 bg-brand-panel/40">
          <div className="flex items-center gap-2 mb-3">
            <UploadIcon size={16} className="text-brand-blue" />
            <div className="font-space text-[11px] uppercase tracking-[0.18em] text-brand-muted">Select Project (optional)</div>
          </div>
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="w-full bg-brand-input border border-brand-border text-brand-text p-3 rounded-sm font-dm text-[14px] outline-none focus:border-brand-blue transition-colors"
          >
            <option value="">— No project (standalone BRD) —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="text-brand-muted text-[12px] mt-2">Project selected → stored in context. Blank → standalone BRD.</div>

          <div className="mt-5 border border-dashed border-brand-border rounded-sm p-5 text-center bg-brand-input/30">
            <div className="font-space text-[10px] uppercase tracking-[0.2em] text-brand-muted mb-2">Upload File</div>
            <div className="font-dm text-[14px] text-brand-text mb-3">.txt · .md · .pdf</div>
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-sm border border-brand-border text-brand-muted hover:text-white hover:border-brand-blue/40 transition-colors cursor-pointer">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              <span>{uploading ? 'Uploading…' : 'Choose file'}</span>
              <input type="file" accept=".txt,.md,.pdf,.doc,.docx" className="hidden" onChange={handleFile} disabled={uploading} />
            </label>
          </div>
        </div>

        <div className="border border-brand-border rounded-sm p-5 bg-brand-panel/40">
          <div className="flex items-center gap-2 mb-3">
            <Clipboard size={16} className="text-brand-yellow" />
            <div className="font-space text-[11px] uppercase tracking-[0.18em] text-brand-muted">Paste Transcript / Chat</div>
          </div>
          <input
            ref={labelRef}
            type="text"
            placeholder="Label (optional)"
            className="w-full bg-brand-input border border-brand-border text-brand-text p-3 rounded-sm font-dm text-[14px] outline-none focus:border-brand-blue transition-colors mb-3"
          />
          <textarea
            ref={pasteRef}
            rows={8}
            placeholder="Paste transcript or chat log here..."
            className="w-full bg-brand-input border border-brand-border text-brand-text p-3 rounded-sm font-dm text-[14px] outline-none focus:border-brand-blue transition-colors resize-none"
          />
          <div className="flex justify-end mt-3">
            <button
              onClick={handlePaste}
              disabled={pasting}
              className="flex items-center gap-2 bg-brand-blue text-brand-black px-4 py-2 rounded-sm font-space text-[10px] uppercase tracking-widest font-bold hover:bg-white transition-colors disabled:opacity-50"
            >
              {pasting ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              {pasting ? 'Sending…' : 'Save / Generate'}
            </button>
          </div>
        </div>
      </div>

      {status && (
        <div className="mt-5 flex items-center gap-2 text-[13px] font-dm">
          {status.toLowerCase().includes('fail') ? <AlertTriangle size={14} className="text-red-400" /> : <CheckCircle2 size={14} className="text-[#00ff9d]" />}
          <span className="text-brand-muted">{status}</span>
        </div>
      )}
    </div>
  )
}

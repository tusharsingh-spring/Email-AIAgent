import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { getProjects, uploadBRD } from '../services/api'
import DropZone from '../components/ui/DropZone'
import ProgressSteps from '../components/ui/ProgressSteps'

export default function UploadResources() {
  const { toast } = useApp()
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [pasteLabel, setPasteLabel] = useState('')
  const [pasteContent, setPasteContent] = useState('')
  const [stage, setStage] = useState(null)
  const [btnLabel, setBtnLabel] = useState('Save to Project / Generate BRD')
  const [loading, setLoading] = useState(false)

  const loadProjects = async () => {
    try { const d = await getProjects(); setProjects(d.projects || []) } catch {}
  }

  useState(() => { loadProjects() }, [])

  const startAnim = () => {
    const stages = ['ingestion', 'extraction', 'gap_detection', 'writing', 'assembly', 'docx']
    let i = 0
    const t = setInterval(() => {
      if (i < stages.length) { setStage(stages[i]); i++ } else clearInterval(t)
    }, 1400)
  }

  const handleFile = async (file) => {
    try {
      toast(`Uploading ${file.name}...`, 'ok')
      if (projectId) {
        const r = await uploadBRD(file, projectId)
        toast('✓ Saved to project', 'ok')
      } else {
        await uploadBRD(file)
        toast('Processing — BRD generation started', 'ok')
        startAnim()
      }
    } catch { toast('Backend not running', 'warn') }
  }

  const handlePaste = async () => {
    if (!pasteContent.trim()) { toast('Paste some content first', 'warn'); return }
    setLoading(true)
    const blob = new Blob([pasteContent], { type: 'text/plain' })
    const fd = new FormData()
    fd.append('file', blob, (pasteLabel || 'Transcript') + '.txt')
    try {
      const url = projectId ? `/api/projects/${projectId}/upload-doc` : '/api/brd/from-upload'
      const r = await fetch(url, { method: 'POST', body: fd })
      if (r.ok) {
        if (projectId) {
          toast('✓ Transcript saved to project', 'ok')
          setBtnLabel('✓ Saved to Project!')
          setTimeout(() => setBtnLabel('Save to Project / Generate BRD'), 3000)
          setPasteContent('')
        } else {
          toast('BRD generation started', 'ok')
          startAnim()
        }
      } else { toast('Failed', 'warn') }
    } catch { toast('Backend not running', 'warn') }
    setLoading(false)
  }

  return (
    <div>
      <div className="ph">
        <div className="pt">Upload Resources</div>
        <div className="ps-h">Upload a meeting transcript or chat log — link it to a project and NEXUS folds it into the BRD context</div>
      </div>
      <div className="g2">
        <div>
          <div className="card" style={{ marginBottom: '12px', background: 'var(--adim)', borderColor: 'rgba(10,132,255,0.3)' }}>
            <div className="card-t" style={{ color: 'var(--a)' }}>📂 Link to Project</div>
            <div className="field" style={{ margin: 0 }}>
              <label style={{ fontSize: '10px', color: 'var(--tx3)' }}>Select project this resource belongs to</label>
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--bdr2)', borderRadius: 'var(--rs)', padding: '8px 10px', color: 'var(--tx)', fontSize: '12px', outline: 'none', cursor: 'pointer' }}
                onClick={loadProjects}
              >
                <option value="">— No project (standalone BRD) —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ fontSize: '10px', color: projectId ? 'var(--grn)' : 'var(--tx3)', marginTop: '6px' }}>
              {projectId ? '✓ Saved! Go to Projects → select project → Generate BRD.' : 'When a project is selected, the resource is saved to that project\'s context in Supabase.'}
            </div>
          </div>
          <div className="card" style={{ marginBottom: '12px' }}>
            <div className="card-t">Upload file</div>
            <DropZone onFile={handleFile} />
            <button className="btn btn-g" style={{ marginTop: '9px', fontSize: '11px', position: 'relative' }}>
              📎 Browse file
              <input type="file" accept=".txt,.md,.csv,.pdf" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} onChange={e => handleFile(e.target.files[0])} />
            </button>
          </div>
          <div className="card">
            <div className="card-t">Or paste directly</div>
            <div className="field" style={{ marginBottom: '8px' }}>
              <label style={{ fontSize: '10px', color: 'var(--tx3)' }}>Resource label (optional)</label>
              <input type="text" value={pasteLabel} onChange={e => setPasteLabel(e.target.value)} placeholder="e.g. Q1 Kickoff Meeting" style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--bdr2)', borderRadius: 'var(--rs)', padding: '8px 10px', color: 'var(--tx)', fontSize: '12px', outline: 'none' }} />
            </div>
            <textarea value={pasteContent} onChange={e => setPasteContent(e.target.value)} style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--bdr2)', borderRadius: 'var(--rs)', padding: '9px', color: 'var(--tx)', fontSize: '11px', outline: 'none', minHeight: '110px', resize: 'vertical' }} placeholder={`[10:00] PM: We need a user auth system with SSO by Q2\n[10:02] CTO: Must handle 10k concurrent users, 99.9% uptime\n[10:05] Designer: Mobile-first, onboarding under 3 clicks`} />
            <button className="btn btn-a btn-full" style={{ marginTop: '8px' }} onClick={handlePaste} disabled={loading}>
              {loading && <span className="spin" />}
              {btnLabel}
            </button>
          </div>
        </div>
        <div className="card">
          <div className="card-t">Agent progress</div>
          <ProgressSteps currentStage={stage} />
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { getEmails, processEmail, clusterManual } from '../services/api'

const FT = iso => { try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return iso || '' } }

export default function Inbox() {
  const { state, dispatch, toast, addLog } = useApp()
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const load = async () => {
    setLoading(true)
    addLog('info', 'Fetching real Gmail inbox...')
    try {
      const d = await getEmails(10)
      if (d.error) { toast(d.error, 'warn'); addLog('error', d.error); return }
      dispatch({ type: 'SET_EMAILS', emails: d.emails || [] })
      addLog('ok', `${(d.emails || []).length} emails fetched`)
    } catch { toast('Backend not running', 'warn') }
    setLoading(false)
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const clusterSelected = async () => {
    if (!selectedIds.size) return
    const title = window.prompt("Enter a theme for this cluster (e.g. 'Website Rewrite'):", 'User Identified Project')
    if (title === null) return
    try {
      const r = await clusterManual(Array.from(selectedIds), title)
      if (r.error) { toast(r.error, 'warn'); return }
      toast(`Clustered ${selectedIds.size} emails`, 'ok')
      setSelectedIds(new Set())
    } catch { toast('Cluster failed', 'warn') }
  }

  const handleProcess = async (id) => {
    try { await processEmail(id); toast('Processing...', 'ok'); addLog('info', `Manual trigger: ${id}`) }
    catch { toast('Failed', 'warn') }
  }

  const emails = state.emails

  return (
    <div>
      <div className="ph">
        <div className="pt">Real Inbox</div>
        <div className="ps-h">Unread Gmail emails — NEXUS monitors these automatically</div>
      </div>
      <div className="g2">
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="card-t" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              Unread emails
              {selectedIds.size > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button className="btn btn-a btn-sm" onClick={clusterSelected}>⬡ Manual Cluster & BRD</button>
                  <button className="btn btn-g btn-sm" onClick={() => setSelectedIds(new Set())}>Clear</button>
                </span>
              )}
            </div>
            <button className="btn btn-g btn-sm" onClick={load} disabled={loading}>{loading ? <span className="spin" /> : '↻ Fetch'}</button>
          </div>
          <div>
            {emails.length ? emails.map(e => (
              <div key={e.id} className="ei" style={{ alignItems: 'center' }} onClick={() => setSelected(e)}>
                <input type="checkbox" style={{ marginRight: '8px', cursor: 'pointer' }} checked={selectedIds.has(e.id)} onChange={() => toggleSelect(e.id)} onClick={ev => ev.stopPropagation()} />
                <div className="ei-dot" style={{ background: 'var(--a)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ei-sub">{e.subject}</div>
                  <div className="ei-from">{e.sender}</div>
                  <div className="ei-pre">{e.snippet || ''}</div>
                </div>
                <div className="ei-t">{FT(e.received_at || e.date)}</div>
              </div>
            )) : <div className="empty"><div className="ei">✉</div>Click Fetch to load real emails</div>}
          </div>
        </div>
        <div className="card" id="email-detail">
          {selected ? (
            <div>
              <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '3px' }}>{selected.subject}</div>
              <div style={{ fontSize: '10px', color: 'var(--tx2)', marginBottom: '2px' }}>From: {selected.sender}</div>
              <div style={{ fontSize: '10px', color: 'var(--tx3)', marginBottom: '12px', fontFamily: "'DM Mono',monospace" }}>{selected.date || ''}</div>
              <div style={{ background: 'var(--bg3)', borderRadius: 'var(--rs)', padding: '10px', fontSize: '11px', color: 'var(--tx2)', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: '240px', overflowY: 'auto' }}>
                {selected.body || selected.snippet || '(empty)'}
              </div>
              <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
                <button className="btn btn-a btn-sm" onClick={() => handleProcess(selected.id)}>⚡ Process with LangGraph</button>
              </div>
            </div>
          ) : <div className="empty"><div className="ei">✉</div>Select an email</div>}
        </div>
      </div>
    </div>
  )
}

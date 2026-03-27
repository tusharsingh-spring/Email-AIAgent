import { useEffect, useState } from 'react'
import { getMetrics } from '../services/api'
import { useApp } from '../context/AppContext'
import IntentChart from '../components/charts/IntentChart'

export default function Metrics() {
  const { toast } = useApp()
  const [data, setData] = useState(null)

  const load = async () => {
    try { setData(await getMetrics()) }
    catch { toast('Metrics unavailable', 'warn') }
  }

  useEffect(() => { load() }, [])

  const summary = data?.summary || {}
  const intent = data?.intent_breakdown || {}
  const maxIntent = Object.values(intent).length ? Math.max(...Object.values(intent)) : 1
  const intentBadge = { brd: 'b-pu', schedule: 'b-tl', escalate: 'b-rd', general: 'b-gr', status: 'b-bl' }

  return (
    <div>
      <div className="ph">
        <div className="pt">Live Metrics</div>
        <div className="ps-h">Pipeline intelligence breakdown — for evaluation and audit</div>
      </div>
      <div className="g2" style={{ marginBottom: '12px' }}>
        <div className="card">
          <div className="ch"><div className="card-t">Pipeline Summary</div><button className="btn btn-g btn-sm" onClick={load}>↻ Refresh</button></div>
          {Object.keys(summary).length ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <tbody>
                {Object.entries(summary).map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: '1px solid var(--bdr)' }}>
                    <td style={{ padding: '7px 5px', color: 'var(--tx2)', fontFamily: "'DM Mono',monospace", fontSize: '10px' }}>{k.replace(/_/g, ' ')}</td>
                    <td style={{ padding: '7px 5px', fontWeight: 600, color: 'var(--a2)' }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty" style={{ padding: '14px 0' }}>Click Refresh to load metrics</div>}
        </div>
        <div className="card">
          <div className="ch"><div className="card-t">Intent Breakdown</div></div>
          {Object.keys(intent).length ? (
            <>
              {Object.entries(intent).map(([intent, count]) => (
                <div key={intent} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: '1px solid var(--bdr)' }}>
                  <span className={`badge ${intentBadge[intent] || 'b-gr'}`}>{intent}</span>
                  <div style={{ flex: 1, background: 'var(--bg4)', borderRadius: '3px', height: '4px' }}>
                    <div style={{ width: `${Math.round((count / maxIntent) * 100)}%`, height: '100%', background: 'var(--a)', borderRadius: '3px' }} />
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--tx2)', fontFamily: "'DM Mono',monospace" }}>{count}</span>
                </div>
              ))}
            </>
          ) : <div className="empty" style={{ padding: '14px 0' }}>No actions yet</div>}
        </div>
      </div>
      <div className="card">
        <div className="ch"><div className="card-t">System Architecture</div></div>
        <div style={{ background: 'var(--bg3)', borderRadius: 'var(--rs)', padding: '12px' }}>
          <div style={{ fontSize: '9px', color: 'var(--tx3)', fontFamily: "'DM Mono',monospace", marginBottom: '8px' }}>LANGGRAPH NODE PIPELINE</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
            <span className="lg-node" style={{ color: 'var(--blu)' }}>Intent Router</span><span style={{ color: 'var(--tx3)' }}>→</span>
            <span className="lg-node" style={{ color: 'var(--pur)' }}>BRD Extract</span><span style={{ color: 'var(--tx3)' }}>→</span>
            <span className="lg-node" style={{ color: 'var(--pur)' }}>Gap Detect</span><span style={{ color: 'var(--tx3)' }}>→</span>
            <span className="lg-node" style={{ color: 'var(--pur)' }}>BRD Writer ×1</span><span style={{ color: 'var(--tx3)' }}>→</span>
            <span className="lg-node" style={{ color: 'var(--pur)' }}>Assembler</span><span style={{ color: 'var(--tx3)' }}>|</span>
            <span className="lg-node" style={{ color: 'var(--teal)' }}>Calendar Agent</span><span style={{ color: 'var(--tx3)' }}>→</span>
            <span className="lg-node" style={{ color: 'var(--grn)' }}>Reply Composer</span><span style={{ color: 'var(--tx3)' }}>→</span>
            <span className="lg-node" style={{ color: 'var(--red)' }}>Escalation</span>
          </div>
          <div style={{ marginTop: '10px', fontSize: '10px', color: 'var(--tx2)', display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
            <div>■ <span style={{ color: 'var(--tx3)' }}>Clustering:</span> <code>all-MiniLM-L6-v2</code></div>
            <div>■ <span style={{ color: 'var(--tx3)' }}>LLM:</span> <code>llama-3.3-70b-versatile (Groq)</code></div>
            <div>■ <span style={{ color: 'var(--tx3)' }}>Framework:</span> <code>LangGraph</code></div>
            <div>■ <span style={{ color: 'var(--tx3)' }}>Backend:</span> <code>FastAPI + WebSocket</code></div>
          </div>
        </div>
      </div>
    </div>
  )
}

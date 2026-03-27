import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { getStats, getActions, getCalendarEvents } from '../services/api'
import StatCard from '../components/ui/StatCard'
import ChannelMixChart from '../components/charts/ChannelMixChart'
import IntentChart from '../components/charts/IntentChart'
import ActionStatusChart from '../components/charts/ActionStatusChart'
import Badge from '../components/ui/Badge'
import EventRow from '../components/ui/EventRow'
import { useNavigate } from 'react-router-dom'

const FT = iso => { try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return iso || '' } }
const INI = e => (e || '').split('@')[0].slice(0, 2).toUpperCase() || 'AI'
const STATUS_BADGE = { pending: 'am', sent: 'gn', rejected: 'gr', escalated: 'rd', resolved: 'gr' }

export default function Dashboard() {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const [stats, setStats] = useState({})
  const [intentBreakdown, setIntentBreakdown] = useState({})

  useEffect(() => {
    getStats().then(d => { setStats(d); dispatch({ type: 'SET_STATS', stats: d }) }).catch(() => {})
    getActions().then(d => dispatch({ type: 'SET_ACTIONS', actions: d.actions || [] })).catch(() => {})
    getCalendarEvents().then(d => dispatch({ type: 'SET_EVENTS', events: d.events || [] })).catch(() => {})
  }, [])

  const pending = state.actions.filter(a => ['pending', 'escalated'].includes(a.status)).slice(0, 5)

  return (
    <div>
      <div className="ph">
        <div className="pt">Command Center</div>
        <div className="ps-h">Real Gmail · Real Calendar · LangGraph multi-agent pipeline</div>
      </div>

      {/* LangGraph pipeline strip */}
      <div className="card" style={{ marginBottom: '12px', padding: '10px 14px' }}>
        <div style={{ fontSize: '9px', color: 'var(--tx3)', fontFamily: "'DM Mono',monospace", marginBottom: '6px' }}>LANGGRAPH PIPELINE</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexWrap: 'wrap' }}>
          {[['intent router', ''], ['brd extract', ''], ['gap detect', ''], ['section writers ×9', ''], ['assembler', '|'], ['calendar agent', ''], ['reply composer', ''], ['escalation', 'var(--red)']].map(([n, sep]) => (
            <span key={n}><span className="lg-node" style={sep === 'var(--red)' ? { color: 'var(--red)' } : {}}>{n}</span><span style={{ color: 'var(--tx3)', fontSize: '10px' }}>{sep || '→'}</span></span>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="g6" style={{ marginBottom: '12px' }}>
        <StatCard value={stats.processed || stats.emails_processed || '—'} label="Emails processed" color="var(--a2)" />
        <StatCard value={stats.meetings || '—'} label="Meetings created" color="var(--teal)" />
        <StatCard value={stats.pending || '—'} label="Pending actions" color="var(--amb)" />
        <StatCard value={stats.pending_clusters || '—'} label="Clusters awaiting" color="var(--a)" />
        <StatCard value={stats.escalations || '—'} label="Escalations" color="var(--red)" />
        <StatCard value={stats.brds || stats.brds_generated || '—'} label="BRDs generated" color="var(--pur)" />
      </div>

      {/* 2-col row */}
      <div className="g2">
        <div className="card">
          <div className="ch"><div className="card-t">Pending actions</div><button className="btn btn-g btn-sm" onClick={() => navigate('/actions')}>All →</button></div>
          {pending.length ? pending.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid var(--bdr)', cursor: 'pointer' }} onClick={() => navigate('/actions')}>
              <div className="ac-av" style={{ width: '28px', height: '28px', fontSize: '10px' }}>{INI(a.email?.sender)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '11px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.email?.subject || '—'}</div>
                <div style={{ fontSize: '10px', color: 'var(--tx3)' }}>{a.email?.sender || ''}</div>
              </div>
              <Badge variant={STATUS_BADGE[a.status] || 'gr'}>{a.status}</Badge>
            </div>
          )) : <div className="empty" style={{ padding: '14px 0' }}><div style={{ fontSize: '20px', opacity: .3 }}>✦</div>No pending actions</div>}
        </div>
        <div className="card">
          <div className="ch"><div className="card-t">System Status</div><Badge variant="gn">● LIVE</Badge></div>
          <div style={{ fontSize: '11px', color: 'var(--tx2)' }}>
            The Persistent Audit Trail is visible in the right panel to show what happens behind the scenes in real-time.
          </div>
        </div>
      </div>

      {/* Calendar preview */}
      <div className="card" style={{ marginTop: '12px' }}>
        <div className="ch"><div className="card-t">Upcoming calendar events</div><button className="btn btn-g btn-sm" onClick={() => navigate('/calendar')}>→</button></div>
        {state.events.length
          ? state.events.slice(0, 4).map(e => <EventRow key={e.id} event={e} />)
          : <div className="empty" style={{ padding: '12px 0' }}>No upcoming events — sync calendar</div>}
      </div>

      {/* Charts */}
      <div className="g2" style={{ marginTop: '12px' }}>
        <div className="card">
          <div className="ch"><div className="card-t">Channel mix</div><Badge variant="gr">Live</Badge></div>
          <ChannelMixChart stats={stats} />
        </div>
        <div className="card">
          <div className="ch"><div className="card-t">Intent breakdown</div></div>
          <IntentChart intentBreakdown={intentBreakdown} />
        </div>
      </div>

      <div className="card" style={{ marginTop: '12px' }}>
        <div className="ch"><div className="card-t">Action status</div></div>
        <ActionStatusChart actions={state.actions} />
      </div>
    </div>
  )
}

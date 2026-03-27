import { useState } from 'react'
import { useApp } from '../context/AppContext'

function Toggle({ checked, onChange }) {
  return (
    <label className="tgl">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="tgl-s" />
    </label>
  )
}

export default function Settings() {
  const { toast } = useApp()
  const [buf, setBuf] = useState('10')
  const [ws, setWs] = useState('09:00')
  const [we, setWe] = useState('18:00')
  const [thr, setThr] = useState(70)
  const [tone, setTone] = useState('professional')
  const [autoApprove, setAutoApprove] = useState(false)
  const [autoCalendar, setAutoCalendar] = useState(true)
  const [sentiment, setSentiment] = useState(true)
  const [brdAutoDetect, setBrdAutoDetect] = useState(true)
  const [buffer10, setBuffer10] = useState(true)

  return (
    <div>
      <div className="ph">
        <div className="pt">Settings</div>
        <div className="ps-h">Configure NEXUS agent behavior</div>
      </div>
      <div className="g2">
        <div className="card">
          <div className="card-t" style={{ marginBottom: '12px' }}>Scheduling</div>
          <div className="field"><label>Buffer between meetings (mins)</label><input type="number" value={buf} onChange={e => setBuf(e.target.value)} /></div>
          <div className="field"><label>Work hours start</label><input type="time" value={ws} onChange={e => setWs(e.target.value)} /></div>
          <div className="field"><label>Work hours end</label><input type="time" value={we} onChange={e => setWe(e.target.value)} /></div>
          <div className="field">
            <label>Escalation threshold (0–100)</label>
            <input type="range" min="0" max="100" value={thr} onChange={e => setThr(Number(e.target.value))} />
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--a2)', marginLeft: '6px' }}>{thr}</span>
          </div>
          <div className="field">
            <label>Email tone</label>
            <select value={tone} onChange={e => setTone(e.target.value)}>
              <option>professional</option><option>friendly</option><option>concise</option>
            </select>
          </div>
          <button className="btn btn-a" onClick={() => toast('Settings saved', 'ok')}>Save</button>
        </div>
        <div className="card">
          <div className="card-t" style={{ marginBottom: '10px' }}>Agent behavior</div>
          <div className="toggle-row">
            <div><div style={{ fontSize: '12px' }}>Auto-approve low-urgency replies</div><div style={{ fontSize: '10px', color: 'var(--tx3)' }}>Send without human review</div></div>
            <Toggle checked={autoApprove} onChange={setAutoApprove} />
          </div>
          <div className="toggle-row">
            <div><div style={{ fontSize: '12px' }}>Auto-create calendar events</div></div>
            <Toggle checked={autoCalendar} onChange={setAutoCalendar} />
          </div>
          <div className="toggle-row">
            <div><div style={{ fontSize: '12px' }}>Sentiment escalation</div><div style={{ fontSize: '10px', color: 'var(--tx3)' }}>Route frustrated emails to human</div></div>
            <Toggle checked={sentiment} onChange={setSentiment} />
          </div>
          <div className="toggle-row">
            <div><div style={{ fontSize: '12px' }}>BRD auto-detect from emails</div><div style={{ fontSize: '10px', color: 'var(--tx3)' }}>Keywords trigger BRD pipeline</div></div>
            <Toggle checked={brdAutoDetect} onChange={setBrdAutoDetect} />
          </div>
          <div className="toggle-row">
            <div><div style={{ fontSize: '12px' }}>10-min buffer enforcement</div></div>
            <Toggle checked={buffer10} onChange={setBuffer10} />
          </div>
        </div>
      </div>
    </div>
  )
}

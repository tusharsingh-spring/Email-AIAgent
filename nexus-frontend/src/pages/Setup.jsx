export default function Setup() {
  return (
    <div>
      <div className="ph">
        <div className="pt">Setup & Authentication</div>
        <div className="ps-h">Everything you need to get NEXUS running with real Google APIs</div>
      </div>
      <div className="g2">
        <div className="card">
          <div className="card-t" style={{ marginBottom: '12px' }}>Setup steps</div>
          {[
            { state: 'done', text: <>Install: <code>pip install -r requirements.txt</code></> },
            { state: 'active', text: <>Google Cloud Console → enable Gmail API + Calendar API → OAuth2 Desktop → download <code>credentials.json</code></> },
            { state: 'idle', text: <>Copy <code>.env.example</code> → <code>.env</code> · add <code>GROQ_API_KEY</code> (free at console.groq.com)</> },
            { state: 'idle', text: <><code>uvicorn main:app --reload --port 8000</code></> },
            { state: 'idle', text: <>Click "Connect Google" → one-time OAuth consent → <code>token.json</code> saved</> },
            { state: 'idle', text: <>NEXUS is live — polls Gmail every 30s, LangGraph handles everything</> },
          ].map((step, i) => (
            <div key={i} className="prog-step">
              <div className={`ps-d ${step.state}`} />
              <div className={`ps-l ${step.state}`}>{step.text}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="card" style={{ marginBottom: '12px' }}>
            <div className="card-t" style={{ marginBottom: '9px' }}>What's real</div>
            <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Gmail inbox', 'gn', 'REAL', 'Gmail API OAuth2'],
                  ['Send emails', 'gn', 'REAL', 'Gmail API send'],
                  ['Calendar events', 'gn', 'REAL', 'Calendar API + invites'],
                  ['Free/busy check', 'gn', 'REAL', 'Freebusy API'],
                  ['Intent routing', 'pu', 'LangGraph', 'State machine graph'],
                  ['BRD generation', 'pu', 'LangGraph', '9 parallel agents'],
                  ['LLM', 'tl', 'Llama 3.1', 'Groq (open-source)'],
                ].map(([label, v, badge, desc]) => (
                  <tr key={label} style={{ borderBottom: '1px solid var(--bdr)' }}>
                    <td style={{ padding: '7px 5px', color: 'var(--tx2)' }}>{label}</td>
                    <td><span className={`badge b-${v}`}>{badge}</span></td>
                    <td style={{ padding: '7px 5px', color: 'var(--tx3)' }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <div className="card-t" style={{ marginBottom: '8px' }}>Key endpoints</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', lineHeight: '2.1', color: 'var(--tx2)' }}>
              {[
                ['GET', '/auth/login → Google consent', 'var(--teal)'],
                ['GET', '/api/emails → real inbox', 'var(--teal)'],
                ['POST', '/api/actions/:id/approve → send real email', 'var(--grn)'],
                ['GET', '/api/calendar/events → real calendar', 'var(--teal)'],
                ['POST', '/api/brd/from-upload → upload → BRD', 'var(--grn)'],
                ['GET', '/api/brd/:id/download → DOCX', 'var(--teal)'],
                ['WS', '/ws/live → real-time push', 'var(--amb)'],
              ].map(([method, path, color]) => (
                <div key={path}><span style={{ color }}>{method.padEnd(5)}</span>{path}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

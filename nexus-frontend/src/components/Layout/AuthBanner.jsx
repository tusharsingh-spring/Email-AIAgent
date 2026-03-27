import { useApp } from '../../context/AppContext'

export default function AuthBanner() {
  const { state } = useApp()
  if (state.authenticated) return null
  return (
    <div className="auth-ban">
      <div style={{ fontSize: '18px' }}>🔑</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--amb)' }}>Google account not connected</div>
        <div style={{ fontSize: '10px', color: 'var(--tx2)', marginTop: '2px' }}>Connect to read real Gmail and write to Google Calendar.</div>
      </div>
      <a className="btn btn-a btn-sm" href="/auth/login" target="_blank">Connect →</a>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'

let toastId = 0

export default function ToastContainer() {
  const { onToast } = useApp()
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    return onToast((msg, type = 'ok') => {
      const id = ++toastId
      setToasts(prev => [...prev, { id, msg, type }])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200)
    })
  }, [onToast])

  const icons = { ok: '✓', warn: '⚠', err: '✕' }
  const cols = { ok: 'var(--grn)', warn: 'var(--amb)', err: 'var(--red)' }

  return (
    <div className="toasts">
      {toasts.map(t => (
        <div key={t.id} className="toast">
          <span style={{ color: cols[t.type] || cols.ok }}>{icons[t.type] || '✓'}</span>
          {t.msg}
        </div>
      ))}
    </div>
  )
}

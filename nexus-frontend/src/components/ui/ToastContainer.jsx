import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

let toastId = 0

const TOAST_META = {
  ok:   { icon: CheckCircle2, color: '#00ff9d' },
  warn: { icon: AlertTriangle, color: '#FFE234' },
  err:  { icon: XCircle,      color: '#ff5080' },
}

export default function ToastContainer() {
  const { onToast } = useApp()
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    return onToast((msg, type = 'ok') => {
      const id = ++toastId
      setToasts(prev => [...prev, { id, msg, type }])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
    })
  }, [onToast])

  return (
    <div className="toasts">
      {toasts.map(t => {
        const meta = TOAST_META[t.type] || TOAST_META.ok
        const Icon = meta.icon
        return (
          <div key={t.id} className="toast">
            <Icon size={13} style={{ color: meta.color, flexShrink: 0 }} />
            <span>{t.msg}</span>
          </div>
        )
      })}
    </div>
  )
}

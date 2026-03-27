import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { getActions } from '../services/api'
import ActionCard from '../components/ui/ActionCard'

export default function Actions() {
  const { state, dispatch } = useApp()
  const [filter, setFilter] = useState('all')
  const tabs = ['all', 'pending', 'sent', 'rejected']

  useEffect(() => {
    getActions().then(d => dispatch({ type: 'SET_ACTIONS', actions: d.actions || [] })).catch(() => {})
  }, [])

  let list = state.actions
  if (filter === 'pending') list = list.filter(a => a.status.includes('pending'))
  else if (filter === 'sent') list = list.filter(a => ['sent', 'approved'].includes(a.status))
  else if (filter === 'rejected') list = list.filter(a => a.status === 'rejected')

  return (
    <div>
      <div className="ph">
        <div className="pt">Agent Actions</div>
        <div className="ps-h">AI-drafted replies — approve to send the real email and create calendar events</div>
      </div>
      <div className="tabs">
        {tabs.map(t => (
          <div key={t} className={`tab${filter === t ? ' on' : ''}`} onClick={() => setFilter(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </div>
        ))}
      </div>
      <div id="actions-list">
        {list.length
          ? list.map(a => <ActionCard key={a.id} action={a} />)
          : <div className="empty"><div className="ei">⚡</div>No actions</div>
        }
      </div>
    </div>
  )
}

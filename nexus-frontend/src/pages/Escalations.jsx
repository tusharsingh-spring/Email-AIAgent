import { useApp } from '../context/AppContext'
import ActionCard from '../components/ui/ActionCard'

export default function Escalations() {
  const { state } = useApp()
  const escs = state.actions.filter(a => a.status === 'escalated')

  return (
    <div>
      <div className="ph">
        <div className="pt">Escalations</div>
        <div className="ps-h">LangGraph routed these to human review — urgency &gt; threshold or frustrated sentiment</div>
      </div>
      <div>
        {escs.length
          ? escs.map(a => <ActionCard key={a.id} action={a} />)
          : <div className="empty"><div className="ei">✓</div>No escalations</div>
        }
      </div>
    </div>
  )
}

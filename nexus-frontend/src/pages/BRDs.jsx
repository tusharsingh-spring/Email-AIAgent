import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { getBRDList } from '../services/api'
import BRDCard from '../components/ui/BRDCard'

export default function BRDs() {
  const { state, dispatch } = useApp()

  const load = async () => {
    try {
      const d = await getBRDList()
      const brds = {}
      ;(d.brds || []).forEach(b => {
        brds[b.job_id] = { title: b.title, sections_count: b.sections_count || '?', metadata: b.metadata || {}, email_id: b.email_id }
      })
      dispatch({ type: 'SET_BRDS', brds })
    } catch {}
  }

  return (
    <div>
      <div className="ph">
        <div className="pt">Generated BRDs</div>
        <div className="ps-h">Business Requirements Documents generated from real emails and transcripts</div>
      </div>
      <div>
        {Object.entries(state.brds).length
          ? Object.entries(state.brds).map(([jobId, brd]) => <BRDCard key={jobId} jobId={jobId} brd={brd} />)
          : <div className="empty"><div className="ei">◈</div>No BRDs yet — send an email asking for a BRD or upload a transcript</div>
        }
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'

const WS_URL = `ws://${window.location.hostname}:8000/ws/live`

export default function WebSocketProvider({ children }) {
  const { dispatch, toast, addLog } = useApp()
  const wsRef = useRef(null)
  const [wsStatus, setWsStatus] = useState('connecting')

  const connect = () => {
    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setWsStatus('connected')
        addLog('ok', 'NEXUS WebSocket connected')
      }

      ws.onclose = () => {
        setWsStatus('connecting')
        setTimeout(connect, 3000)
      }

      ws.onerror = () => {
        setWsStatus('error')
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          handle(msg)
        } catch {}
      }
    } catch {}
  }

  const handle = (msg) => {
    switch (msg.type) {
      case 'init':
        if (msg.authenticated) {
          dispatch({ type: 'SET_AUTH', authenticated: true, email: msg.owner_email })
        }
        if (msg.actions) dispatch({ type: 'SET_ACTIONS', actions: msg.actions })
        if (msg.meetings) dispatch({ type: 'SET_EVENTS', events: msg.meetings })
        if (msg.stats) dispatch({ type: 'SET_STATS', stats: msg.stats })
        break
      case 'log':
        addLog(msg.level, msg.msg)
        break
      case 'new_action':
        dispatch({ type: 'PREPEND_ACTION', payload: msg.payload })
        toast('AI Request: ' + (msg.payload.email?.subject || ''), 'ok')
        break
      case 'escalation':
        dispatch({ type: 'PREPEND_ACTION', payload: msg.payload })
        toast('ESCALATED: ' + (msg.payload.email?.subject || ''), 'warn')
        break
      case 'action_update':
        dispatch({ type: 'UPDATE_ACTION_STATUS', id: msg.id, status: msg.status })
        break
      case 'meeting_created':
        dispatch({ type: 'PREPEND_EVENT', event: msg.meeting })
        toast('Calendar event created: ' + (msg.meeting?.title || ''), 'ok')
        break
      case 'brd_stage':
        if (msg.project_id) dispatch({ type: 'SET_BRD_RUNNING', projectId: msg.project_id })
        break
      case 'brd_ready':
        dispatch({ type: 'ADD_BRD', jobId: msg.job_id, brd: { title: msg.title } })
        if (msg.project_id) dispatch({ type: 'CLEAR_BRD_RUNNING', projectId: msg.project_id })
        toast('BRD ready: ' + (msg.title || ''), 'ok')
        break
      case 'auth':
        dispatch({ type: 'SET_AUTH', authenticated: true, email: msg.email })
        toast('Google connected!', 'ok')
        break
      default:
        break
    }
  }

  useEffect(() => {
    connect()
    return () => wsRef.current?.close()
  }, [])

  return children
}

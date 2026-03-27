import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react'

const AppContext = createContext(null)

const initialState = {
  actions: [],
  emails: [],
  events: [],
  brds: {},
  authenticated: false,
  ownerEmail: '',
  brdRunning: {},
  stats: {},
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_AUTH':
      return { ...state, authenticated: action.authenticated, ownerEmail: action.email || state.ownerEmail }
    case 'SET_OWNER_EMAIL':
      return { ...state, ownerEmail: action.email }
    case 'SET_STATS':
      return { ...state, stats: action.stats }
    case 'SET_EMAILS':
      return { ...state, emails: action.emails }
    case 'SET_EVENTS':
      return { ...state, events: action.events }
    case 'SET_ACTIONS':
      return { ...state, actions: action.actions }
    case 'PREPEND_ACTION': {
      const exists = state.actions.find(a => a.id === action.payload.id)
      if (exists) {
        return { ...state, actions: state.actions.map(a => a.id === action.payload.id ? { ...a, ...action.payload } : a) }
      }
      return { ...state, actions: [action.payload, ...state.actions] }
    }
    case 'UPDATE_ACTION_STATUS':
      return { ...state, actions: state.actions.map(a => a.id === action.id ? { ...a, status: action.status } : a) }
    case 'PREPEND_EVENT':
      return { ...state, events: [action.event, ...state.events] }
    case 'SET_BRDS':
      return { ...state, brds: action.brds }
    case 'ADD_BRD':
      return { ...state, brds: { ...state.brds, [action.jobId]: action.brd } }
    case 'SET_BRD_RUNNING':
      return { ...state, brdRunning: { ...state.brdRunning, [action.projectId]: true } }
    case 'CLEAR_BRD_RUNNING': {
      const next = { ...state.brdRunning }
      delete next[action.projectId]
      return { ...state, brdRunning: next }
    }
    case 'CANCEL_EVENT':
      return { ...state, events: state.events.filter(e => e.id !== action.id) }
    default:
      return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const toastListeners = useRef([])
  const logListeners = useRef([])

  const toast = useCallback((msg, type = 'ok') => {
    toastListeners.current.forEach(fn => fn(msg, type))
  }, [])

  const addLog = useCallback((level, msg) => {
    logListeners.current.forEach(fn => fn(level, msg))
  }, [])

  const onToast = useCallback((fn) => {
    toastListeners.current.push(fn)
    return () => { toastListeners.current = toastListeners.current.filter(f => f !== fn) }
  }, [])

  const onLog = useCallback((fn) => {
    logListeners.current.push(fn)
    return () => { logListeners.current = logListeners.current.filter(f => f !== fn) }
  }, [])

  return (
    <AppContext.Provider value={{ state, dispatch, toast, addLog, onToast, onLog }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}

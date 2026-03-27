// All API calls go through Vite's dev proxy to http://localhost:8000
const BASE = ''

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, opts)
  return res.json()
}

// Auth
export const login = () => req('/auth/login')
export const callback = (code, state) => req(`/auth/callback?code=${code}&state=${state}`)
export const getAuthStatus = () => req('/auth/status')

// Stats & Metrics
export const getStats = () => req('/api/stats')
export const getMetrics = () => req('/api/metrics')
export const getSummary = () => req('/api/summary')

// Emails
export const getEmails = (limit = 5) => req(`/api/emails?limit=${limit}`)
export const getEmail = (id) => req(`/api/emails/${id}`)
export const processEmail = (id) => req(`/api/emails/process/${id}`, { method: 'POST' })
export const clusterManual = (email_ids, title) => 
  req('/api/emails/cluster-manual', { 
    method: 'POST', 
    headers: {'Content-Type': 'application/json'}, 
    body: JSON.stringify({email_ids, title}) 
  })

// Actions
export const getActions = (status='') => req(`/api/actions${status ? '?status='+status : ''}`)
export const getActionsBySections = () => req('/api/actions/sections')
export const approveAction = (id, body) => 
  req(`/api/actions/${id}/approve`, { 
    method: 'POST', 
    headers: {'Content-Type': 'application/json'}, 
    body: JSON.stringify(body || {}) 
  })
export const rejectAction = (id) => req(`/api/actions/${id}/reject`, { method: 'POST' })
export const editDraft = (id, body) => 
  req(`/api/actions/${id}/draft`, { 
    method: 'PUT', 
    headers: {'Content-Type': 'application/json'}, 
    body: JSON.stringify(body) 
  })

// Clusters
export const getPendingClusters = () => req('/api/clusters/pending')
export const forceRecluster = (limit = 5) => req(`/api/clusters/recluster?limit=${limit}`, { method: 'POST' })

// Projects
export const getProjects = () => req('/api/projects')
export const createProject = (name, description = '') => 
  req('/api/projects', { 
    method: 'POST', 
    headers: {'Content-Type': 'application/json'}, 
    body: JSON.stringify({name, description}) 
  })
export const getProject = (id) => req(`/api/projects/${id}`)
export const getProjectContext = (id) => req(`/api/projects/${id}/context`)
export const getProjectEmails = (id) => req(`/api/projects/${id}/emails`)
export const getProjectDocuments = (id) => req(`/api/projects/${id}/documents`)

export const getProjectBRD = (id) => req(`/api/projects/${id}/brd`)
export const getProjectBRDStatus = (id) => req(/api/projects/${id}/brd/status)
// export const getProjectBRDStatus = (id) => req(`/api/projects/${id}/brd/status`)
export const generateProjectBRD = (id) => req(`/api/projects/${id}/generate-brd`, { method: 'POST' })
export const runProjectAgent = (id) => req(`/api/projects/${id}/agent`, { method: 'POST' })
export const assignEmail = (id, email_id) => 
  req(`/api/projects/${id}/assign-email`, { 
    method: 'POST', 
    headers: {'Content-Type': 'application/json'}, 
    body: JSON.stringify({email_id}) 
  })
export const attachEmail = (id, email_id) => 
  req(`/api/projects/${id}/attach_email`, { 
    method: 'POST', 
    headers: {'Content-Type': 'application/json'}, 
    body: JSON.stringify({email_id}) 
  })
export const uploadProjectDoc = (projectId, file) => {
  const fd = new FormData()
  fd.append('file', file)
  return fetch(`${BASE}/api/projects/${projectId}/upload-doc`, { method: 'POST', body: fd }).then(r => r.json())
}

// Assignments
export const getUnassignedEmails = () => req('/api/emails/unassigned')

// BRDs
export const brdFromUpload = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return fetch(`${BASE}/api/brd/from-upload`, { method: 'POST', body: fd }).then(r => r.json())
}
export const getBrdResult = (id) => req(`/api/brd/${id}/result`)
export const getBrdSections = (jobId) => req(`/api/brd/${jobId}/sections`)
export const downloadBrd = (jobId) => window.open(`${BASE}/api/brd/${jobId}/download`, '_blank')
export const listBrds = () => req('/api/brd/list')

// Calendar
export const getCalendarEvents = (days = 14) => req(`/api/calendar/events?days=${days}`)
export const cancelEvent = (id) => req(`/api/calendar/events/${id}`, { method: 'DELETE' })

// Ingest
export const fetchMultiChannel = () => req('/api/multi-channel/fetch')
export const ingestMultiChannel = () => req('/api/multi-channel/ingest', { method: 'POST' })
export const noiseScoreTool = () => req('/api/tools/noise-score', { method: 'POST' })
export const ingestStatus = () => req('/api/ingest/status')
export const scanIngest = () => req('/api/ingest/scan', { method: 'POST' })
export const resetIngest = () => req('/api/ingest/reset', { method: 'POST' })

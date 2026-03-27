// All API calls go through Vite's dev proxy to http://localhost:8000
const BASE = ''

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, opts)
  return res.json()
}

// Auth
export const getAuthStatus = () => req('/auth/status')

// Stats & Metrics
export const getStats = () => req('/api/stats')
export const getMetrics = () => req('/api/metrics')

// Emails
export const getEmails = (limit = 5) => req(`/api/emails?limit=${limit}`)
export const getUnassignedEmails = () => req('/api/emails/unassigned')
export const processEmail = (id) => req(`/api/emails/process/${id}`, { method: 'POST' })
export const clusterManual = (email_ids, title) =>
  req('/api/emails/cluster-manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email_ids, title }),
  })

// Actions
export const getActions = () => req('/api/actions')
export const approveAction = (id, body) =>
  req(`/api/actions/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
export const rejectAction = (id) => req(`/api/actions/${id}/reject`, { method: 'POST' })

// Calendar
export const getCalendarEvents = (days = 14) => req(`/api/calendar/events?days=${days}`)
export const deleteCalendarEvent = (id) =>
  req(`/api/calendar/events/${id}`, { method: 'DELETE' })

// BRDs
export const getBRDList = () => req('/api/brd/list')
export const getBRDSections = (jobId) => req(`/api/brd/${jobId}/sections`)
export const getBRDResult = (jobId) => req(`/api/brd/${jobId}/result`)
export const downloadBRDUrl = (jobId) => `${BASE}/api/brd/${jobId}/download`

// Projects
export const getProjects = () => req('/api/projects')
export const createProject = (name, description = '') =>
  req('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  })
export const getProjectContext = (id) => req(`/api/projects/${id}/context`)
export const getProjectBRD = (id) => req(`/api/projects/${id}/brd`)
export const generateProjectBRD = (id) =>
  req(`/api/projects/${id}/generate-brd`, { method: 'POST' })
export const uploadProjectDoc = (projectId, file) => {
  const fd = new FormData()
  fd.append('file', file)
  return fetch(`${BASE}/api/projects/${projectId}/upload-doc`, { method: 'POST', body: fd }).then(r => r.json())
}
export const attachEmailToProject = (projectId, emailId) =>
  req(`/api/projects/${projectId}/attach_email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email_id: emailId }),
  })

// Upload BRD
export const uploadBRD = (file, projectId = '') => {
  const fd = new FormData()
  fd.append('file', file)
  const url = projectId
    ? `/api/projects/${projectId}/upload-doc`
    : '/api/brd/from-upload'
  return fetch(BASE + url, { method: 'POST', body: fd }).then(r => r.json())
}

// Unresolved
export const getUnresolved = () => req('/api/unresolved')
export const resolveUnresolved = (id, projectId) =>
  req(`/api/unresolved/${id}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId }),
  })
export const createProjectAndResolve = (id, project_name, description = '') =>
  req(`/api/unresolved/${id}/create-project-and-resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_name, description }),
  })

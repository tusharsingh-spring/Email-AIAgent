const BASE = import.meta?.env?.VITE_API_BASE || 'http://localhost:8000';

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) throw new Error(typeof data === 'string' ? data : data.error || res.statusText);
  return data;
}

export const api = {
  stats: () => request('GET', '/api/stats'),
  actions: () => request('GET', '/api/actions'),
  projects: () => request('GET', '/api/projects'),
  projectContext: (id) => request('GET', `/api/projects/${id}/context`),
  approveAction: (id, body) => request('POST', `/api/actions/${id}/approve`, body ? { body } : {}),
  rejectAction: (id) => request('POST', `/api/actions/${id}/reject`),
  attachEmail: (pid, eid) => request('POST', `/api/projects/${pid}/attach_email`, { email_id: eid }),
};

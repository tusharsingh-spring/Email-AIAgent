import { state } from '../state.js';

export function ActionsView() {
  const actions = state.actions || [];
  if (!actions.length) {
    return `<div class="card">No actions loaded yet.</div>`;
  }
  return /* html */`
    <div>
      <header class="top"><div><div style="font-size:13px;color:var(--txt2)">Agent Actions</div><div style="font-size:18px;font-weight:800">Actions</div></div></header>
      <div class="list">
        ${actions.map(a => `
          <div class="list-item">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
              <div>
                <div style="font-weight:600">${a.email?.subject || '—'}</div>
                <div style="font-size:12px;color:var(--txt2)">${a.email?.sender || ''}</div>
              </div>
              <span class="badge ${badgeClass(a.status)}">${a.status}</span>
            </div>
            ${a.project_suggestion ? `
              <div style="margin-top:8px;font-size:12px;color:var(--txt2)">
                Suggests project: <strong>${a.project_suggestion.project_name}</strong>
                <span class="badge amber">conf ${a.project_suggestion.confidence}</span>
                <div style="font-size:11px;color:var(--txt2)">${a.project_suggestion.reason}</div>
              </div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function badgeClass(status) {
  if ((status||'').includes('pending')) return 'amber';
  if (status === 'sent' || status === 'approved') return 'green';
  if (status === 'escalated') return 'red';
  return 'amber';
}

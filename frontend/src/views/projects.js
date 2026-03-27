import { state } from '../state.js';

export function ProjectsView() {
  const projects = state.projects || [];
  if (!projects.length) return `<div class="card">No projects yet.</div>`;
  return /* html */`
    <div>
      <header class="top"><div><div style="font-size:13px;color:var(--txt2)">Project Intelligence</div><div style="font-size:18px;font-weight:800">Projects</div></div></header>
      <div class="list">
        ${projects.map(p => `
          <div class="list-item">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
              <div>
                <div style="font-weight:600">${p.name || 'Project'}</div>
                <div style="font-size:12px;color:var(--txt2)">${p.status || ''}</div>
              </div>
              <span class="badge amber">${p.id.slice(0,8)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

import { setView, state } from '../state.js';

const ITEMS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'actions', label: 'Actions' },
  { id: 'projects', label: 'Projects' },
];

export function Nav() {
  return /* html */`
    <aside class="sidebar">
      <div style="font-weight:800;letter-spacing:0.3px;margin-bottom:12px">NEXUS</div>
      <div class="list">
        ${ITEMS.map(i => `
          <div class="nav-item ${state.current === i.id ? 'active' : ''}" data-nav="${i.id}">${i.label}</div>
        `).join('')}
      </div>
    </aside>
  `;
}

export function bindNav(root) {
  root.querySelectorAll('[data-nav]').forEach(el => {
    el.onclick = () => setView(el.dataset.nav);
  });
}

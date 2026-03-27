import { state } from '../state.js';

export function DashboardView() {
  const s = state.stats || {};
  return /* html */`
    <div>
      <header class="top">
        <div>
          <div style="font-size:13px;color:var(--txt2)">Command Center</div>
          <div style="font-size:18px;font-weight:800">Dashboard</div>
        </div>
        <div class="badge amber">Live</div>
      </header>
      <div class="card">
        <div style="font-size:12px;color:var(--txt2);margin-bottom:6px">Snapshot</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
          ${[
            ['Emails processed', s.processed || s.emails_processed || '—'],
            ['Meetings', s.meetings || '—'],
            ['Pending actions', s.pending || '—'],
            ['Clusters awaiting', s.pending_clusters || 0],
            ['Escalations', s.escalations || 0],
            ['BRDs', s.brds || s.brds_generated || 0],
          ].map(([label,val])=>`
            <div class="card" style="padding:12px">
              <div style="font-size:22px;font-weight:800;color:var(--accent)">${val}</div>
              <div style="font-size:11px;color:var(--txt2)">${label}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

import { Nav, bindNav } from './components/Nav.js';
import { DashboardView } from './views/dashboard.js';
import { ActionsView } from './views/actions.js';
import { ProjectsView } from './views/projects.js';
import { state, subscribe, loadStats, loadActions, loadProjects } from './state.js';

const views = {
  dashboard: DashboardView,
  actions: ActionsView,
  projects: ProjectsView,
};

function render() {
  const app = document.getElementById('app');
  if (!app) return;
  const View = views[state.current] || DashboardView;
  app.innerHTML = `
    <div class="shell">
      ${Nav()}
      <main class="content">${View()}</main>
    </div>
  `;
  bindNav(app);
}

subscribe(render);
render();

// initial data load
Promise.all([loadStats(), loadActions(), loadProjects()]).catch(err => console.error(err));

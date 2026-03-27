import '../styles.css';
import { ProjectsView } from '../views/projects.js';
import { loadProjects, subscribe } from '../state.js';
import { Nav, bindNav } from '../components/Nav.js';

function render() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="shell">
      ${Nav()}
      <main class="content">${ProjectsView()}</main>
    </div>`;
  bindNav(app);
}

subscribe(render);
render();
loadProjects().catch(console.error);

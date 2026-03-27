import '../styles.css';
import { ActionsView } from '../views/actions.js';
import { loadActions, subscribe } from '../state.js';
import { Nav, bindNav } from '../components/Nav.js';

function render() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="shell">
      ${Nav()}
      <main class="content">${ActionsView()}</main>
    </div>`;
  bindNav(app);
}

subscribe(render);
render();
loadActions().catch(console.error);

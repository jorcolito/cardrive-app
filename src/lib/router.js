import { isAuthenticated } from './auth.js';
import { renderSidebar, setupSidebar } from '../components/sidebar.js';
import { renderTopbar } from '../components/topbar.js';
import { renderToastHost, showToast } from '../components/toast.js';
import { renderApprovalsPage } from '../pages/approvals.js';
import { renderCashboxPage } from '../pages/cashbox.js';
import { renderContractsPage } from '../pages/contracts.js';
import { renderDashboardPage } from '../pages/dashboard.js';
import { renderLoginPage, setupLoginPage } from '../pages/login.js';
import { renderReservationsPage } from '../pages/reservations.js';
import { renderVehiclesPage, setupVehiclesPage } from '../pages/vehicles.js';

const routes = {
  '/dashboard': {
    title: 'Dashboard',
    subtitle: 'Resumen operativo de CARDRIVE',
    view: renderDashboardPage,
  },
  '/vehicles': {
    title: 'Vehículos',
    subtitle: 'Control de flota y disponibilidad',
    view: renderVehiclesPage,
    setup: setupVehiclesPage,
  },
  '/reservations': {
    title: 'Reservas',
    subtitle: 'Seguimiento de solicitudes y entregas próximas',
    view: renderReservationsPage,
  },
  '/contracts': {
    title: 'Contratos',
    subtitle: 'Documentos preparados para futuras operaciones',
    view: renderContractsPage,
  },
  '/approvals': {
    title: 'Aprobaciones',
    subtitle: 'Revisión interna de procesos pendientes',
    view: renderApprovalsPage,
  },
  '/cashbox': {
    title: 'Caja diaria',
    subtitle: 'Vista base para ingresos y movimientos del día',
    view: renderCashboxPage,
  },
};

function getCurrentPath() {
  const hash = window.location.hash.replace('#', '');
  return hash || '/dashboard';
}

function navigate(path) {
  window.location.hash = path;
}

function renderShell(app, route, path) {
  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar(path)}
      <div class="app-content">
        ${renderTopbar(route.title, route.subtitle)}
        <main class="page-content" id="page-content">
          ${route.view()}
        </main>
      </div>
    </div>
    ${renderToastHost()}
  `;

  setupSidebar({ navigate, showToast });
  route.setup?.({ showToast });
}

function render(app) {
  const path = getCurrentPath();

  if (path === '/login') {
    app.innerHTML = `${renderLoginPage()}${renderToastHost()}`;
    setupLoginPage({ navigate, showToast });
    return;
  }

  if (!isAuthenticated()) {
    navigate('/login');
    return;
  }

  const route = routes[path] ?? routes['/dashboard'];

  if (!routes[path]) {
    navigate('/dashboard');
    return;
  }

  renderShell(app, route, path);
}

export function startRouter(app) {
  window.addEventListener('hashchange', () => render(app));

  if (!window.location.hash) {
    window.location.hash = isAuthenticated() ? '/dashboard' : '/login';
    return;
  }

  render(app);
}

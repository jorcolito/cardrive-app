import { endDemoSession } from '../lib/auth.js';

const navigationItems = [
  { label: 'Dashboard', path: '/dashboard', icon: 'grid' },
  { label: 'Vehículos', path: '/vehicles', icon: 'car' },
  { label: 'Reservas', path: '/reservations', icon: 'calendar' },
  { label: 'Contratos', path: '/contracts', icon: 'file' },
  { label: 'Aprobaciones', path: '/approvals', icon: 'check' },
  { label: 'Caja diaria', path: '/cashbox', icon: 'cash' },
];

const icons = {
  grid: '▦',
  car: '▱',
  calendar: '□',
  file: '▤',
  check: '✓',
  cash: '$',
};

export function renderSidebar(activePath) {
  const links = navigationItems
    .map((item) => {
      const isActive = item.path === activePath ? 'is-active' : '';

      return `
        <button class="sidebar-link ${isActive}" type="button" data-route="${item.path}">
          <span class="sidebar-icon" aria-hidden="true">${icons[item.icon]}</span>
          <span>${item.label}</span>
        </button>
      `;
    })
    .join('');

  return `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">C</div>
        <div>
          <strong>CARDRIVE</strong>
          <span>Rentadora</span>
        </div>
      </div>

      <nav class="sidebar-nav" aria-label="Navegación principal">
        ${links}
      </nav>

      <button class="sidebar-link logout-link" type="button" data-logout>
        <span class="sidebar-icon" aria-hidden="true">↩</span>
        <span>Cerrar sesión</span>
      </button>
    </aside>
  `;
}

export function setupSidebar({ navigate, showToast }) {
  document.querySelectorAll('[data-route]').forEach((button) => {
    button.addEventListener('click', () => {
      navigate(button.dataset.route);
    });
  });

  document.querySelector('[data-logout]')?.addEventListener('click', () => {
    endDemoSession();
    showToast('Sesión de demostración cerrada.');
    navigate('/login');
  });
}

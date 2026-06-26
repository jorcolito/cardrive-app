import { supabase } from '../lib/supabaseClient.js';

const statusLabels = {
  AVAILABLE: 'Disponible',
  RESERVED: 'Reservado',
  RENTED: 'Rentado',
  INTERNAL_MOVEMENT_PENDING: 'Mov. interno pendiente',
  IN_INTERNAL_MOVEMENT: 'En mov. interno',
  MAINTENANCE: 'Mantenimiento',
  OUT_OF_SERVICE: 'Fuera de servicio',
};

let vehicles = [];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return '—';
  }

  return new Intl.NumberFormat('es-EC').format(numericValue);
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return '—';
  }

  return new Intl.NumberFormat('es-EC', {
    currency: 'USD',
    style: 'currency',
  }).format(numericValue);
}

function getStatusLabel(status) {
  return statusLabels[status] ?? 'Sin estado';
}

function renderStatusOptions() {
  return Object.entries(statusLabels)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join('');
}

function renderVehicleRows(items) {
  return items
    .map((vehicle) => {
      const vehicleName = [vehicle.brand, vehicle.model].filter(Boolean).join(' ');
      const statusClass = vehicle.status ? vehicle.status.toLowerCase().replaceAll('_', '-') : 'unknown';

      return `
        <tr>
          <td data-label="Placa"><strong>${escapeHtml(vehicle.plate || 'Sin placa')}</strong></td>
          <td data-label="Vehículo">${escapeHtml(vehicleName || 'Sin detalle')}</td>
          <td data-label="Color">${escapeHtml(vehicle.color || '—')}</td>
          <td data-label="Año">${escapeHtml(vehicle.year || '—')}</td>
          <td data-label="Km actual">${formatNumber(vehicle.current_km)}</td>
          <td data-label="Tarifa diaria">${formatCurrency(vehicle.daily_rate)}</td>
          <td data-label="Estado">
            <span class="status-badge status-${statusClass}">${escapeHtml(getStatusLabel(vehicle.status))}</span>
          </td>
          <td data-label="Notas">${escapeHtml(vehicle.notes || '—')}</td>
        </tr>
      `;
    })
    .join('');
}

function renderEmptyState(message) {
  return `
    <div class="empty-state">
      <div class="placeholder-icon">▱</div>
      <h2>Sin vehículos</h2>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function getFilteredVehicles() {
  const search = document.querySelector('#vehicle-search')?.value.trim().toLowerCase() ?? '';
  const status = document.querySelector('#vehicle-status')?.value ?? '';

  return vehicles.filter((vehicle) => {
    const searchable = [vehicle.plate, vehicle.brand, vehicle.model].join(' ').toLowerCase();
    const matchesSearch = !search || searchable.includes(search);
    const matchesStatus = !status || vehicle.status === status;

    return matchesSearch && matchesStatus;
  });
}

function renderTable(items) {
  const container = document.querySelector('#vehicles-results');

  if (!container) {
    return;
  }

  if (!vehicles.length) {
    container.innerHTML = renderEmptyState('Cuando registres vehículos en Supabase aparecerán aquí.');
    return;
  }

  if (!items.length) {
    container.innerHTML = renderEmptyState('No hay vehículos que coincidan con los filtros actuales.');
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Placa</th>
            <th>Vehículo</th>
            <th>Color</th>
            <th>Año</th>
            <th>Km actual</th>
            <th>Tarifa diaria</th>
            <th>Estado</th>
            <th>Notas</th>
          </tr>
        </thead>
        <tbody>
          ${renderVehicleRows(items)}
        </tbody>
      </table>
    </div>
  `;
}

function applyFilters() {
  renderTable(getFilteredVehicles());
}

function renderError(message) {
  const container = document.querySelector('#vehicles-results');

  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="error-state">
      <h2>No se pudieron cargar los vehículos</h2>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

async function loadVehicles(showToast) {
  const container = document.querySelector('#vehicles-results');

  if (container) {
    container.innerHTML = `
      <div class="loading-state">
        <span class="loading-spinner" aria-hidden="true"></span>
        <p>Cargando vehículos...</p>
      </div>
    `;
  }

  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    vehicles = [];
    renderError(error.message);
    showToast?.('No se pudieron cargar los vehículos.');
    return;
  }

  vehicles = data ?? [];
  applyFilters();
}

export function renderVehiclesPage() {
  return `
    <section class="module-page">
      <div class="module-header">
        <div>
          <p class="eyebrow">Flota</p>
          <h2>Vehículos</h2>
        </div>
        <button class="primary-button module-action" type="button">Nuevo vehículo</button>
      </div>

      <div class="filter-bar">
        <label>
          Buscar
          <input id="vehicle-search" type="search" placeholder="Placa, marca o modelo" autocomplete="off" />
        </label>

        <label>
          Estado
          <select id="vehicle-status">
            <option value="">Todos los estados</option>
            ${renderStatusOptions()}
          </select>
        </label>
      </div>

      <div id="vehicles-results"></div>
    </section>
  `;
}

export function setupVehiclesPage({ showToast }) {
  document.querySelector('#vehicle-search')?.addEventListener('input', applyFilters);
  document.querySelector('#vehicle-status')?.addEventListener('change', applyFilters);

  loadVehicles(showToast);
}

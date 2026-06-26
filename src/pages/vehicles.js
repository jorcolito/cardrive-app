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
let showVehiclesToast;
let vehiclesPageController;

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

function renderVehicles(items) {
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
  renderVehicles(getFilteredVehicles());
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

function setFieldError(fieldName, message) {
  const field = document.querySelector(`[data-vehicle-error="${fieldName}"]`);

  if (field) {
    field.textContent = message;
  }
}

function clearVehicleFormErrors() {
  document.querySelectorAll('[data-vehicle-error]').forEach((field) => {
    field.textContent = '';
  });

  const formError = document.querySelector('#vehicle-form-error');

  if (formError) {
    formError.textContent = '';
    formError.hidden = true;
  }
}

function showVehicleFormError(message) {
  const formError = document.querySelector('#vehicle-form-error');

  if (!formError) {
    return;
  }

  formError.textContent = message;
  formError.hidden = !message;
}

function getVehicleFormPayload(form) {
  const formData = new FormData(form);
  const year = formData.get('year')?.toString().trim();
  const currentKm = formData.get('current_km')?.toString().trim();
  const dailyRate = formData.get('daily_rate')?.toString().trim();
  const notes = formData.get('notes')?.toString().trim();

  return {
    plate: formData.get('plate')?.toString().trim().toUpperCase() ?? '',
    brand: formData.get('brand')?.toString().trim() ?? '',
    model: formData.get('model')?.toString().trim() ?? '',
    color: formData.get('color')?.toString().trim() || null,
    year: year ? Number(year) : null,
    current_km: currentKm ? Number(currentKm) : Number.NaN,
    daily_rate: dailyRate ? Number(dailyRate) : Number.NaN,
    status: formData.get('status')?.toString() || 'AVAILABLE',
    notes: notes || null,
  };
}

function validateVehiclePayload(payload) {
  let isValid = true;

  clearVehicleFormErrors();

  if (!payload.plate) {
    setFieldError('plate', 'La placa es obligatoria.');
    isValid = false;
  }

  if (!payload.brand) {
    setFieldError('brand', 'La marca es obligatoria.');
    isValid = false;
  }

  if (!payload.model) {
    setFieldError('model', 'El modelo es obligatorio.');
    isValid = false;
  }

  if (!Number.isFinite(payload.current_km) || payload.current_km < 0) {
    setFieldError('current_km', 'Ingresa un kilometraje válido, mayor o igual a 0.');
    isValid = false;
  }

  if (!Number.isFinite(payload.daily_rate) || payload.daily_rate < 0) {
    setFieldError('daily_rate', 'Ingresa una tarifa válida, mayor o igual a 0.');
    isValid = false;
  }

  if (payload.year !== null && (!Number.isInteger(payload.year) || payload.year < 1990 || payload.year > 2035)) {
    setFieldError('year', 'El año debe estar entre 1990 y 2035.');
    isValid = false;
  }

  return isValid;
}

function resetVehicleForm() {
  const form = document.querySelector('#vehicle-form');

  if (!form) {
    return;
  }

  form.reset();
  form.querySelector('[name="status"]').value = 'AVAILABLE';
  clearVehicleFormErrors();
}

function setVehicleFormLoading(isLoading) {
  const form = document.querySelector('#vehicle-form');
  const submitButton = document.querySelector('#save-vehicle-button');

  if (form) {
    form.querySelectorAll('input, select, textarea, button').forEach((field) => {
      field.disabled = isLoading;
    });
  }

  if (submitButton) {
    submitButton.textContent = isLoading ? 'Guardando...' : 'Guardar vehículo';
  }
}

function openVehicleModal() {
  const modal = document.querySelector('#vehicle-modal');

  if (!modal) {
    return;
  }

  clearVehicleFormErrors();
  modal.hidden = false;
  document.body.classList.add('modal-open');
  document.querySelector('#vehicle-plate')?.focus();
}

function closeVehicleModal() {
  const modal = document.querySelector('#vehicle-modal');

  if (!modal) {
    return;
  }

  modal.hidden = true;
  document.body.classList.remove('modal-open');
  resetVehicleForm();
}

async function handleCreateVehicle(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const payload = getVehicleFormPayload(form);

  if (!validateVehiclePayload(payload)) {
    return;
  }

  setVehicleFormLoading(true);
  showVehicleFormError('');

  const { error } = await supabase.from('vehicles').insert(payload);

  setVehicleFormLoading(false);

  if (error) {
    showVehicleFormError(error.message);
    return;
  }

  closeVehicleModal();
  await loadVehicles();
  showVehiclesToast?.('Vehículo creado correctamente.');
}

function renderVehicleModal() {
  return `
    <div class="modal-backdrop" id="vehicle-modal" hidden>
      <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="vehicle-modal-title">
        <div class="modal-header">
          <div>
            <p class="eyebrow">Flota</p>
            <h2 id="vehicle-modal-title">Nuevo vehículo</h2>
          </div>
          <button class="icon-button" id="close-vehicle-modal" type="button" aria-label="Cerrar modal">×</button>
        </div>

        <form class="vehicle-form" id="vehicle-form" novalidate>
          <div class="form-alert" id="vehicle-form-error" hidden></div>

          <div class="form-grid">
            <label>
              Placa
              <input id="vehicle-plate" name="plate" type="text" autocomplete="off" />
              <span class="field-error" data-vehicle-error="plate"></span>
            </label>

            <label>
              Marca
              <input name="brand" type="text" autocomplete="off" />
              <span class="field-error" data-vehicle-error="brand"></span>
            </label>

            <label>
              Modelo
              <input name="model" type="text" autocomplete="off" />
              <span class="field-error" data-vehicle-error="model"></span>
            </label>

            <label>
              Color
              <input name="color" type="text" autocomplete="off" />
              <span class="field-error" data-vehicle-error="color"></span>
            </label>

            <label>
              Año
              <input name="year" type="number" min="1990" max="2035" step="1" inputmode="numeric" />
              <span class="field-error" data-vehicle-error="year"></span>
            </label>

            <label>
              Kilometraje actual
              <input name="current_km" type="number" min="0" step="1" inputmode="numeric" />
              <span class="field-error" data-vehicle-error="current_km"></span>
            </label>

            <label>
              Tarifa diaria
              <input name="daily_rate" type="number" min="0" step="0.01" inputmode="decimal" />
              <span class="field-error" data-vehicle-error="daily_rate"></span>
            </label>

            <label>
              Estado
              <select name="status">
                ${renderStatusOptions()}
              </select>
              <span class="field-error" data-vehicle-error="status"></span>
            </label>
          </div>

          <label class="full-field">
            Notas
            <textarea name="notes" rows="4"></textarea>
            <span class="field-error" data-vehicle-error="notes"></span>
          </label>

          <div class="modal-actions">
            <button class="secondary-button" id="cancel-vehicle-modal" type="button">Cancelar</button>
            <button class="primary-button" id="save-vehicle-button" type="submit">Guardar vehículo</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function renderVehiclesPage() {
  return `
    <section class="module-page">
      <div class="module-header">
        <div>
          <p class="eyebrow">Flota</p>
          <h2>Vehículos</h2>
        </div>
        <button class="primary-button module-action" id="new-vehicle-button" type="button">Nuevo vehículo</button>
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
      ${renderVehicleModal()}
    </section>
  `;
}

export function setupVehiclesPage({ showToast }) {
  vehiclesPageController?.abort();
  vehiclesPageController = new AbortController();

  const { signal } = vehiclesPageController;

  showVehiclesToast = showToast;
  document.querySelector('#vehicle-search')?.addEventListener('input', applyFilters, { signal });
  document.querySelector('#vehicle-status')?.addEventListener('change', applyFilters, { signal });
  document.querySelector('#new-vehicle-button')?.addEventListener('click', openVehicleModal, { signal });
  document.querySelector('#close-vehicle-modal')?.addEventListener('click', closeVehicleModal, { signal });
  document.querySelector('#cancel-vehicle-modal')?.addEventListener('click', closeVehicleModal, { signal });
  document.querySelector('#vehicle-form')?.addEventListener('submit', handleCreateVehicle, { signal });
  document.querySelector('#vehicle-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'vehicle-modal') {
      closeVehicleModal();
    }
  }, { signal });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.querySelector('#vehicle-modal')?.hidden) {
      closeVehicleModal();
    }
  }, { signal });

  loadVehicles(showToast);
}

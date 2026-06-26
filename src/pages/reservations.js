import { supabase } from '../lib/supabaseClient.js';

const reservationStatusLabels = {
  TENTATIVE: 'Tentativa',
  CONFIRMED: 'Confirmada',
  CONVERTED_TO_CONTRACT: 'Convertida a contrato',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No se presentó',
};

const paymentMethodLabels = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
};

let reservations = [];
let clients = [];
let vehicles = [];
let showReservationsToast;
let reservationsPageController;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function parseLocalDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

function parseLocalDateTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value ?? '');

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const date = new Date(year, month - 1, day, hour, minute);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }

  return date;
}

function getLocalDateFromDateTime(value) {
  const dateTime = parseLocalDateTime(value);

  if (!dateTime) {
    return null;
  }

  return new Date(dateTime.getFullYear(), dateTime.getMonth(), dateTime.getDate());
}

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('es-EC', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
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

function getReservationStatusLabel(status) {
  return reservationStatusLabels[status] ?? 'Sin estado';
}

function getPaymentMethodLabel(method) {
  return paymentMethodLabels[method] ?? '—';
}

function getStatusClass(status) {
  return status ? status.toLowerCase().replaceAll('_', '-') : 'unknown';
}

function renderReservationStatusOptions() {
  return Object.entries(reservationStatusLabels)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join('');
}

function renderPaymentMethodOptions() {
  return Object.entries(paymentMethodLabels)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join('');
}

function getClientLabel(client) {
  return [client.full_name, client.cedula_ruc].filter(Boolean).join(' · ') || 'Cliente sin detalle';
}

function getVehicleLabel(vehicle) {
  const vehicleName = [vehicle.brand, vehicle.model].filter(Boolean).join(' ');
  const details = [vehicle.plate, vehicleName].filter(Boolean).join(' · ');
  const rate = vehicle.daily_rate !== null && vehicle.daily_rate !== undefined ? ` · ${formatCurrency(vehicle.daily_rate)}` : '';

  return `${details || 'Vehículo sin detalle'}${rate}`;
}

function renderClientOptions() {
  if (!clients.length) {
    return '<option value="">No hay clientes disponibles</option>';
  }

  return `
    <option value="">Selecciona un cliente</option>
    ${clients
      .map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(getClientLabel(client))}</option>`)
      .join('')}
  `;
}

function renderVehicleOptions() {
  if (!vehicles.length) {
    return '<option value="">No hay vehículos disponibles</option>';
  }

  return `
    <option value="">Selecciona un vehículo</option>
    ${vehicles
      .map((vehicle) => `<option value="${escapeHtml(vehicle.id)}">${escapeHtml(getVehicleLabel(vehicle))}</option>`)
      .join('')}
  `;
}

function renderReservationRows(items) {
  return items
    .map((reservation) => {
      const client = reservation.client ?? {};
      const vehicle = reservation.vehicle ?? {};
      const vehicleName = [vehicle.brand, vehicle.model].filter(Boolean).join(' ');
      const statusClass = getStatusClass(reservation.status);

      return `
        <tr>
          <td data-label="Cliente">
            <strong>${escapeHtml(client.full_name || 'Sin cliente')}</strong>
            <span class="table-muted">${escapeHtml(client.cedula_ruc || '—')}</span>
          </td>
          <td data-label="Vehículo">
            <strong>${escapeHtml(vehicle.plate || 'Sin placa')}</strong>
            <span class="table-muted">${escapeHtml(vehicleName || 'Sin detalle')}</span>
          </td>
          <td data-label="Inicio">${formatDateTime(reservation.start_at)}</td>
          <td data-label="Fin">${formatDateTime(reservation.end_at)}</td>
          <td data-label="Estado">
            <span class="status-badge status-${statusClass}">${escapeHtml(getReservationStatusLabel(reservation.status))}</span>
          </td>
          <td data-label="Abono">${formatCurrency(reservation.deposit_amount)}</td>
          <td data-label="Método">${escapeHtml(getPaymentMethodLabel(reservation.deposit_method))}</td>
          <td data-label="Notas">${escapeHtml(reservation.notes || '—')}</td>
        </tr>
      `;
    })
    .join('');
}

function renderEmptyState(message) {
  return `
    <div class="empty-state">
      <div class="placeholder-icon">□</div>
      <h2>Sin reservas</h2>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function getFilteredReservations() {
  const search = document.querySelector('#reservation-search')?.value.trim().toLowerCase() ?? '';
  const status = document.querySelector('#reservation-status')?.value ?? '';

  return reservations.filter((reservation) => {
    const client = reservation.client ?? {};
    const vehicle = reservation.vehicle ?? {};
    const searchable = [
      client.full_name,
      client.cedula_ruc,
      vehicle.plate,
      vehicle.brand,
      vehicle.model,
    ]
      .join(' ')
      .toLowerCase();
    const matchesSearch = !search || searchable.includes(search);
    const matchesStatus = !status || reservation.status === status;

    return matchesSearch && matchesStatus;
  });
}

function renderReservations(items) {
  const container = document.querySelector('#reservations-results');

  if (!container) {
    return;
  }

  if (!reservations.length) {
    container.innerHTML = renderEmptyState('Cuando registres reservas en Supabase aparecerán aquí.');
    return;
  }

  if (!items.length) {
    container.innerHTML = renderEmptyState('No hay reservas que coincidan con los filtros actuales.');
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Vehículo</th>
            <th>Inicio</th>
            <th>Fin</th>
            <th>Estado</th>
            <th>Abono</th>
            <th>Método</th>
            <th>Notas</th>
          </tr>
        </thead>
        <tbody>
          ${renderReservationRows(items)}
        </tbody>
      </table>
    </div>
  `;
}

function applyReservationFilters() {
  renderReservations(getFilteredReservations());
}

function renderError(message) {
  const container = document.querySelector('#reservations-results');

  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="error-state">
      <h2>No se pudieron cargar las reservas</h2>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

async function loadReservationOptions() {
  const [clientsResponse, vehiclesResponse] = await Promise.all([
    supabase
      .from('clients')
      .select('id, cedula_ruc, full_name, phone, email, license_expiry')
      .order('full_name', { ascending: true }),
    supabase
      .from('vehicles')
      .select('id, plate, brand, model, status, current_km, daily_rate')
      .order('plate', { ascending: true }),
  ]);

  if (clientsResponse.error) {
    throw clientsResponse.error;
  }

  if (vehiclesResponse.error) {
    throw vehiclesResponse.error;
  }

  clients = clientsResponse.data ?? [];
  vehicles = vehiclesResponse.data ?? [];
}

async function loadReservations(showToast) {
  const container = document.querySelector('#reservations-results');

  if (container) {
    container.innerHTML = `
      <div class="loading-state">
        <span class="loading-spinner" aria-hidden="true"></span>
        <p>Cargando reservas...</p>
      </div>
    `;
  }

  const { data, error } = await supabase
    .from('reservations')
    .select(`
      *,
      client:clients(full_name, cedula_ruc, phone, license_expiry),
      vehicle:vehicles(plate, brand, model, daily_rate)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    reservations = [];
    renderError(error.message);
    showToast?.('No se pudieron cargar las reservas.');
    return;
  }

  reservations = data ?? [];
  applyReservationFilters();
}

function setReservationFieldError(fieldName, message) {
  const field = document.querySelector(`[data-reservation-error="${fieldName}"]`);

  if (field) {
    field.textContent = message;
  }
}

function clearReservationFormErrors() {
  document.querySelectorAll('[data-reservation-error]').forEach((field) => {
    field.textContent = '';
  });

  const formError = document.querySelector('#reservation-form-error');

  if (formError) {
    formError.textContent = '';
    formError.hidden = true;
  }
}

function showReservationFormError(message) {
  const formError = document.querySelector('#reservation-form-error');

  if (!formError) {
    return;
  }

  formError.textContent = message;
  formError.hidden = !message;
}

function getReservationFormPayload(form) {
  const formData = new FormData(form);
  const depositAmount = formData.get('deposit_amount')?.toString().trim();
  const depositMethod = formData.get('deposit_method')?.toString() || '';
  const notes = formData.get('notes')?.toString().trim();

  return {
    client_id: formData.get('client_id')?.toString() ?? '',
    vehicle_id: formData.get('vehicle_id')?.toString() ?? '',
    start_at: formData.get('start_at')?.toString() ?? '',
    end_at: formData.get('end_at')?.toString() ?? '',
    status: formData.get('status')?.toString() || 'TENTATIVE',
    deposit_amount: depositAmount ? Number(depositAmount) : 0,
    deposit_method: depositMethod || null,
    notes: notes || null,
  };
}

function validateReservationPayload(payload) {
  let isValid = true;

  clearReservationFormErrors();

  if (!payload.client_id) {
    setReservationFieldError('client_id', 'El cliente es obligatorio.');
    isValid = false;
  }

  if (!payload.vehicle_id) {
    setReservationFieldError('vehicle_id', 'El vehículo es obligatorio.');
    isValid = false;
  }

  const startDate = parseLocalDateTime(payload.start_at);
  const endDate = parseLocalDateTime(payload.end_at);

  if (!startDate) {
    setReservationFieldError('start_at', 'La fecha/hora de inicio es obligatoria.');
    isValid = false;
  }

  if (!endDate) {
    setReservationFieldError('end_at', 'La fecha/hora de fin es obligatoria.');
    isValid = false;
  }

  if (startDate && startDate.getTime() < Date.now()) {
    setReservationFieldError('start_at', 'El inicio no puede estar en el pasado.');
    isValid = false;
  }

  if (startDate && endDate && endDate.getTime() <= startDate.getTime()) {
    setReservationFieldError('end_at', 'La fecha/hora de fin debe ser mayor a la de inicio.');
    isValid = false;
  }

  const selectedClient = clients.find((client) => String(client.id) === String(payload.client_id));
  const licenseDate = parseLocalDate(selectedClient?.license_expiry);
  const reservationStartDate = getLocalDateFromDateTime(payload.start_at);

  if (licenseDate && reservationStartDate && licenseDate.getTime() < reservationStartDate.getTime()) {
    const message = 'La licencia del cliente estará vencida para la fecha de reserva.';

    setReservationFieldError('client_id', message);
    showReservationFormError(message);
    isValid = false;
  }

  if (!Number.isFinite(payload.deposit_amount) || payload.deposit_amount < 0) {
    setReservationFieldError('deposit_amount', 'El abono no puede ser negativo.');
    isValid = false;
  }

  if (Number.isFinite(payload.deposit_amount) && payload.deposit_amount > 0 && !payload.deposit_method) {
    setReservationFieldError('deposit_method', 'Selecciona el método de abono.');
    isValid = false;
  }

  return isValid;
}

function resetReservationForm() {
  const form = document.querySelector('#reservation-form');

  if (!form) {
    return;
  }

  form.reset();
  form.querySelector('[name="status"]').value = 'TENTATIVE';
  clearReservationFormErrors();
}

function setReservationFormLoading(isLoading) {
  const form = document.querySelector('#reservation-form');
  const submitButton = document.querySelector('#save-reservation-button');

  if (form) {
    form.querySelectorAll('input, select, textarea, button').forEach((field) => {
      field.disabled = isLoading;
    });
  }

  if (submitButton) {
    submitButton.textContent = isLoading ? 'Guardando...' : 'Guardar reserva';
  }
}

function refreshReservationSelects() {
  const clientSelect = document.querySelector('#reservation-client');
  const vehicleSelect = document.querySelector('#reservation-vehicle');

  if (clientSelect) {
    clientSelect.innerHTML = renderClientOptions();
  }

  if (vehicleSelect) {
    vehicleSelect.innerHTML = renderVehicleOptions();
  }
}

async function openReservationModal() {
  const modal = document.querySelector('#reservation-modal');

  if (!modal) {
    return;
  }

  clearReservationFormErrors();
  refreshReservationSelects();
  modal.hidden = false;
  document.body.classList.add('modal-open');
  document.querySelector('#reservation-client')?.focus();
}

function closeReservationModal() {
  const modal = document.querySelector('#reservation-modal');

  if (!modal) {
    return;
  }

  modal.hidden = true;
  document.body.classList.remove('modal-open');
  resetReservationForm();
}

async function handleCreateReservation(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const payload = getReservationFormPayload(form);

  if (!validateReservationPayload(payload)) {
    return;
  }

  const insertPayload = {
    client_id: payload.client_id,
    vehicle_id: payload.vehicle_id,
    start_at: payload.start_at,
    end_at: payload.end_at,
    status: payload.status,
    deposit_amount: payload.deposit_amount,
    deposit_method: payload.deposit_amount > 0 ? payload.deposit_method : null,
    notes: payload.notes,
  };

  setReservationFormLoading(true);
  showReservationFormError('');

  const { error } = await supabase.from('reservations').insert(insertPayload);

  setReservationFormLoading(false);

  if (error) {
    showReservationFormError(error.message);
    return;
  }

  closeReservationModal();
  await loadReservations();
  showReservationsToast?.('Reserva creada correctamente.');
}

function renderReservationModal() {
  return `
    <div class="modal-backdrop" id="reservation-modal" hidden>
      <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="reservation-modal-title">
        <div class="modal-header">
          <div>
            <p class="eyebrow">Reservas</p>
            <h2 id="reservation-modal-title">Nueva reserva</h2>
          </div>
          <button class="icon-button" id="close-reservation-modal" type="button" aria-label="Cerrar modal">×</button>
        </div>

        <form class="reservation-form" id="reservation-form" novalidate>
          <div class="form-alert" id="reservation-form-error" hidden></div>

          <div class="form-grid">
            <label>
              Cliente
              <select id="reservation-client" name="client_id">
                ${renderClientOptions()}
              </select>
              <span class="field-error" data-reservation-error="client_id"></span>
            </label>

            <label>
              Vehículo
              <select id="reservation-vehicle" name="vehicle_id">
                ${renderVehicleOptions()}
              </select>
              <span class="field-error" data-reservation-error="vehicle_id"></span>
            </label>

            <label>
              Fecha/hora inicio
              <input name="start_at" type="datetime-local" />
              <span class="field-error" data-reservation-error="start_at"></span>
            </label>

            <label>
              Fecha/hora fin
              <input name="end_at" type="datetime-local" />
              <span class="field-error" data-reservation-error="end_at"></span>
            </label>

            <label>
              Estado
              <select name="status">
                ${renderReservationStatusOptions()}
              </select>
              <span class="field-error" data-reservation-error="status"></span>
            </label>

            <label>
              Abono
              <input name="deposit_amount" type="number" min="0" step="0.01" inputmode="decimal" />
              <span class="field-error" data-reservation-error="deposit_amount"></span>
            </label>

            <label>
              Método de abono
              <select name="deposit_method">
                <option value="">Sin método</option>
                ${renderPaymentMethodOptions()}
              </select>
              <span class="field-error" data-reservation-error="deposit_method"></span>
            </label>
          </div>

          <label class="full-field">
            Notas
            <textarea name="notes" rows="4"></textarea>
            <span class="field-error" data-reservation-error="notes"></span>
          </label>

          <div class="modal-actions">
            <button class="secondary-button" id="cancel-reservation-modal" type="button">Cancelar</button>
            <button class="primary-button" id="save-reservation-button" type="submit">Guardar reserva</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function renderReservationsPage() {
  return `
    <section class="module-page">
      <div class="module-header">
        <div>
          <p class="eyebrow">Operación</p>
          <h2>Reservas</h2>
          <p class="module-subtitle">Solicitudes, fechas de entrega, retornos y estado de disponibilidad.</p>
        </div>
        <button class="primary-button module-action" id="new-reservation-button" type="button">Nueva reserva</button>
      </div>

      <div class="filter-bar">
        <label>
          Buscar
          <input id="reservation-search" type="search" placeholder="Cliente, cédula/RUC, placa, marca o modelo" autocomplete="off" />
        </label>

        <label>
          Estado
          <select id="reservation-status">
            <option value="">Todos los estados</option>
            ${renderReservationStatusOptions()}
          </select>
        </label>
      </div>

      <div id="reservations-results"></div>
      ${renderReservationModal()}
    </section>
  `;
}

export async function setupReservationsPage({ showToast }) {
  reservationsPageController?.abort();
  reservationsPageController = new AbortController();

  const { signal } = reservationsPageController;

  showReservationsToast = showToast;
  document.querySelector('#reservation-search')?.addEventListener('input', applyReservationFilters, { signal });
  document.querySelector('#reservation-status')?.addEventListener('change', applyReservationFilters, { signal });
  document.querySelector('#new-reservation-button')?.addEventListener('click', openReservationModal, { signal });
  document.querySelector('#close-reservation-modal')?.addEventListener('click', closeReservationModal, { signal });
  document.querySelector('#cancel-reservation-modal')?.addEventListener('click', closeReservationModal, { signal });
  document.querySelector('#reservation-form')?.addEventListener('submit', handleCreateReservation, { signal });
  document.querySelector('#reservation-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'reservation-modal') {
      closeReservationModal();
    }
  }, { signal });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.querySelector('#reservation-modal')?.hidden) {
      closeReservationModal();
    }
  }, { signal });

  try {
    await loadReservationOptions();
    refreshReservationSelects();
  } catch (error) {
    showToast?.('No se pudieron cargar clientes o vehículos.');
    showReservationFormError(error.message);
  }

  loadReservations(showToast);
}

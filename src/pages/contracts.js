import { supabase } from '../lib/supabaseClient.js';

const contractStatusLabels = {
  ACTIVE: 'Activo',
  CLOSED: 'Cerrado',
  CANCELLATION_REQUESTED: 'Anulación solicitada',
  CANCELLED: 'Anulado',
};

const financialStatusLabels = {
  PENDING: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Pagado',
  OVERDUE: 'Vencido',
};

const fuelLabels = {
  EMPTY: 'Vacío',
  ONE_QUARTER: '1/4',
  HALF: '1/2',
  THREE_QUARTERS: '3/4',
  FULL: 'Lleno',
};

let contracts = [];
let clients = [];
let vehicles = [];
let reservations = [];
let showContractsToast;
let contractsPageController;

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

function toDateTimeInputValue(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (number) => String(number).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

function getStatusClass(status) {
  return status ? status.toLowerCase().replaceAll('_', '-') : 'unknown';
}

function getContractStatusLabel(status) {
  return contractStatusLabels[status] ?? 'Sin estado';
}

function getFinancialStatusLabel(status) {
  return financialStatusLabels[status] ?? 'Sin estado financiero';
}

function getFuelLabel(fuel) {
  return fuelLabels[fuel] ?? '—';
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

function getReservationLabel(reservation) {
  const client = reservation.client ?? {};
  const vehicle = reservation.vehicle ?? {};
  const parts = [
    getClientLabel(client),
    vehicle.plate,
    formatDateTime(reservation.start_at),
  ].filter(Boolean);

  return parts.join(' · ');
}

function renderClientOptions() {
  if (!clients.length) {
    return '<option value="">No hay clientes disponibles</option>';
  }

  return `
    <option value="">Selecciona un cliente</option>
    ${clients.map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(getClientLabel(client))}</option>`).join('')}
  `;
}

function renderVehicleOptions() {
  if (!vehicles.length) {
    return '<option value="">No hay vehículos disponibles</option>';
  }

  return `
    <option value="">Selecciona un vehículo</option>
    ${vehicles.map((vehicle) => `<option value="${escapeHtml(vehicle.id)}">${escapeHtml(getVehicleLabel(vehicle))}</option>`).join('')}
  `;
}

function renderReservationOptions() {
  if (!reservations.length) {
    return '<option value="">Sin reserva vinculada</option>';
  }

  return `
    <option value="">Sin reserva vinculada</option>
    ${reservations.map((reservation) => `<option value="${escapeHtml(reservation.id)}">${escapeHtml(getReservationLabel(reservation))}</option>`).join('')}
  `;
}

function renderFuelOptions() {
  return Object.entries(fuelLabels)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join('');
}

function renderContractRows(items) {
  return items
    .map((contract) => {
      const client = contract.client ?? {};
      const vehicle = contract.vehicle ?? {};
      const vehicleName = [vehicle.brand, vehicle.model].filter(Boolean).join(' ');
      const statusClass = getStatusClass(contract.status);
      const financialClass = getStatusClass(contract.financial_status);

      return `
        <tr>
          <td data-label="Número"><strong>${escapeHtml(contract.sequential_number || '—')}</strong></td>
          <td data-label="Cliente">
            <strong>${escapeHtml(client.full_name || 'Sin cliente')}</strong>
            <span class="table-muted">${escapeHtml(client.cedula_ruc || '—')}</span>
          </td>
          <td data-label="Vehículo">
            <strong>${escapeHtml(vehicle.plate || 'Sin placa')}</strong>
            <span class="table-muted">${escapeHtml(vehicleName || 'Sin detalle')}</span>
          </td>
          <td data-label="Inicio">${formatDateTime(contract.start_at)}</td>
          <td data-label="Retorno esperado">${formatDateTime(contract.expected_end_at)}</td>
          <td data-label="Km salida">${formatNumber(contract.start_km)}</td>
          <td data-label="Combustible salida">${escapeHtml(getFuelLabel(contract.fuel_out))}</td>
          <td data-label="Tarifa diaria">${formatCurrency(contract.daily_rate)}</td>
          <td data-label="Estado">
            <span class="status-badge status-${statusClass}">${escapeHtml(getContractStatusLabel(contract.status))}</span>
          </td>
          <td data-label="Estado financiero">
            <span class="status-badge status-${financialClass}">${escapeHtml(getFinancialStatusLabel(contract.financial_status))}</span>
          </td>
          <td data-label="Total">${formatCurrency(contract.total_amount)}</td>
          <td data-label="Pagado">${formatCurrency(contract.paid_amount)}</td>
          <td data-label="Notas">${escapeHtml(contract.notes || '—')}</td>
        </tr>
      `;
    })
    .join('');
}

function renderEmptyState(message) {
  return `
    <div class="empty-state">
      <div class="placeholder-icon">▤</div>
      <h2>Sin contratos</h2>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function renderContracts(items) {
  const container = document.querySelector('#contracts-results');

  if (!container) {
    return;
  }

  if (!contracts.length) {
    container.innerHTML = renderEmptyState('Cuando generes contratos de salida aparecerán aquí.');
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="data-table contracts-table">
        <thead>
          <tr>
            <th>Número</th>
            <th>Cliente</th>
            <th>Vehículo</th>
            <th>Inicio</th>
            <th>Retorno esperado</th>
            <th>Km salida</th>
            <th>Combustible salida</th>
            <th>Tarifa diaria</th>
            <th>Estado</th>
            <th>Estado financiero</th>
            <th>Total</th>
            <th>Pagado</th>
            <th>Notas</th>
          </tr>
        </thead>
        <tbody>
          ${renderContractRows(items)}
        </tbody>
      </table>
    </div>
  `;
}

function renderError(message) {
  const container = document.querySelector('#contracts-results');

  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="error-state">
      <h2>No se pudieron cargar los contratos</h2>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

async function loadContractOptions() {
  const [clientsResponse, vehiclesResponse, reservationsResponse] = await Promise.all([
    supabase
      .from('clients')
      .select('id, cedula_ruc, full_name, phone, license_expiry')
      .order('full_name', { ascending: true }),
    supabase
      .from('vehicles')
      .select('id, plate, brand, model, status, current_km, daily_rate')
      .order('plate', { ascending: true }),
    supabase
      .from('reservations')
      .select(`
        id,
        vehicle_id,
        client_id,
        start_at,
        end_at,
        status,
        deposit_amount,
        deposit_method,
        client:clients(full_name, cedula_ruc, phone, license_expiry),
        vehicle:vehicles(plate, brand, model, status, current_km, daily_rate)
      `)
      .in('status', ['TENTATIVE', 'CONFIRMED'])
      .order('created_at', { ascending: false }),
  ]);

  if (clientsResponse.error) {
    throw clientsResponse.error;
  }

  if (vehiclesResponse.error) {
    throw vehiclesResponse.error;
  }

  if (reservationsResponse.error) {
    throw reservationsResponse.error;
  }

  clients = clientsResponse.data ?? [];
  vehicles = vehiclesResponse.data ?? [];
  reservations = reservationsResponse.data ?? [];
}

async function loadContracts(showToast) {
  const container = document.querySelector('#contracts-results');

  if (container) {
    container.innerHTML = `
      <div class="loading-state">
        <span class="loading-spinner" aria-hidden="true"></span>
        <p>Cargando contratos...</p>
      </div>
    `;
  }

  const { data, error } = await supabase
    .from('contracts')
    .select(`
      *,
      client:clients(full_name, cedula_ruc),
      vehicle:vehicles(plate, brand, model)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    contracts = [];
    renderError(error.message);
    showToast?.('No se pudieron cargar los contratos.');
    return;
  }

  contracts = data ?? [];
  renderContracts(contracts);
}

function setContractFieldError(fieldName, message) {
  const field = document.querySelector(`[data-contract-error="${fieldName}"]`);

  if (field) {
    field.textContent = message;
  }
}

function clearContractFormErrors() {
  document.querySelectorAll('[data-contract-error]').forEach((field) => {
    field.textContent = '';
  });

  const formError = document.querySelector('#contract-form-error');

  if (formError) {
    formError.textContent = '';
    formError.hidden = true;
  }
}

function showContractFormError(message) {
  const formError = document.querySelector('#contract-form-error');

  if (!formError) {
    return;
  }

  formError.textContent = message;
  formError.hidden = !message;
}

function showReservationDeposit(reservation) {
  const deposit = document.querySelector('#contract-reservation-deposit');

  if (!deposit) {
    return;
  }

  if (!reservation || !Number(reservation.deposit_amount)) {
    deposit.textContent = '';
    deposit.hidden = true;
    return;
  }

  deposit.textContent = `Abono registrado en reserva: ${formatCurrency(reservation.deposit_amount)}`;
  deposit.hidden = false;
}

function showVehicleDetails(vehicle) {
  const details = document.querySelector('#contract-vehicle-details');

  if (!details) {
    return;
  }

  if (!vehicle) {
    details.textContent = '';
    details.hidden = true;
    return;
  }

  details.textContent = `Km actual: ${formatNumber(vehicle.current_km)} · Tarifa diaria: ${formatCurrency(vehicle.daily_rate)}`;
  details.hidden = false;
}

function refreshContractSelects() {
  const reservationSelect = document.querySelector('#contract-reservation');
  const clientSelect = document.querySelector('#contract-client');
  const vehicleSelect = document.querySelector('#contract-vehicle');

  if (reservationSelect) {
    reservationSelect.innerHTML = renderReservationOptions();
  }

  if (clientSelect) {
    clientSelect.innerHTML = renderClientOptions();
  }

  if (vehicleSelect) {
    vehicleSelect.innerHTML = renderVehicleOptions();
  }
}

function updateVehicleDerivedFields() {
  const vehicleId = document.querySelector('#contract-vehicle')?.value ?? '';
  const vehicle = vehicles.find((item) => String(item.id) === String(vehicleId));
  const startKmField = document.querySelector('#contract-start-km');
  const dailyRateField = document.querySelector('#contract-daily-rate');

  if (startKmField) {
    startKmField.value = vehicle?.current_km ?? '';
  }

  if (dailyRateField) {
    dailyRateField.value = vehicle?.daily_rate ?? '';
  }

  showVehicleDetails(vehicle);
}

function handleReservationSelection() {
  const reservationId = document.querySelector('#contract-reservation')?.value ?? '';
  const reservation = reservations.find((item) => String(item.id) === String(reservationId));

  if (!reservation) {
    showReservationDeposit(null);
    return;
  }

  const clientSelect = document.querySelector('#contract-client');
  const vehicleSelect = document.querySelector('#contract-vehicle');
  const startField = document.querySelector('[name="start_at"]');
  const expectedEndField = document.querySelector('[name="expected_end_at"]');

  if (clientSelect) {
    clientSelect.value = reservation.client_id ?? '';
  }

  if (vehicleSelect) {
    vehicleSelect.value = reservation.vehicle_id ?? '';
  }

  if (startField) {
    startField.value = toDateTimeInputValue(reservation.start_at);
  }

  if (expectedEndField) {
    expectedEndField.value = toDateTimeInputValue(reservation.end_at);
  }

  updateVehicleDerivedFields();
  showReservationDeposit(reservation);
}

function getContractFormPayload(form) {
  const formData = new FormData(form);
  const reservationId = formData.get('reservation_id')?.toString() ?? '';
  const notes = formData.get('notes')?.toString().trim();

  return {
    reservation_id: reservationId || null,
    client_id: formData.get('client_id')?.toString() ?? '',
    vehicle_id: formData.get('vehicle_id')?.toString() ?? '',
    start_at: formData.get('start_at')?.toString() ?? '',
    expected_end_at: formData.get('expected_end_at')?.toString() ?? '',
    start_km: Number(formData.get('start_km')),
    fuel_out: formData.get('fuel_out')?.toString() ?? '',
    daily_rate: Number(formData.get('daily_rate')),
    notes: notes || null,
  };
}

function validateContractPayload(payload) {
  let isValid = true;

  clearContractFormErrors();

  if (!payload.client_id) {
    setContractFieldError('client_id', 'El cliente es obligatorio.');
    isValid = false;
  }

  if (!payload.vehicle_id) {
    setContractFieldError('vehicle_id', 'El vehículo es obligatorio.');
    isValid = false;
  }

  const startDate = parseLocalDateTime(payload.start_at);
  const expectedEndDate = parseLocalDateTime(payload.expected_end_at);

  if (!startDate) {
    setContractFieldError('start_at', 'La fecha/hora de salida es obligatoria.');
    isValid = false;
  }

  if (!expectedEndDate) {
    setContractFieldError('expected_end_at', 'La fecha/hora de retorno esperado es obligatoria.');
    isValid = false;
  }

  if (startDate && expectedEndDate && expectedEndDate.getTime() <= startDate.getTime()) {
    setContractFieldError('expected_end_at', 'El retorno esperado debe ser mayor a la salida.');
    isValid = false;
  }

  if (!payload.fuel_out) {
    setContractFieldError('fuel_out', 'El combustible de salida es obligatorio.');
    isValid = false;
  }

  const selectedVehicle = vehicles.find((vehicle) => String(vehicle.id) === String(payload.vehicle_id));

  if (selectedVehicle && !['AVAILABLE', 'RESERVED'].includes(selectedVehicle.status)) {
    setContractFieldError('vehicle_id', 'El vehículo debe estar disponible o reservado.');
    isValid = false;
  }

  if (!selectedVehicle) {
    setContractFieldError('vehicle_id', 'Selecciona un vehículo válido.');
    isValid = false;
  }

  const selectedClient = clients.find((client) => String(client.id) === String(payload.client_id));
  const licenseDate = parseLocalDate(selectedClient?.license_expiry);
  const contractStartDate = getLocalDateFromDateTime(payload.start_at);

  if (licenseDate && contractStartDate && licenseDate.getTime() < contractStartDate.getTime()) {
    setContractFieldError('client_id', 'La licencia del cliente está vencida para la fecha de salida.');
    isValid = false;
  }

  if (!Number.isFinite(payload.start_km) || payload.start_km < 0) {
    setContractFieldError('start_km', 'No se pudo obtener el kilometraje actual del vehículo.');
    isValid = false;
  }

  if (!Number.isFinite(payload.daily_rate) || payload.daily_rate < 0) {
    setContractFieldError('vehicle_id', 'No se pudo obtener la tarifa diaria del vehículo.');
    isValid = false;
  }

  return isValid;
}

function buildContractInsertPayload(payload) {
  const insertPayload = {
    vehicle_id: payload.vehicle_id,
    client_id: payload.client_id,
    start_at: payload.start_at,
    expected_end_at: payload.expected_end_at,
    fuel_out: payload.fuel_out,
    notes: payload.notes,
    status: 'ACTIVE',
    financial_status: 'PENDING',
    subtotal: 0,
    iva_amount: 0,
    total_amount: 0,
    paid_amount: 0,
  };

  if (Number.isFinite(payload.start_km)) {
    insertPayload.start_km = payload.start_km;
  }

  if (Number.isFinite(payload.daily_rate)) {
    insertPayload.daily_rate = payload.daily_rate;
  }

  if (payload.reservation_id) {
    insertPayload.reservation_id = payload.reservation_id;
  }

  return insertPayload;
}

function resetContractForm() {
  const form = document.querySelector('#contract-form');

  if (!form) {
    return;
  }

  form.reset();
  showReservationDeposit(null);
  showVehicleDetails(null);
  clearContractFormErrors();
}

function setContractFormLoading(isLoading) {
  const form = document.querySelector('#contract-form');
  const submitButton = document.querySelector('#save-contract-button');

  if (form) {
    form.querySelectorAll('input, select, textarea, button').forEach((field) => {
      if (field.id !== 'contract-start-km') {
        field.disabled = isLoading;
      }
    });
  }

  if (submitButton) {
    submitButton.textContent = isLoading ? 'Guardando...' : 'Guardar contrato';
  }
}

function openContractModal() {
  const modal = document.querySelector('#contract-modal');

  if (!modal) {
    return;
  }

  clearContractFormErrors();
  refreshContractSelects();
  modal.hidden = false;
  document.body.classList.add('modal-open');
  document.querySelector('#contract-reservation')?.focus();
}

function closeContractModal() {
  const modal = document.querySelector('#contract-modal');

  if (!modal) {
    return;
  }

  modal.hidden = true;
  document.body.classList.remove('modal-open');
  resetContractForm();
}

async function handleCreateContract(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const payload = getContractFormPayload(form);

  if (!validateContractPayload(payload)) {
    return;
  }

  const insertPayload = buildContractInsertPayload(payload);

  setContractFormLoading(true);
  showContractFormError('');

  const { data, error } = await supabase.rpc('create_contract_from_app', {
    p_reservation_id: insertPayload.reservation_id ?? null,
    p_vehicle_id: insertPayload.vehicle_id,
    p_client_id: insertPayload.client_id,
    p_start_at: insertPayload.start_at,
    p_expected_end_at: insertPayload.expected_end_at,
    p_fuel_out: insertPayload.fuel_out,
    p_notes: insertPayload.notes ?? null,
  });

  setContractFormLoading(false);

  if (error) {
    showContractFormError(error.message);
    return;
  }

  closeContractModal();
  await Promise.all([loadContractOptions(), loadContracts()]);
  showContractsToast?.(`Contrato ${data?.[0]?.sequential_number ?? ''} creado correctamente.`);
}

function renderContractModal() {
  return `
    <div class="modal-backdrop" id="contract-modal" hidden>
      <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="contract-modal-title">
        <div class="modal-header">
          <div>
            <p class="eyebrow">Contratos</p>
            <h2 id="contract-modal-title">Nuevo contrato</h2>
          </div>
          <button class="icon-button" id="close-contract-modal" type="button" aria-label="Cerrar modal">×</button>
        </div>

        <form class="contract-form" id="contract-form" novalidate>
          <div class="form-alert" id="contract-form-error" hidden></div>
          <div class="form-warning" id="contract-reservation-deposit" hidden></div>

          <div class="form-grid">
            <label>
              Reserva opcional
              <select id="contract-reservation" name="reservation_id">
                ${renderReservationOptions()}
              </select>
              <span class="field-error" data-contract-error="reservation_id"></span>
            </label>

            <label>
              Cliente
              <select id="contract-client" name="client_id">
                ${renderClientOptions()}
              </select>
              <span class="field-error" data-contract-error="client_id"></span>
            </label>

            <label>
              Vehículo
              <select id="contract-vehicle" name="vehicle_id">
                ${renderVehicleOptions()}
              </select>
              <span class="field-error" data-contract-error="vehicle_id"></span>
            </label>

            <label>
              Fecha/hora de salida
              <input name="start_at" type="datetime-local" />
              <span class="field-error" data-contract-error="start_at"></span>
            </label>

            <label>
              Fecha/hora retorno esperado
              <input name="expected_end_at" type="datetime-local" />
              <span class="field-error" data-contract-error="expected_end_at"></span>
            </label>

            <label>
              Km salida
              <input id="contract-start-km" name="start_km" type="number" readonly />
              <span class="field-error" data-contract-error="start_km"></span>
            </label>

            <label>
              Combustible de salida
              <select name="fuel_out">
                <option value="">Selecciona combustible</option>
                ${renderFuelOptions()}
              </select>
              <span class="field-error" data-contract-error="fuel_out"></span>
            </label>

            <label>
              Tarifa diaria
              <input id="contract-daily-rate" name="daily_rate" type="number" readonly />
              <span class="field-error" data-contract-error="daily_rate"></span>
            </label>
          </div>

          <p class="form-note" id="contract-vehicle-details" hidden></p>

          <label class="full-field">
            Notas
            <textarea name="notes" rows="4"></textarea>
            <span class="field-error" data-contract-error="notes"></span>
          </label>

          <div class="modal-actions">
            <button class="secondary-button" id="cancel-contract-modal" type="button">Cancelar</button>
            <button class="primary-button" id="save-contract-button" type="submit">Guardar contrato</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function renderContractsPage() {
  return `
    <section class="module-page">
      <div class="module-header">
        <div>
          <p class="eyebrow">Operación</p>
          <h2>Contratos</h2>
        </div>
        <button class="primary-button module-action" id="new-contract-button" type="button">Nuevo contrato</button>
      </div>

      <div id="contracts-results"></div>
      ${renderContractModal()}
    </section>
  `;
}

export async function setupContractsPage({ showToast }) {
  contractsPageController?.abort();
  contractsPageController = new AbortController();

  const { signal } = contractsPageController;

  showContractsToast = showToast;
  document.querySelector('#new-contract-button')?.addEventListener('click', openContractModal, { signal });
  document.querySelector('#close-contract-modal')?.addEventListener('click', closeContractModal, { signal });
  document.querySelector('#cancel-contract-modal')?.addEventListener('click', closeContractModal, { signal });
  document.querySelector('#contract-form')?.addEventListener('submit', handleCreateContract, { signal });
  document.querySelector('#contract-reservation')?.addEventListener('change', handleReservationSelection, { signal });
  document.querySelector('#contract-vehicle')?.addEventListener('change', updateVehicleDerivedFields, { signal });
  document.querySelector('#contract-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'contract-modal') {
      closeContractModal();
    }
  }, { signal });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.querySelector('#contract-modal')?.hidden) {
      closeContractModal();
    }
  }, { signal });

  try {
    await loadContractOptions();
    refreshContractSelects();
  } catch (error) {
    showToast?.('No se pudieron cargar clientes, vehículos o reservas.');
    showContractFormError(error.message);
  }

  loadContracts(showToast);
}

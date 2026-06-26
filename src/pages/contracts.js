import { supabase } from '../lib/supabaseClient.js';

const contractStatusLabels = {
  ACTIVE: 'Activo',
  CLOSED: 'Cerrado',
  CANCELLATION_REQUESTED: 'Anulación solicitada',
  CANCELLED: 'Anulado',
};

const financialStatusLabels = {
  PENDING: 'Pendiente',
  PAID: 'Pagado',
  PARTIALLY_PAID: 'Parcialmente pagado',
  DISCOUNT_REQUESTED: 'Descuento solicitado',
  DISCOUNT_APPROVED: 'Descuento aprobado',
  BALANCE_PENDING: 'Saldo pendiente',
};

const fuelLabels = {
  EMPTY: 'Vacío',
  ONE_QUARTER: '1/4',
  HALF: '1/2',
  THREE_QUARTERS: '3/4',
  FULL: 'Lleno',
};

const paymentMethodLabels = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
};

let contracts = [];
let clients = [];
let vehicles = [];
let reservations = [];
let showContractsToast;
let contractsPageController;
let selectedReturnContract;
let selectedPaymentContract;

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

function getCurrentDateTimeInputValue() {
  return toDateTimeInputValue(new Date().toISOString());
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

function getPaymentMethodLabel(method) {
  return paymentMethodLabels[method] ?? '—';
}

function getContractClient(contract) {
  return contract?.client ?? {};
}

function getContractVehicle(contract) {
  return contract?.vehicle ?? {};
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

function renderPaymentMethodOptions() {
  return Object.entries(paymentMethodLabels)
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
      const actions = [
        contract.status === 'ACTIVE'
          ? `<button class="secondary-button table-action" type="button" data-contract-return="${escapeHtml(contract.id)}">Registrar devolución</button>`
          : '',
        contract.status !== 'CANCELLED'
          ? `<button class="secondary-button table-action" type="button" data-contract-payment="${escapeHtml(contract.id)}">Registrar pago</button>`
          : '',
      ].filter(Boolean).join('');

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
          <td data-label="Acciones"><div class="table-actions">${actions || '—'}</div></td>
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
            <th>Acciones</th>
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

function setReturnFieldError(fieldName, message) {
  const field = document.querySelector(`[data-return-error="${fieldName}"]`);

  if (field) {
    field.textContent = message;
  }
}

function clearReturnFormErrors() {
  document.querySelectorAll('[data-return-error]').forEach((field) => {
    field.textContent = '';
  });

  const formError = document.querySelector('#return-form-error');

  if (formError) {
    formError.textContent = '';
    formError.hidden = true;
  }
}

function showReturnFormError(message) {
  const formError = document.querySelector('#return-form-error');

  if (!formError) {
    return;
  }

  formError.textContent = message;
  formError.hidden = !message;
}

function setPaymentFieldError(fieldName, message) {
  const field = document.querySelector(`[data-payment-error="${fieldName}"]`);

  if (field) {
    field.textContent = message;
  }
}

function clearPaymentFormErrors() {
  document.querySelectorAll('[data-payment-error]').forEach((field) => {
    field.textContent = '';
  });

  const formError = document.querySelector('#payment-form-error');

  if (formError) {
    formError.textContent = '';
    formError.hidden = true;
  }
}

function showPaymentFormError(message) {
  const formError = document.querySelector('#payment-form-error');

  if (!formError) {
    return;
  }

  formError.textContent = message;
  formError.hidden = !message;
}

function renderReturnContractSummary(contract) {
  const client = getContractClient(contract);
  const vehicle = getContractVehicle(contract);
  const vehicleName = [vehicle.brand, vehicle.model].filter(Boolean).join(' ');

  return `
    <dl class="detail-list">
      <div>
        <dt>Número</dt>
        <dd>${escapeHtml(contract.sequential_number || '—')}</dd>
      </div>
      <div>
        <dt>Cliente</dt>
        <dd>${escapeHtml(client.full_name || 'Sin cliente')}</dd>
      </div>
      <div>
        <dt>Vehículo</dt>
        <dd>${escapeHtml([vehicle.plate, vehicleName].filter(Boolean).join(' · ') || 'Sin vehículo')}</dd>
      </div>
      <div>
        <dt>Salida</dt>
        <dd>${formatDateTime(contract.start_at)}</dd>
      </div>
      <div>
        <dt>Retorno esperado</dt>
        <dd>${formatDateTime(contract.expected_end_at)}</dd>
      </div>
      <div>
        <dt>Km salida</dt>
        <dd>${formatNumber(contract.start_km)}</dd>
      </div>
      <div>
        <dt>Combustible salida</dt>
        <dd>${escapeHtml(getFuelLabel(contract.fuel_out))}</dd>
      </div>
      <div>
        <dt>Tarifa diaria</dt>
        <dd>${formatCurrency(contract.daily_rate)}</dd>
      </div>
    </dl>
  `;
}

function renderPaymentContractSummary(contract) {
  const client = getContractClient(contract);
  const vehicle = getContractVehicle(contract);
  const vehicleName = [vehicle.brand, vehicle.model].filter(Boolean).join(' ');
  const total = Number(contract.total_amount) || 0;
  const paid = Number(contract.paid_amount) || 0;
  const balance = Math.max(total - paid, 0);

  return `
    <dl class="detail-list">
      <div>
        <dt>Número</dt>
        <dd>${escapeHtml(contract.sequential_number || '—')}</dd>
      </div>
      <div>
        <dt>Cliente</dt>
        <dd>${escapeHtml(client.full_name || 'Sin cliente')}</dd>
      </div>
      <div>
        <dt>Vehículo</dt>
        <dd>${escapeHtml([vehicle.plate, vehicleName].filter(Boolean).join(' · ') || 'Sin vehículo')}</dd>
      </div>
      <div>
        <dt>Total</dt>
        <dd>${formatCurrency(total)}</dd>
      </div>
      <div>
        <dt>Pagado</dt>
        <dd>${formatCurrency(paid)}</dd>
      </div>
      <div>
        <dt>Saldo pendiente</dt>
        <dd>${formatCurrency(balance)}</dd>
      </div>
    </dl>
  `;
}

function updateReturnSummary() {
  const summary = document.querySelector('#return-summary');

  if (!summary || !selectedReturnContract) {
    return;
  }

  const endKm = Number(document.querySelector('[name="end_km"]')?.value);
  const realEndAt = document.querySelector('[name="real_end_at"]')?.value ?? '';
  const startKm = Number(selectedReturnContract.start_km);
  const realEndDate = parseLocalDateTime(realEndAt);
  const expectedEndDate = new Date(selectedReturnContract.expected_end_at);
  const parts = [];

  if (Number.isFinite(endKm) && Number.isFinite(startKm)) {
    parts.push(`Km recorridos: ${formatNumber(endKm - startKm)}`);
  }

  if (
    realEndDate &&
    selectedReturnContract.expected_end_at &&
    !Number.isNaN(expectedEndDate.getTime()) &&
    realEndDate.getTime() > expectedEndDate.getTime()
  ) {
    parts.push('Aviso: el retorno está tarde respecto al retorno esperado.');
  }

  summary.textContent = parts.join(' ');
  summary.hidden = !parts.length;
}

function getReturnFormPayload(form) {
  const formData = new FormData(form);
  const notes = formData.get('return_notes')?.toString().trim();

  return {
    real_end_at: formData.get('real_end_at')?.toString() ?? '',
    end_km: Number(formData.get('end_km')),
    fuel_in: formData.get('fuel_in')?.toString() ?? '',
    return_notes: notes || null,
  };
}

function validateReturnPayload(payload) {
  let isValid = true;
  const startDate = parseLocalDateTime(toDateTimeInputValue(selectedReturnContract?.start_at));
  const realEndDate = parseLocalDateTime(payload.real_end_at);
  const startKm = Number(selectedReturnContract?.start_km);

  clearReturnFormErrors();

  if (!realEndDate) {
    setReturnFieldError('real_end_at', 'La fecha/hora real de devolución es obligatoria.');
    isValid = false;
  }

  if (!Number.isFinite(payload.end_km)) {
    setReturnFieldError('end_km', 'El km final es obligatorio.');
    isValid = false;
  }

  if (Number.isFinite(payload.end_km) && Number.isFinite(startKm) && payload.end_km < startKm) {
    setReturnFieldError('end_km', 'El km final no puede ser menor que el km de salida.');
    isValid = false;
  }

  if (!payload.fuel_in) {
    setReturnFieldError('fuel_in', 'El combustible de entrada es obligatorio.');
    isValid = false;
  }

  if (realEndDate && startDate && realEndDate.getTime() < startDate.getTime()) {
    setReturnFieldError('real_end_at', 'La devolución real no puede ser menor que la salida.');
    isValid = false;
  }

  updateReturnSummary();

  return isValid;
}

function getPaymentFormPayload(form) {
  const formData = new FormData(form);
  const amount = formData.get('amount')?.toString().trim();
  const reference = formData.get('reference')?.toString().trim();
  const notes = formData.get('payment_notes')?.toString().trim();

  return {
    method: formData.get('method')?.toString() ?? '',
    amount: amount ? Number(amount) : Number.NaN,
    reference: reference || null,
    notes: notes || null,
  };
}

function validatePaymentPayload(payload) {
  let isValid = true;

  clearPaymentFormErrors();

  if (!payload.method) {
    setPaymentFieldError('method', 'El método de pago es obligatorio.');
    isValid = false;
  }

  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    setPaymentFieldError('amount', 'El monto debe ser mayor a 0.');
    isValid = false;
  }

  if (['CARD', 'TRANSFER'].includes(payload.method) && !payload.reference) {
    setPaymentFieldError('reference', 'La referencia es obligatoria para tarjeta o transferencia.');
    isValid = false;
  }

  return isValid;
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

function setReturnFormLoading(isLoading) {
  const form = document.querySelector('#return-form');
  const submitButton = document.querySelector('#save-return-button');

  if (form) {
    form.querySelectorAll('input, select, textarea, button').forEach((field) => {
      field.disabled = isLoading;
    });
  }

  if (submitButton) {
    submitButton.textContent = isLoading ? 'Guardando...' : 'Cerrar contrato';
  }
}

function setPaymentFormLoading(isLoading) {
  const form = document.querySelector('#payment-form');
  const submitButton = document.querySelector('#save-payment-button');

  if (form) {
    form.querySelectorAll('input, select, textarea, button').forEach((field) => {
      field.disabled = isLoading;
    });
  }

  if (submitButton) {
    submitButton.textContent = isLoading ? 'Guardando...' : 'Registrar pago';
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

function openReturnModal(contractId) {
  const modal = document.querySelector('#return-modal');
  const contract = contracts.find((item) => String(item.id) === String(contractId));

  if (!modal || !contract) {
    return;
  }

  selectedReturnContract = contract;
  clearReturnFormErrors();

  const summary = document.querySelector('#return-contract-summary');
  const form = document.querySelector('#return-form');

  if (summary) {
    summary.innerHTML = renderReturnContractSummary(contract);
  }

  if (form) {
    form.reset();
    form.querySelector('[name="real_end_at"]').value = getCurrentDateTimeInputValue();
    form.querySelector('[name="end_km"]').value = contract.start_km ?? '';
  }

  updateReturnSummary();
  modal.hidden = false;
  document.body.classList.add('modal-open');
  document.querySelector('[name="end_km"]')?.focus();
}

function closeReturnModal() {
  const modal = document.querySelector('#return-modal');

  if (!modal) {
    return;
  }

  modal.hidden = true;
  selectedReturnContract = null;
  document.body.classList.remove('modal-open');
  document.querySelector('#return-form')?.reset();
  clearReturnFormErrors();
}

function openPaymentModal(contractId) {
  const modal = document.querySelector('#payment-modal');
  const contract = contracts.find((item) => String(item.id) === String(contractId));

  if (!modal || !contract) {
    return;
  }

  selectedPaymentContract = contract;
  clearPaymentFormErrors();

  const summary = document.querySelector('#payment-contract-summary');
  const form = document.querySelector('#payment-form');

  if (summary) {
    summary.innerHTML = renderPaymentContractSummary(contract);
  }

  if (form) {
    form.reset();
  }

  modal.hidden = false;
  document.body.classList.add('modal-open');
  document.querySelector('[name="method"]')?.focus();
}

function closePaymentModal() {
  const modal = document.querySelector('#payment-modal');

  if (!modal) {
    return;
  }

  modal.hidden = true;
  selectedPaymentContract = null;
  document.body.classList.remove('modal-open');
  document.querySelector('#payment-form')?.reset();
  clearPaymentFormErrors();
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

async function handleCloseContract(event) {
  event.preventDefault();

  if (!selectedReturnContract) {
    showReturnFormError('No se encontró el contrato seleccionado.');
    return;
  }

  const form = event.currentTarget;
  const payload = getReturnFormPayload(form);

  if (!validateReturnPayload(payload)) {
    return;
  }

  setReturnFormLoading(true);
  showReturnFormError('');

  const { error } = await supabase.rpc('close_contract_from_app', {
    p_contract_id: selectedReturnContract.id,
    p_real_end_at: payload.real_end_at,
    p_end_km: payload.end_km,
    p_fuel_in: payload.fuel_in,
    p_return_notes: payload.return_notes,
  });

  setReturnFormLoading(false);

  if (error) {
    showReturnFormError(error.message);
    return;
  }

  closeReturnModal();
  await Promise.all([loadContractOptions(), loadContracts()]);
  showContractsToast?.('Contrato cerrado correctamente');
}

async function handleRegisterPayment(event) {
  event.preventDefault();

  if (!selectedPaymentContract) {
    showPaymentFormError('No se encontró el contrato seleccionado.');
    return;
  }

  const form = event.currentTarget;
  const payload = getPaymentFormPayload(form);

  if (!validatePaymentPayload(payload)) {
    return;
  }

  setPaymentFormLoading(true);
  showPaymentFormError('');

  const { error } = await supabase.rpc('register_contract_payment_from_app', {
    p_contract_id: selectedPaymentContract.id,
    p_method: payload.method,
    p_amount: payload.amount,
    p_reference: payload.reference,
    p_notes: payload.notes,
  });

  setPaymentFormLoading(false);

  if (error) {
    showPaymentFormError(error.message);
    return;
  }

  closePaymentModal();
  await Promise.all([loadContractOptions(), loadContracts()]);
  showContractsToast?.('Pago registrado correctamente');
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

function renderReturnModal() {
  return `
    <div class="modal-backdrop" id="return-modal" hidden>
      <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="return-modal-title">
        <div class="modal-header">
          <div>
            <p class="eyebrow">Devolución</p>
            <h2 id="return-modal-title">Registrar devolución</h2>
          </div>
          <button class="icon-button" id="close-return-modal" type="button" aria-label="Cerrar modal">×</button>
        </div>

        <form class="return-form" id="return-form" novalidate>
          <div class="form-alert" id="return-form-error" hidden></div>
          <div id="return-contract-summary"></div>
          <div class="form-warning" id="return-summary" hidden></div>

          <div class="form-grid">
            <label>
              Fecha/hora real de devolución
              <input name="real_end_at" type="datetime-local" />
              <span class="field-error" data-return-error="real_end_at"></span>
            </label>

            <label>
              Km final
              <input name="end_km" type="number" min="0" step="1" inputmode="numeric" />
              <span class="field-error" data-return-error="end_km"></span>
            </label>

            <label>
              Combustible de entrada
              <select name="fuel_in">
                <option value="">Selecciona combustible</option>
                ${renderFuelOptions()}
              </select>
              <span class="field-error" data-return-error="fuel_in"></span>
            </label>
          </div>

          <label class="full-field">
            Notas de devolución
            <textarea name="return_notes" rows="4"></textarea>
            <span class="field-error" data-return-error="return_notes"></span>
          </label>

          <div class="modal-actions">
            <button class="secondary-button" id="cancel-return-modal" type="button">Cancelar</button>
            <button class="primary-button" id="save-return-button" type="submit">Cerrar contrato</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderPaymentModal() {
  return `
    <div class="modal-backdrop" id="payment-modal" hidden>
      <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title">
        <div class="modal-header">
          <div>
            <p class="eyebrow">Pagos</p>
            <h2 id="payment-modal-title">Registrar pago</h2>
          </div>
          <button class="icon-button" id="close-payment-modal" type="button" aria-label="Cerrar modal">×</button>
        </div>

        <form class="payment-form" id="payment-form" novalidate>
          <div class="form-alert" id="payment-form-error" hidden></div>
          <div id="payment-contract-summary"></div>

          <div class="form-grid">
            <label>
              Método de pago
              <select name="method">
                <option value="">Selecciona método</option>
                ${renderPaymentMethodOptions()}
              </select>
              <span class="field-error" data-payment-error="method"></span>
            </label>

            <label>
              Monto
              <input name="amount" type="number" min="0" step="0.01" inputmode="decimal" />
              <span class="field-error" data-payment-error="amount"></span>
            </label>

            <label>
              Referencia
              <input name="reference" type="text" autocomplete="off" />
              <span class="field-error" data-payment-error="reference"></span>
            </label>
          </div>

          <label class="full-field">
            Notas
            <textarea name="payment_notes" rows="4"></textarea>
            <span class="field-error" data-payment-error="payment_notes"></span>
          </label>

          <div class="modal-actions">
            <button class="secondary-button" id="cancel-payment-modal" type="button">Cancelar</button>
            <button class="primary-button" id="save-payment-button" type="submit">Registrar pago</button>
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
      ${renderReturnModal()}
      ${renderPaymentModal()}
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
  document.querySelector('#close-return-modal')?.addEventListener('click', closeReturnModal, { signal });
  document.querySelector('#cancel-return-modal')?.addEventListener('click', closeReturnModal, { signal });
  document.querySelector('#return-form')?.addEventListener('submit', handleCloseContract, { signal });
  document.querySelector('#close-payment-modal')?.addEventListener('click', closePaymentModal, { signal });
  document.querySelector('#cancel-payment-modal')?.addEventListener('click', closePaymentModal, { signal });
  document.querySelector('#payment-form')?.addEventListener('submit', handleRegisterPayment, { signal });
  document.querySelector('[name="real_end_at"]')?.addEventListener('input', updateReturnSummary, { signal });
  document.querySelector('[name="end_km"]')?.addEventListener('input', updateReturnSummary, { signal });
  document.querySelector('#contracts-results')?.addEventListener('click', (event) => {
    const returnButton = event.target.closest('[data-contract-return]');
    const paymentButton = event.target.closest('[data-contract-payment]');

    if (returnButton) {
      openReturnModal(returnButton.dataset.contractReturn);
    }

    if (paymentButton) {
      openPaymentModal(paymentButton.dataset.contractPayment);
    }
  }, { signal });
  document.querySelector('#contract-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'contract-modal') {
      closeContractModal();
    }
  }, { signal });
  document.querySelector('#return-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'return-modal') {
      closeReturnModal();
    }
  }, { signal });
  document.querySelector('#payment-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'payment-modal') {
      closePaymentModal();
    }
  }, { signal });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }

    if (!document.querySelector('#contract-modal')?.hidden) {
      closeContractModal();
    }

    if (!document.querySelector('#return-modal')?.hidden) {
      closeReturnModal();
    }

    if (!document.querySelector('#payment-modal')?.hidden) {
      closePaymentModal();
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

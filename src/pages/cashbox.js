import { supabase } from '../lib/supabaseClient.js';

const paymentMethodLabels = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
};

let cashboxPageController;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getLocalDateInputValue(date = new Date()) {
  const pad = (number) => String(number).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getDayRange(dateValue) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 1);

  return {
    end: end.toISOString(),
    start: start.toISOString(),
  };
}

function formatTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('es-EC', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatCurrency(value) {
  const numericValue = Number(value ?? 0);

  return new Intl.NumberFormat('es-EC', {
    currency: 'USD',
    style: 'currency',
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

function formatNumber(value) {
  const numericValue = Number(value ?? 0);

  return new Intl.NumberFormat('es-EC').format(Number.isFinite(numericValue) ? numericValue : 0);
}

function getPaymentMethodLabel(method) {
  return paymentMethodLabels[method] ?? '—';
}

function getSummaryValue(summary, key) {
  return Array.isArray(summary) ? summary[0]?.[key] : summary?.[key];
}

function renderSummaryCards(summary) {
  const metrics = [
    {
      detail: 'Todos los métodos',
      label: 'Total cobrado',
      tone: 'green',
      value: formatCurrency(getSummaryValue(summary, 'collected_total')),
    },
    {
      detail: 'Pagos en efectivo',
      label: 'Efectivo',
      tone: 'green',
      value: formatCurrency(getSummaryValue(summary, 'cash_total')),
    },
    {
      detail: 'Pagos con tarjeta',
      label: 'Tarjeta',
      tone: 'navy',
      value: formatCurrency(getSummaryValue(summary, 'card_total')),
    },
    {
      detail: 'Transferencias',
      label: 'Transferencia',
      tone: 'red',
      value: formatCurrency(getSummaryValue(summary, 'transfer_total')),
    },
    {
      detail: 'Registros recibidos',
      label: 'Número de pagos',
      tone: 'amber',
      value: formatNumber(getSummaryValue(summary, 'payments_count')),
    },
    {
      detail: 'Contratos abiertos',
      label: 'Saldo pendiente total',
      tone: 'red',
      value: formatCurrency(getSummaryValue(summary, 'pending_balance_total')),
    },
    {
      detail: 'Con saldo por cobrar',
      label: 'Contratos con saldo pendiente',
      tone: 'amber',
      value: formatNumber(getSummaryValue(summary, 'contracts_with_balance')),
    },
  ];

  return metrics
    .map((metric) => `
      <article class="metric-card">
        <span class="metric-dot ${metric.tone}"></span>
        <p>${metric.label}</p>
        <strong>${metric.value}</strong>
        <small>${metric.detail}</small>
      </article>
    `)
    .join('');
}

function renderPaymentRows(payments) {
  return payments
    .map((payment) => {
      const contract = payment.contract ?? {};
      const client = contract.client ?? {};
      const vehicle = contract.vehicle ?? {};
      const vehicleName = [vehicle.brand, vehicle.model].filter(Boolean).join(' ');

      return `
        <tr>
          <td data-label="Hora">${formatTime(payment.created_at)}</td>
          <td data-label="Contrato"><strong>${escapeHtml(contract.sequential_number || '—')}</strong></td>
          <td data-label="Cliente">
            <strong>${escapeHtml(client.full_name || 'Sin cliente')}</strong>
            <span class="table-muted">${escapeHtml(client.cedula_ruc || '—')}</span>
          </td>
          <td data-label="Vehículo">
            <strong>${escapeHtml(vehicle.plate || 'Sin placa')}</strong>
            <span class="table-muted">${escapeHtml(vehicleName || 'Sin detalle')}</span>
          </td>
          <td data-label="Método">${escapeHtml(getPaymentMethodLabel(payment.method))}</td>
          <td data-label="Monto">${formatCurrency(payment.amount)}</td>
          <td data-label="Referencia">${escapeHtml(payment.reference || '—')}</td>
          <td data-label="Notas">${escapeHtml(payment.notes || '—')}</td>
        </tr>
      `;
    })
    .join('');
}

function renderPaymentsTable(payments) {
  if (!payments.length) {
    return `
      <div class="empty-state">
        <div class="placeholder-icon">$</div>
        <h2>Sin pagos</h2>
        <p>No hay pagos registrados para esta fecha.</p>
      </div>
    `;
  }

  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Hora</th>
            <th>Contrato</th>
            <th>Cliente</th>
            <th>Vehículo</th>
            <th>Método</th>
            <th>Monto</th>
            <th>Referencia</th>
            <th>Notas</th>
          </tr>
        </thead>
        <tbody>
          ${renderPaymentRows(payments)}
        </tbody>
      </table>
    </div>
  `;
}

function renderCashboxData(summary, payments) {
  const summaryContainer = document.querySelector('#cashbox-summary');
  const paymentsContainer = document.querySelector('#cashbox-payments');

  if (summaryContainer) {
    summaryContainer.innerHTML = renderSummaryCards(summary);
  }

  if (paymentsContainer) {
    paymentsContainer.innerHTML = renderPaymentsTable(payments);
  }
}

function renderCashboxError(message) {
  const paymentsContainer = document.querySelector('#cashbox-payments');
  const summaryContainer = document.querySelector('#cashbox-summary');

  if (summaryContainer) {
    summaryContainer.innerHTML = '';
  }

  if (paymentsContainer) {
    paymentsContainer.innerHTML = `
      <div class="error-state">
        <h2>No se pudo cargar la caja diaria</h2>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }
}

function renderCashboxLoading() {
  const summaryContainer = document.querySelector('#cashbox-summary');
  const paymentsContainer = document.querySelector('#cashbox-payments');

  if (summaryContainer) {
    summaryContainer.innerHTML = '';
  }

  if (paymentsContainer) {
    paymentsContainer.innerHTML = `
      <div class="loading-state">
        <span class="loading-spinner" aria-hidden="true"></span>
        <p>Cargando caja diaria...</p>
      </div>
    `;
  }
}

async function loadCashbox(showToast) {
  const dateValue = document.querySelector('#cashbox-date')?.value || getLocalDateInputValue();
  const range = getDayRange(dateValue);

  renderCashboxLoading();

  const [summaryResponse, paymentsResponse] = await Promise.all([
    supabase.rpc('get_daily_cashbox_summary_from_app', { p_date: dateValue }),
    supabase
      .from('payments')
      .select(`
        id,
        contract_id,
        reservation_id,
        method,
        amount,
        reference,
        notes,
        created_at,
        contract:contracts(
          sequential_number,
          total_amount,
          paid_amount,
          financial_status,
          client:clients(full_name, cedula_ruc),
          vehicle:vehicles(plate, brand, model)
        )
      `)
      .gte('created_at', range.start)
      .lt('created_at', range.end)
      .order('created_at', { ascending: false }),
  ]);

  if (summaryResponse.error) {
    renderCashboxError(summaryResponse.error.message);
    showToast?.('No se pudo cargar el resumen de caja.');
    return;
  }

  if (paymentsResponse.error) {
    renderCashboxError(paymentsResponse.error.message);
    showToast?.('No se pudieron cargar los pagos del día.');
    return;
  }

  renderCashboxData(summaryResponse.data, paymentsResponse.data ?? []);
}

export function renderCashboxPage() {
  return `
    <section class="module-page">
      <div class="module-header">
        <div>
          <p class="eyebrow">Caja</p>
          <h2>Caja diaria</h2>
          <p class="module-subtitle">Control de pagos recibidos por día</p>
        </div>
      </div>

      <div class="filter-bar cashbox-toolbar">
        <label>
          Fecha
          <input id="cashbox-date" type="date" value="${getLocalDateInputValue()}" />
        </label>
        <button class="primary-button module-action" id="cashbox-refresh" type="button">Actualizar</button>
      </div>

      <div class="dashboard-grid cashbox-summary" id="cashbox-summary"></div>
      <div id="cashbox-payments"></div>
    </section>
  `;
}

export function setupCashboxPage({ showToast }) {
  cashboxPageController?.abort();
  cashboxPageController = new AbortController();

  const { signal } = cashboxPageController;

  document.querySelector('#cashbox-refresh')?.addEventListener('click', () => loadCashbox(showToast), { signal });
  document.querySelector('#cashbox-date')?.addEventListener('change', () => loadCashbox(showToast), { signal });

  loadCashbox(showToast);
}

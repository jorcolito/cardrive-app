import { supabase } from '../lib/supabaseClient.js';

const paymentMethodLabels = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
};

const cardTypeLabels = {
  AMERICAN_EXPRESS: 'American Express',
  DINERS: 'Diners',
  DISCOVER: 'Discover',
  MASTERCARD: 'Mastercard',
  OTHER: 'Otro',
  VISA: 'Visa',
};

const paymentEvidenceBucket = 'payment-evidence';

let cashboxPageController;
let dailyPayments = [];

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

function getCardTypeLabel(cardType) {
  return cardTypeLabels[cardType] ?? cardType ?? '';
}

function getPaymentMethodDisplay(payment) {
  const methodLabel = getPaymentMethodLabel(payment.method);

  if (payment.method !== 'CARD') {
    return methodLabel;
  }

  const cardType = getCardTypeLabel(payment.card_type);
  return cardType ? `${methodLabel} · ${cardType}` : methodLabel;
}

function getPaymentReferenceDisplay(payment) {
  if (payment.method === 'CASH') {
    return payment.reference || '—';
  }

  if (payment.method === 'CARD') {
    return payment.voucher_number || payment.reference || '—';
  }

  return payment.reference || '—';
}

function isPaymentEvidenceImage(payment) {
  return payment.evidence_mime_type?.startsWith('image/') ?? false;
}

function isPaymentEvidencePdf(payment) {
  const mimeType = payment.evidence_mime_type ?? '';
  const fileName = payment.evidence_file_name ?? '';

  return mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
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
      const evidenceButton = payment.evidence_path
        ? `<button class="secondary-button table-action" type="button" data-payment-evidence-id="${escapeHtml(payment.id)}">Ver comprobante</button>`
        : '—';

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
          <td data-label="Método">${escapeHtml(getPaymentMethodDisplay(payment))}</td>
          <td data-label="Monto">${formatCurrency(payment.amount)}</td>
          <td data-label="Referencia">${escapeHtml(getPaymentReferenceDisplay(payment))}</td>
          <td data-label="Comprobante">${evidenceButton}</td>
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
            <th>Comprobante</th>
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

function renderEvidencePreviewContent(payment, publicUrl) {
  const fileName = payment.evidence_file_name || 'Comprobante';

  if (isPaymentEvidenceImage(payment)) {
    return `
      <div class="evidence-preview">
        <img src="${escapeHtml(publicUrl)}" alt="${escapeHtml(fileName)}" />
      </div>
    `;
  }

  if (isPaymentEvidencePdf(payment)) {
    return `
      <div class="empty-state evidence-file-state">
        <div class="placeholder-icon">PDF</div>
        <h2>${escapeHtml(fileName)}</h2>
        <p>El comprobante es un PDF.</p>
        <a class="primary-button" href="${escapeHtml(publicUrl)}" target="_blank" rel="noopener noreferrer">Abrir PDF</a>
      </div>
    `;
  }

  return `
    <div class="empty-state evidence-file-state">
      <div class="placeholder-icon">DOC</div>
      <h2>${escapeHtml(fileName)}</h2>
      <p>No hay vista previa disponible para este tipo de archivo.</p>
      <a class="primary-button" href="${escapeHtml(publicUrl)}" target="_blank" rel="noopener noreferrer">Abrir comprobante</a>
    </div>
  `;
}

function openEvidenceModal(paymentId) {
  const modal = document.querySelector('#evidence-modal');
  const content = document.querySelector('#evidence-preview-content');
  const fileName = document.querySelector('#evidence-file-name');
  const payment = dailyPayments.find((item) => String(item.id) === String(paymentId));

  if (!modal || !content || !payment?.evidence_path) {
    return;
  }

  const { data } = supabase.storage.from(paymentEvidenceBucket).getPublicUrl(payment.evidence_path);
  const publicUrl = data?.publicUrl;

  if (fileName) {
    fileName.textContent = payment.evidence_file_name || payment.evidence_path;
  }

  content.innerHTML = publicUrl
    ? renderEvidencePreviewContent(payment, publicUrl)
    : `
      <div class="error-state">
        <h2>No se pudo abrir el comprobante</h2>
        <p>No se encontró una URL pública para el archivo.</p>
      </div>
    `;

  modal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeEvidenceModal() {
  const modal = document.querySelector('#evidence-modal');
  const content = document.querySelector('#evidence-preview-content');

  if (!modal) {
    return;
  }

  modal.hidden = true;
  document.body.classList.remove('modal-open');

  if (content) {
    content.innerHTML = '';
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
        card_type,
        voucher_number,
        evidence_path,
        evidence_file_name,
        evidence_mime_type,
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

  dailyPayments = paymentsResponse.data ?? [];
  renderCashboxData(summaryResponse.data, dailyPayments);
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

      <div class="modal-backdrop" id="evidence-modal" hidden>
        <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="evidence-modal-title">
          <div class="modal-header">
            <div>
              <p class="eyebrow">Comprobante</p>
              <h2 id="evidence-modal-title">Vista previa</h2>
              <p class="module-subtitle" id="evidence-file-name"></p>
            </div>
            <button class="icon-button" id="close-evidence-modal" type="button" aria-label="Cerrar modal">Ã—</button>
          </div>
          <div class="evidence-modal-body" id="evidence-preview-content"></div>
        </div>
      </div>
    </section>
  `;
}

export function setupCashboxPage({ showToast }) {
  cashboxPageController?.abort();
  cashboxPageController = new AbortController();

  const { signal } = cashboxPageController;

  document.querySelector('#cashbox-refresh')?.addEventListener('click', () => loadCashbox(showToast), { signal });
  document.querySelector('#cashbox-date')?.addEventListener('change', () => loadCashbox(showToast), { signal });
  document.querySelector('#cashbox-payments')?.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-payment-evidence-id]');

    if (!button) {
      return;
    }

    openEvidenceModal(button.dataset.paymentEvidenceId);
  }, { signal });
  document.querySelector('#close-evidence-modal')?.addEventListener('click', closeEvidenceModal, { signal });

  loadCashbox(showToast);
}

import { supabase } from '../lib/supabaseClient.js';

const approvalTypeLabels = {
  DISCOUNT: 'Descuento',
};

const approvalStatusLabels = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
};

let approvals = [];
let selectedApproval;
let selectedReviewStatus;
let approvalsPageController;
let showApprovalsToast;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatCurrency(value) {
  const numericValue = Number(value ?? 0);

  return new Intl.NumberFormat('es-EC', {
    currency: 'USD',
    style: 'currency',
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

function parseRequestedValue(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (typeof value === 'object') {
    return value;
  }

  return null;
}

function getRequestedDiscountAmount(approval) {
  const requestedValue = parseRequestedValue(approval?.requested_value);
  const amount = Number(requestedValue?.discount_amount);

  return Number.isFinite(amount) ? amount : null;
}

function formatOptionalCurrency(value) {
  return value === null || value === undefined ? '—' : formatCurrency(value);
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

function getApprovalTypeLabel(type) {
  return approvalTypeLabels[type] ?? 'Solicitud';
}

function getApprovalStatusLabel(status) {
  return approvalStatusLabels[status] ?? 'Sin estado';
}

function getStatusClass(status) {
  return status ? status.toLowerCase().replaceAll('_', '-') : 'unknown';
}

function renderApprovalRows(items) {
  return items
    .map((approval) => {
      const contract = approval.contract ?? {};
      const client = contract.client ?? {};
      const vehicle = contract.vehicle ?? {};
      const vehicleName = [vehicle.brand, vehicle.model].filter(Boolean).join(' ');
      const requestedDiscountAmount = getRequestedDiscountAmount(approval);
      const actions = approval.status === 'PENDING'
        ? `
          <div class="table-actions">
            <button class="secondary-button table-action" type="button" data-approval-review="${escapeHtml(approval.id)}" data-review-status="APPROVED">Aprobar</button>
            <button class="secondary-button table-action" type="button" data-approval-review="${escapeHtml(approval.id)}" data-review-status="REJECTED">Rechazar</button>
          </div>
        `
        : '—';

      return `
        <tr>
          <td data-label="Tipo">${escapeHtml(getApprovalTypeLabel(approval.type))}</td>
          <td data-label="Estado">
            <span class="status-badge status-${getStatusClass(approval.status)}">${escapeHtml(getApprovalStatusLabel(approval.status))}</span>
          </td>
          <td data-label="Contrato"><strong>${escapeHtml(contract.sequential_number || '—')}</strong></td>
          <td data-label="Cliente">
            <strong>${escapeHtml(client.full_name || 'Sin cliente')}</strong>
            <span class="table-muted">${escapeHtml(client.cedula_ruc || '—')}</span>
          </td>
          <td data-label="Vehículo">
            <strong>${escapeHtml(vehicle.plate || 'Sin placa')}</strong>
            <span class="table-muted">${escapeHtml(vehicleName || 'Sin detalle')}</span>
          </td>
          <td data-label="Monto solicitado">${formatOptionalCurrency(requestedDiscountAmount)}</td>
          <td data-label="Motivo">${escapeHtml(approval.reason || '—')}</td>
          <td data-label="Fecha solicitud">${formatDateTime(approval.requested_at)}</td>
          <td data-label="Comentario admin">${escapeHtml(approval.admin_comment || '—')}</td>
          <td data-label="Acciones">${actions}</td>
        </tr>
      `;
    })
    .join('');
}

function renderEmptyState() {
  return `
    <div class="empty-state">
      <div class="placeholder-icon">✓</div>
      <h2>Sin aprobaciones</h2>
      <p>No hay solicitudes de aprobación registradas.</p>
    </div>
  `;
}

function renderApprovals(items) {
  const container = document.querySelector('#approvals-results');

  if (!container) {
    return;
  }

  if (!items.length) {
    container.innerHTML = renderEmptyState();
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Estado</th>
            <th>Contrato</th>
            <th>Cliente</th>
            <th>Vehículo</th>
            <th>Monto solicitado</th>
            <th>Motivo</th>
            <th>Fecha solicitud</th>
            <th>Comentario admin</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${renderApprovalRows(items)}
        </tbody>
      </table>
    </div>
  `;
}

function renderLoading() {
  const container = document.querySelector('#approvals-results');

  if (container) {
    container.innerHTML = `
      <div class="loading-state">
        <span class="loading-spinner" aria-hidden="true"></span>
        <p>Cargando aprobaciones...</p>
      </div>
    `;
  }
}

function renderError(message) {
  const container = document.querySelector('#approvals-results');

  if (container) {
    container.innerHTML = `
      <div class="error-state">
        <h2>No se pudieron cargar las aprobaciones</h2>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }
}

async function loadApprovals(showToast) {
  renderLoading();

  const { data, error } = await supabase
    .from('approvals')
    .select(`
      *,
      contract:contracts(
        sequential_number,
        total_amount,
        paid_amount,
        financial_status,
        client:clients(full_name, cedula_ruc),
        vehicle:vehicles(plate, brand, model)
      )
    `)
    .order('requested_at', { ascending: false });

  if (error) {
    approvals = [];
    renderError(error.message);
    showToast?.('No se pudieron cargar las aprobaciones.');
    return;
  }

  approvals = data ?? [];
  renderApprovals(approvals);
}

function clearReviewFormError() {
  const formError = document.querySelector('#review-form-error');

  if (formError) {
    formError.textContent = '';
    formError.hidden = true;
  }
}

function showReviewFormError(message) {
  const formError = document.querySelector('#review-form-error');

  if (!formError) {
    return;
  }

  formError.textContent = message;
  formError.hidden = !message;
}

function openReviewModal(approvalId, status) {
  const modal = document.querySelector('#review-modal');
  const approval = approvals.find((item) => String(item.id) === String(approvalId));

  if (!modal || !approval) {
    return;
  }

  selectedApproval = approval;
  selectedReviewStatus = status;
  clearReviewFormError();

  const title = document.querySelector('#review-modal-title');
  const summary = document.querySelector('#review-summary');
  const form = document.querySelector('#review-form');

  if (title) {
    title.textContent = status === 'APPROVED' ? 'Aprobar solicitud' : 'Rechazar solicitud';
  }

  if (summary) {
    summary.textContent = `${getApprovalTypeLabel(approval.type)} por ${formatOptionalCurrency(getRequestedDiscountAmount(approval))} en contrato ${approval.contract?.sequential_number || '—'}.`;
  }

  if (form) {
    form.reset();
  }

  modal.hidden = false;
  document.body.classList.add('modal-open');
  document.querySelector('[name="admin_comment"]')?.focus();
}

function closeReviewModal() {
  const modal = document.querySelector('#review-modal');

  if (!modal) {
    return;
  }

  modal.hidden = true;
  selectedApproval = null;
  selectedReviewStatus = null;
  document.body.classList.remove('modal-open');
  document.querySelector('#review-form')?.reset();
  clearReviewFormError();
}

function setReviewFormLoading(isLoading) {
  const form = document.querySelector('#review-form');
  const submitButton = document.querySelector('#save-review-button');

  if (form) {
    form.querySelectorAll('textarea, button').forEach((field) => {
      field.disabled = isLoading;
    });
  }

  if (submitButton) {
    submitButton.textContent = isLoading ? 'Guardando...' : 'Guardar revisión';
  }
}

async function handleReviewApproval(event) {
  event.preventDefault();

  if (!selectedApproval || !selectedReviewStatus) {
    showReviewFormError('No se encontró la solicitud seleccionada.');
    return;
  }

  const formData = new FormData(event.currentTarget);
  const adminComment = formData.get('admin_comment')?.toString().trim() || null;

  setReviewFormLoading(true);
  showReviewFormError('');

  const { error } = await supabase.rpc('review_discount_approval_from_app', {
    p_approval_id: selectedApproval.id,
    p_status: selectedReviewStatus,
    p_admin_comment: adminComment,
  });

  setReviewFormLoading(false);

  if (error) {
    showReviewFormError(error.message);
    return;
  }

  closeReviewModal();
  await loadApprovals();
  showApprovalsToast?.('Solicitud revisada correctamente');
}

function renderReviewModal() {
  return `
    <div class="modal-backdrop" id="review-modal" hidden>
      <div class="modal-dialog modal-dialog-small" role="dialog" aria-modal="true" aria-labelledby="review-modal-title">
        <div class="modal-header">
          <div>
            <p class="eyebrow">Aprobaciones</p>
            <h2 id="review-modal-title">Revisar solicitud</h2>
          </div>
          <button class="icon-button" id="close-review-modal" type="button" aria-label="Cerrar modal">×</button>
        </div>

        <form class="approval-form" id="review-form" novalidate>
          <div class="form-alert" id="review-form-error" hidden></div>
          <p class="form-note" id="review-summary"></p>

          <label class="full-field">
            Comentario admin
            <textarea name="admin_comment" rows="4"></textarea>
          </label>

          <div class="modal-actions">
            <button class="secondary-button" id="cancel-review-modal" type="button">Cancelar</button>
            <button class="primary-button" id="save-review-button" type="submit">Guardar revisión</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function renderApprovalsPage() {
  return `
    <section class="module-page">
      <div class="module-header">
        <div>
          <p class="eyebrow">Administración</p>
          <h2>Aprobaciones</h2>
          <p class="module-subtitle">Revisión de solicitudes pendientes</p>
        </div>
      </div>

      <div id="approvals-results"></div>
      ${renderReviewModal()}
    </section>
  `;
}

export function setupApprovalsPage({ showToast }) {
  approvalsPageController?.abort();
  approvalsPageController = new AbortController();

  const { signal } = approvalsPageController;

  showApprovalsToast = showToast;
  document.querySelector('#review-form')?.addEventListener('submit', handleReviewApproval, { signal });
  document.querySelector('#close-review-modal')?.addEventListener('click', closeReviewModal, { signal });
  document.querySelector('#cancel-review-modal')?.addEventListener('click', closeReviewModal, { signal });
  document.querySelector('#approvals-results')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-approval-review]');

    if (button) {
      openReviewModal(button.dataset.approvalReview, button.dataset.reviewStatus);
    }
  }, { signal });
  document.querySelector('#review-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'review-modal') {
      closeReviewModal();
    }
  }, { signal });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.querySelector('#review-modal')?.hidden) {
      closeReviewModal();
    }
  }, { signal });

  loadApprovals(showToast);
}

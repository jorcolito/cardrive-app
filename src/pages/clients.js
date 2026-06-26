import { supabase } from '../lib/supabaseClient.js';

let clients = [];
let showClientsToast;
let clientsPageController;

const millisecondsPerDay = 24 * 60 * 60 * 1000;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  if (!value) {
    return '—';
  }

  const date = parseLocalDate(value);

  if (!date) {
    return '—';
  }

  return new Intl.DateTimeFormat('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
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

function getTodayLocalDate() {
  const now = new Date();

  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getLicenseStatus(value) {
  if (!value) {
    return {
      className: 'license-none',
      label: 'Sin fecha',
      isExpired: false,
      isExpiringSoon: false,
    };
  }

  const licenseDate = parseLocalDate(value);

  if (!licenseDate) {
    return {
      className: 'license-none',
      label: 'Sin fecha',
      isExpired: false,
      isExpiringSoon: false,
    };
  }

  const daysUntilExpiry = Math.round((licenseDate.getTime() - getTodayLocalDate().getTime()) / millisecondsPerDay);

  if (daysUntilExpiry < 0) {
    return {
      className: 'license-expired',
      label: 'Vencida',
      isExpired: true,
      isExpiringSoon: false,
    };
  }

  if (daysUntilExpiry <= 30) {
    return {
      className: 'license-soon',
      label: 'Vence pronto',
      isExpired: false,
      isExpiringSoon: true,
    };
  }

  return {
    className: 'license-valid',
    label: 'Vigente',
    isExpired: false,
    isExpiringSoon: false,
  };
}

function renderLicenseBadge(value) {
  const status = getLicenseStatus(value);
  const dateLabel = value ? formatDate(value) : status.label;
  const label = value ? `${dateLabel} · ${status.label}` : status.label;

  return `<span class="license-badge ${status.className}">${escapeHtml(label)}</span>`;
}

function renderClientRows(items) {
  return items
    .map((client) => `
      <tr>
        <td data-label="Cédula/RUC"><strong>${escapeHtml(client.cedula_ruc || 'Sin documento')}</strong></td>
        <td data-label="Nombre">${escapeHtml(client.full_name || 'Sin nombre')}</td>
        <td data-label="Teléfono">${escapeHtml(client.phone || '—')}</td>
        <td data-label="Email">${escapeHtml(client.email || '—')}</td>
        <td data-label="Dirección">${escapeHtml(client.address || '—')}</td>
        <td data-label="Licencia vence">${renderLicenseBadge(client.license_expiry)}</td>
        <td data-label="Notas">${escapeHtml(client.notes || '—')}</td>
      </tr>
    `)
    .join('');
}

function renderEmptyState(message) {
  return `
    <div class="empty-state">
      <div class="placeholder-icon">ID</div>
      <h2>Sin clientes</h2>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function getFilteredClients() {
  const search = document.querySelector('#client-search')?.value.trim().toLowerCase() ?? '';

  return clients.filter((client) => {
    const searchable = [client.cedula_ruc, client.full_name, client.phone, client.email].join(' ').toLowerCase();

    return !search || searchable.includes(search);
  });
}

function renderClients(items) {
  const container = document.querySelector('#clients-results');

  if (!container) {
    return;
  }

  if (!clients.length) {
    container.innerHTML = renderEmptyState('Cuando registres clientes en Supabase aparecerán aquí.');
    return;
  }

  if (!items.length) {
    container.innerHTML = renderEmptyState('No hay clientes que coincidan con la búsqueda actual.');
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Cédula/RUC</th>
            <th>Nombre</th>
            <th>Teléfono</th>
            <th>Email</th>
            <th>Dirección</th>
            <th>Licencia vence</th>
            <th>Notas</th>
          </tr>
        </thead>
        <tbody>
          ${renderClientRows(items)}
        </tbody>
      </table>
    </div>
  `;
}

function applyClientFilters() {
  renderClients(getFilteredClients());
}

function renderError(message) {
  const container = document.querySelector('#clients-results');

  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="error-state">
      <h2>No se pudieron cargar los clientes</h2>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

async function loadClients(showToast) {
  const container = document.querySelector('#clients-results');

  if (container) {
    container.innerHTML = `
      <div class="loading-state">
        <span class="loading-spinner" aria-hidden="true"></span>
        <p>Cargando clientes...</p>
      </div>
    `;
  }

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    clients = [];
    renderError(error.message);
    showToast?.('No se pudieron cargar los clientes.');
    return;
  }

  clients = data ?? [];
  applyClientFilters();
}

function setClientFieldError(fieldName, message) {
  const field = document.querySelector(`[data-client-error="${fieldName}"]`);

  if (field) {
    field.textContent = message;
  }
}

function clearClientFormErrors() {
  document.querySelectorAll('[data-client-error]').forEach((field) => {
    field.textContent = '';
  });

  const formError = document.querySelector('#client-form-error');

  if (formError) {
    formError.textContent = '';
    formError.hidden = true;
  }

  showClientLicenseWarning(false);
}

function showClientFormError(message) {
  const formError = document.querySelector('#client-form-error');

  if (!formError) {
    return;
  }

  formError.textContent = message;
  formError.hidden = !message;
}

function showClientLicenseWarning(isVisible) {
  const warning = document.querySelector('#client-license-warning');

  if (!warning) {
    return;
  }

  warning.textContent = isVisible ? 'La licencia vence pronto.' : '';
  warning.hidden = !isVisible;
}

function getClientFormPayload(form) {
  const formData = new FormData(form);
  const email = formData.get('email')?.toString().trim();
  const licenseExpiry = formData.get('license_expiry')?.toString().trim();
  const notes = formData.get('notes')?.toString().trim();

  return {
    cedula_ruc: formData.get('cedula_ruc')?.toString().trim() ?? '',
    full_name: formData.get('full_name')?.toString().trim() ?? '',
    phone: formData.get('phone')?.toString().trim() || null,
    email: email || null,
    address: formData.get('address')?.toString().trim() || null,
    license_expiry: licenseExpiry || null,
    notes: notes || null,
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateClientPayload(payload) {
  let isValid = true;

  clearClientFormErrors();

  if (!payload.cedula_ruc) {
    setClientFieldError('cedula_ruc', 'La cédula/RUC es obligatoria.');
    isValid = false;
  }

  if (!payload.full_name) {
    setClientFieldError('full_name', 'El nombre completo es obligatorio.');
    isValid = false;
  }

  if (payload.email && !isValidEmail(payload.email)) {
    setClientFieldError('email', 'Ingresa un email válido.');
    isValid = false;
  }

  const licenseStatus = getLicenseStatus(payload.license_expiry);

  if (licenseStatus.isExpired) {
    const message = 'La licencia del cliente está vencida. No se puede registrar.';

    setClientFieldError('license_expiry', message);
    showClientFormError(message);
    isValid = false;
  } else {
    showClientLicenseWarning(licenseStatus.isExpiringSoon);
  }

  return isValid;
}

function updateClientLicenseWarning() {
  const licenseExpiry = document.querySelector('[name="license_expiry"]')?.value ?? '';
  const licenseStatus = getLicenseStatus(licenseExpiry);

  showClientLicenseWarning(licenseStatus.isExpiringSoon);
}

function resetClientForm() {
  const form = document.querySelector('#client-form');

  if (!form) {
    return;
  }

  form.reset();
  clearClientFormErrors();
}

function setClientFormLoading(isLoading) {
  const form = document.querySelector('#client-form');
  const submitButton = document.querySelector('#save-client-button');

  if (form) {
    form.querySelectorAll('input, textarea, button').forEach((field) => {
      field.disabled = isLoading;
    });
  }

  if (submitButton) {
    submitButton.textContent = isLoading ? 'Guardando...' : 'Guardar cliente';
  }
}

function openClientModal() {
  const modal = document.querySelector('#client-modal');

  if (!modal) {
    return;
  }

  clearClientFormErrors();
  modal.hidden = false;
  document.body.classList.add('modal-open');
  document.querySelector('#client-cedula-ruc')?.focus();
}

function closeClientModal() {
  const modal = document.querySelector('#client-modal');

  if (!modal) {
    return;
  }

  modal.hidden = true;
  document.body.classList.remove('modal-open');
  resetClientForm();
}

async function handleCreateClient(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const payload = getClientFormPayload(form);

  if (!validateClientPayload(payload)) {
    return;
  }

  setClientFormLoading(true);
  showClientFormError('');

  const { error } = await supabase.from('clients').insert(payload);

  setClientFormLoading(false);

  if (error) {
    showClientFormError(error.message);
    return;
  }

  closeClientModal();
  await loadClients();
  showClientsToast?.('Cliente creado correctamente.');
}

function renderClientModal() {
  return `
    <div class="modal-backdrop" id="client-modal" hidden>
      <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="client-modal-title">
        <div class="modal-header">
          <div>
            <p class="eyebrow">Clientes</p>
            <h2 id="client-modal-title">Nuevo cliente</h2>
          </div>
          <button class="icon-button" id="close-client-modal" type="button" aria-label="Cerrar modal">×</button>
        </div>

        <form class="client-form" id="client-form" novalidate>
          <div class="form-alert" id="client-form-error" hidden></div>
          <div class="form-warning" id="client-license-warning" hidden></div>

          <div class="form-grid">
            <label>
              Cédula/RUC
              <input id="client-cedula-ruc" name="cedula_ruc" type="text" autocomplete="off" />
              <span class="field-error" data-client-error="cedula_ruc"></span>
            </label>

            <label>
              Nombre completo
              <input name="full_name" type="text" autocomplete="name" />
              <span class="field-error" data-client-error="full_name"></span>
            </label>

            <label>
              Teléfono
              <input name="phone" type="tel" autocomplete="tel" />
              <span class="field-error" data-client-error="phone"></span>
            </label>

            <label>
              Email
              <input name="email" type="email" autocomplete="email" />
              <span class="field-error" data-client-error="email"></span>
            </label>

            <label>
              Dirección
              <input name="address" type="text" autocomplete="street-address" />
              <span class="field-error" data-client-error="address"></span>
            </label>

            <label>
              Fecha de vencimiento de licencia
              <input name="license_expiry" type="date" />
              <span class="field-error" data-client-error="license_expiry"></span>
            </label>
          </div>

          <label class="full-field">
            Notas
            <textarea name="notes" rows="4"></textarea>
            <span class="field-error" data-client-error="notes"></span>
          </label>

          <div class="modal-actions">
            <button class="secondary-button" id="cancel-client-modal" type="button">Cancelar</button>
            <button class="primary-button" id="save-client-button" type="submit">Guardar cliente</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function renderClientsPage() {
  return `
    <section class="module-page">
      <div class="module-header">
        <div>
          <p class="eyebrow">Clientes</p>
          <h2>Clientes</h2>
          <p class="module-subtitle">Registro de clientes y datos de contacto</p>
        </div>
        <button class="primary-button module-action" id="new-client-button" type="button">Nuevo cliente</button>
      </div>

      <div class="filter-bar single-filter">
        <label>
          Buscar
          <input id="client-search" type="search" placeholder="Cédula/RUC, nombre, teléfono o email" autocomplete="off" />
        </label>
      </div>

      <div id="clients-results"></div>
      ${renderClientModal()}
    </section>
  `;
}

export function setupClientsPage({ showToast }) {
  clientsPageController?.abort();
  clientsPageController = new AbortController();

  const { signal } = clientsPageController;

  showClientsToast = showToast;
  document.querySelector('#client-search')?.addEventListener('input', applyClientFilters, { signal });
  document.querySelector('[name="license_expiry"]')?.addEventListener('change', updateClientLicenseWarning, { signal });
  document.querySelector('[name="license_expiry"]')?.addEventListener('input', updateClientLicenseWarning, { signal });
  document.querySelector('#new-client-button')?.addEventListener('click', openClientModal, { signal });
  document.querySelector('#close-client-modal')?.addEventListener('click', closeClientModal, { signal });
  document.querySelector('#cancel-client-modal')?.addEventListener('click', closeClientModal, { signal });
  document.querySelector('#client-form')?.addEventListener('submit', handleCreateClient, { signal });
  document.querySelector('#client-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'client-modal') {
      closeClientModal();
    }
  }, { signal });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.querySelector('#client-modal')?.hidden) {
      closeClientModal();
    }
  }, { signal });

  loadClients(showToast);
}

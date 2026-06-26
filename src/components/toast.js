export function renderToastHost() {
  return '<div class="toast-host" id="toast-host" aria-live="polite"></div>';
}

export function showToast(message) {
  const host = document.querySelector('#toast-host');

  if (!host) {
    return;
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  host.append(toast);

  window.setTimeout(() => {
    toast.classList.add('is-hiding');
    window.setTimeout(() => toast.remove(), 220);
  }, 2600);
}

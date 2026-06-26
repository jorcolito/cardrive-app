export function renderTopbar(title, subtitle) {
  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">Panel operativo</p>
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </div>

      <div class="topbar-actions">
        <span class="status-pill">Demo</span>
        <span class="user-chip">Administrador</span>
      </div>
    </header>
  `;
}

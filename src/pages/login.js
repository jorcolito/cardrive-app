import { startDemoSession } from '../lib/auth.js';

export function renderLoginPage() {
  return `
    <main class="login-page">
      <section class="login-panel">
        <div class="login-copy">
          <div class="brand login-brand">
            <div class="brand-mark">C</div>
            <div>
              <strong>CARDRIVE</strong>
              <span>Gestión de rentadora</span>
            </div>
          </div>

          <h1>Control simple para una flota pequeña.</h1>
          <p>
            Administra vehículos, reservas, contratos, aprobaciones y caja diaria desde una base visual lista para crecer.
          </p>

          <div class="login-highlights" aria-label="Resumen de módulos">
            <span>Flota</span>
            <span>Reservas</span>
            <span>Caja</span>
          </div>
        </div>

        <form class="login-card" id="login-form">
          <div>
            <p class="eyebrow">Acceso interno</p>
            <h2>Iniciar sesión</h2>
          </div>

          <label>
            Correo
            <input type="email" value="admin@cardrive.local" autocomplete="email" />
          </label>

          <label>
            Contraseña
            <input type="password" value="cardrive-demo" autocomplete="current-password" />
          </label>

          <button class="primary-button" type="submit">Entrar al panel</button>
          <p class="form-note">Acceso visual de demostración. El login real se conectará después.</p>
        </form>
      </section>
    </main>
  `;
}

export function setupLoginPage({ navigate, showToast }) {
  document.querySelector('#login-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    startDemoSession();
    showToast('Entraste al panel demo.');
    navigate('/dashboard');
  });
}

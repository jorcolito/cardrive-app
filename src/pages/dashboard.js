const metrics = [
  { label: 'Carros disponibles', value: '12', detail: 'Listos para entrega', tone: 'green' },
  { label: 'Carros rentados', value: '8', detail: 'En contratos activos', tone: 'navy' },
  { label: 'Reservas próximas', value: '5', detail: 'Próximas 48 horas', tone: 'red' },
  { label: 'Retornos de hoy', value: '3', detail: 'Por inspeccionar', tone: 'amber' },
  { label: 'Ingresos del día', value: '$420', detail: 'Mock financiero', tone: 'green' },
  { label: 'Alertas pendientes', value: '4', detail: 'Revisión requerida', tone: 'red' },
];

export function renderDashboardPage() {
  const cards = metrics
    .map(
      (metric) => `
        <article class="metric-card">
          <span class="metric-dot ${metric.tone}"></span>
          <p>${metric.label}</p>
          <strong>${metric.value}</strong>
          <small>${metric.detail}</small>
        </article>
      `,
    )
    .join('');

  return `
    <section class="dashboard-grid">
      ${cards}
    </section>

    <section class="content-grid">
      <article class="panel">
        <div class="panel-header">
          <h2>Operación de hoy</h2>
          <span>Mock</span>
        </div>
        <ul class="activity-list">
          <li><strong>09:00</strong><span>Entrega preparada para Toyota Corolla.</span></li>
          <li><strong>11:30</strong><span>Retorno pendiente de inspección.</span></li>
          <li><strong>15:00</strong><span>Contrato listo para firma.</span></li>
        </ul>
      </article>

      <article class="panel accent-panel">
        <div class="panel-header">
          <h2>Próximo paso</h2>
          <span>Base</span>
        </div>
        <p>
          Esta pantalla queda lista para conectar datos reales de Supabase cuando se definan tablas, autenticación y flujo operativo.
        </p>
      </article>
    </section>
  `;
}

const CONFIG = {
  al_dia: { label: 'Al día', className: 'badge-verde' },
  plan_pago: { label: 'Plan de pago', className: 'badge-amarillo' },
  moroso: { label: 'Moroso', className: 'badge-rojo' }
};

export default function EstadoBadge({ estado }) {
  const cfg = CONFIG[estado] || { label: estado, className: '' };
  return <span className={`badge ${cfg.className}`}>{cfg.label}</span>;
}

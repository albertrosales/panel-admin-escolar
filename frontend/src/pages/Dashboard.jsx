import { useEffect, useState } from 'react';
import { api } from '../api';

const COLEGIO_ID = 1; // TODO: reemplazar por selección real / login multi-colegio

export default function Dashboard() {
  const [stats, setStats] = useState({ al_dia: 0, plan_pago: 0, moroso: 0 });

  useEffect(() => {
    api.pagos.reporteEstado(COLEGIO_ID).then((rows) => {
      const mapped = { al_dia: 0, plan_pago: 0, moroso: 0 };
      rows.forEach((r) => { mapped[r.estado_pago] = Number(r.total); });
      setStats(mapped);
    });
  }, []);

  return (
    <div>
      <h2>Resumen general</h2>
      <div className="stats-row">
        <div className="card stat-box">
          <div className="num" style={{ color: '#34c77b' }}>{stats.al_dia}</div>
          <div className="label">Alumnos al día</div>
        </div>
        <div className="card stat-box">
          <div className="num" style={{ color: '#e8b84b' }}>{stats.plan_pago}</div>
          <div className="label">Con plan de pago</div>
        </div>
        <div className="card stat-box">
          <div className="num" style={{ color: '#e35d5d' }}>{stats.moroso}</div>
          <div className="label">Morosos (acceso bloqueado)</div>
        </div>
      </div>
      <div className="card">
        <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>
          El estado de acceso a Moodle se sincroniza automáticamente todos los días a las 6:00 AM.
          Los alumnos morosos pierden acceso a la plataforma hasta regularizar su pago o acordar un plan de pago.
        </p>
      </div>
    </div>
  );
}

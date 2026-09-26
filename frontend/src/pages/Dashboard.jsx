import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts';
import { api } from '../api';

const COLEGIO_ID = 1; // TODO: reemplazar por selección real / login multi-colegio

function formatearMes(mes) {
  if (!mes) return '';
  const [anio, m] = mes.split('-');
  const nombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return nombres[Number(m) - 1] + ' ' + anio.slice(2);
}

export default function Dashboard() {
  const [resumen, setResumen] = useState(null);
  const [ingresos, setIngresos] = useState([]);
  const [nuevos, setNuevos] = useState([]);
  const [bajas, setBajas] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    Promise.all([
      api.estadisticas.resumen(COLEGIO_ID),
      api.estadisticas.ingresosPorMes(COLEGIO_ID),
      api.estadisticas.alumnosNuevosPorMes(COLEGIO_ID),
      api.estadisticas.bajasPorMes(COLEGIO_ID)
    ]).then(([r, i, n, b]) => {
      setResumen(r);
      setIngresos(i.map((x) => ({ mes: formatearMes(x.mes), total: Number(x.total) })));
      setNuevos(n.map((x) => ({ mes: formatearMes(x.mes), total: Number(x.total) })));
      setBajas(b.map((x) => ({ mes: formatearMes(x.mes), total: Number(x.total) })));
      setCargando(false);
    });
  }, []);

  if (cargando) return <p className="text-sm text-gray-500">Cargando resumen...</p>;

  const a = resumen.alumnos;
  const p = resumen.profesores;

  return (
    <div>
      <h2>Resumen general</h2>

      <div className="stats-row">
        <div className="card stat-box">
          <div className="num">{a.activos}</div>
          <div className="label">Alumnos activos</div>
        </div>
        <div className="card stat-box">
          <div className="num">{p.activos}</div>
          <div className="label">Profesores activos</div>
        </div>
        <div className="card stat-box">
          <div className="num">{a.extranjeros}</div>
          <div className="label">Alumnos extranjeros</div>
        </div>
        <div className="card stat-box">
          <div className="num text-red-600">{a.desertados}</div>
          <div className="label">Desertados (histórico)</div>
        </div>
      </div>

      <div className="stats-row">
        <div className="card stat-box">
          <div className="num text-green-700">L. {resumen.ingresos_mes_actual.toFixed(2)}</div>
          <div className="label">Ingresos este mes</div>
        </div>
        <div className="card stat-box">
          <div className="num text-red-600">L. {resumen.total_pendiente_cobro.toFixed(2)}</div>
          <div className="label">Total pendiente de cobro</div>
        </div>
        <div className="card stat-box">
          <div className="num text-green-700">{a.al_dia}</div>
          <div className="label">Alumnos al día</div>
        </div>
        <div className="card stat-box">
          <div className="num text-amber-700">{a.en_plan_pago}</div>
          <div className="label">Con plan de pago</div>
        </div>
      </div>

      <div className="card">
        <h3>Ingresos mensuales (últimos 12 meses)</h3>
        {ingresos.length === 0 ? (
          <p className="text-sm text-gray-500">Aún no hay pagos registrados para graficar.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={ingresos}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => 'L. ' + v.toFixed(2)} />
              <Line type="monotone" dataKey="total" stroke="#2455e6" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h3>Alumnos nuevos por mes</h3>
        {nuevos.length === 0 ? (
          <p className="text-sm text-gray-500">Sin matrículas registradas en los últimos 12 meses.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={nuevos}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="total" fill="#2455e6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h3>Bajas / deserciones por mes</h3>
        {bajas.length === 0 ? (
          <p className="text-sm text-gray-500">No se ha dado de baja a ningún alumno todavía.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bajas}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="total" fill="#c53030" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <p className="text-sm text-gray-500">
          El estado de acceso a Moodle se sincroniza automáticamente todos los días a las 6:00 AM.
          Los alumnos morosos pierden acceso a la plataforma hasta regularizar su pago o acordar un plan de pago.
        </p>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api, cerrarSesionPortal } from '../api';
import EstadoBadge from '../components/EstadoBadge';

function salir() {
  cerrarSesionPortal();
  window.location.href = '/portal/login';
}

function fecha(valor) {
  return valor ? new Date(valor).toLocaleDateString('es-HN') : '—';
}

export default function Portal() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.portal.me().then(setDatos).catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <p className="text-red-600 mb-3">{error}</p>
        <button className="secondary" onClick={salir}>Volver al inicio de sesión</button>
      </div>
    );
  }
  if (!datos) return <p className="p-6">Cargando...</p>;

  const perfil = datos.perfil;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="!mb-0">
            {perfil.nombre_completo}{' '}
            {datos.tipo === 'alumno' && <EstadoBadge estado={perfil.estado_pago} />}
          </h2>
          <p className="text-sm text-gray-500">{datos.tipo === 'alumno' ? 'Alumno' : 'Docente'}</p>
        </div>
        <button className="secondary" onClick={salir}>Cerrar sesión</button>
      </div>

      {datos.tipo === 'alumno' ? <VistaAlumno datos={datos} /> : <VistaProfesor datos={datos} />}
    </div>
  );
}

function VistaAlumno({ datos }) {
  const perfil = datos.perfil;
  return (
    <div>
      <div className="card">
        <h3>Mi información</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <p><span className="text-gray-500">Teléfono:</span> {perfil.telefono || '—'}</p>
          <p><span className="text-gray-500">Dirección:</span> {perfil.direccion || '—'}</p>
          <p><span className="text-gray-500">Ingreso al colegio:</span> {fecha(perfil.fecha_matricula)}</p>
        </div>
      </div>

      <div className="card">
        <h3>Mis clases</h3>
        {datos.clases.length === 0 && <p className="text-sm text-gray-500">Aún no estás matriculado en ninguna clase.</p>}
        <ul>
          {datos.clases.map((c) => <li key={c.id} className="text-sm">{c.nombre}</li>)}
        </ul>
      </div>

      <div className="card">
        <h3>Mis calificaciones</h3>
        {datos.notas === null && (
          <p className="text-sm text-gray-500">No se pudieron cargar tus calificaciones en este momento.</p>
        )}
        {datos.notas !== null && datos.notas.length === 0 && (
          <p className="text-sm text-gray-500">Aún no tienes calificaciones registradas.</p>
        )}
        {datos.notas !== null && datos.notas.length > 0 && (
          <table>
            <thead><tr><th>Clase</th><th>Nota</th></tr></thead>
            <tbody>
              {datos.notas.map((n, i) => (
                <tr key={i}><td>{n.clase}</td><td>{n.nota || '—'}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Mis pagos</h3>
        {datos.pagos.length === 0 ? (
          <p className="text-sm text-gray-500">No hay pagos registrados.</p>
        ) : (
          <table>
            <thead><tr><th>Periodo</th><th>Monto</th><th>Vencimiento</th><th>Estado</th></tr></thead>
            <tbody>
              {datos.pagos.map((p, i) => (
                <tr key={i}>
                  <td>{p.periodo}</td>
                  <td>L. {p.monto}</td>
                  <td>{fecha(p.fecha_vencimiento)}</td>
                  <td>{p.pagado ? 'Pagado' : 'Pendiente'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function VistaProfesor({ datos }) {
  const perfil = datos.perfil;
  return (
    <div>
      <div className="card">
        <h3>Mi información</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <p><span className="text-gray-500">Correo:</span> {perfil.correo || '—'}</p>
          <p><span className="text-gray-500">Teléfono:</span> {perfil.telefono || '—'}</p>
          <p><span className="text-gray-500">Ingreso:</span> {fecha(perfil.fecha_ingreso)}</p>
          <p><span className="text-gray-500">Antigüedad:</span> {perfil.antiguedad_anios} años</p>
        </div>
      </div>

      <h3 className="text-sm font-semibold mb-3">Mis clases</h3>
      {datos.asignaciones.length === 0 && (
        <div className="card"><p className="text-sm text-gray-500">Aún no tienes clases asignadas.</p></div>
      )}
      {datos.asignaciones.map((a, i) => (
        <div className="card" key={i}>
          <h3>{a.grado_nombre} — {a.materia}</h3>
          <p className="text-xs text-gray-500 mb-2">{a.alumnos.length} alumno(s)</p>
          {a.alumnos.length === 0 ? (
            <p className="text-sm text-gray-500">Sin alumnos matriculados.</p>
          ) : (
            <ul>
              {a.alumnos.map((al) => <li key={al.id} className="text-sm">{al.nombre_completo}</li>)}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

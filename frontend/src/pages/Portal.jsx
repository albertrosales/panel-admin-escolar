import { useEffect, useState } from 'react';
import { api, cerrarSesionPortal } from '../api';
import { comprimirImagen } from '../imagen';
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
          <p className="text-sm text-gray-500">{datos.tipo === 'alumno' ? 'Alumno · Código ' + perfil.codigo : 'Docente'}</p>
        </div>
        <button className="secondary" onClick={salir}>Cerrar sesión</button>
      </div>

      {datos.tipo === 'alumno' ? <VistaAlumno datos={datos} /> : <VistaProfesor datos={datos} />}
    </div>
  );
}

const ESTADOS_COMP = { requiere_alumno: 'Pendiente de validación', por_verificar: 'Pendiente de validación', confirmado: 'Confirmado', rechazado: 'Rechazado' };

function SubirComprobante() {
  const [lista, setLista] = useState([]);
  const [msg, setMsg] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [conf, setConf] = useState(null); // { nombre, estado: 'pregunta' | 'ok' }
  const cargar = () => api.portal.misComprobantes().then(setLista).catch(() => {});
  useEffect(() => { cargar(); }, []);

  async function verificar(v) {
    setCodigo(v); setConf(null);
    if (v.trim().length < 6) return;
    try {
      const r = await api.portal.verificarCodigo(v.trim());
      setConf(r.propio ? { nombre: r.nombre, estado: 'ok' } : { nombre: r.nombre, estado: 'pregunta' });
    } catch (err) { setConf({ error: err.message }); }
  }

  async function subir(e) {
    const f = e.target.files && e.target.files[0];
    const input = e.target;
    if (!f) return;
    if (codigo.trim() && (!conf || conf.error || conf.estado === 'pregunta')) { setMsg('Confirma primero el código de alumno.'); input.value = ''; return; }
    setSubiendo(true); setMsg('Enviando comprobante...');
    try {
      await api.portal.subirComprobante(await comprimirImagen(f), codigo.trim() || undefined);
      setMsg('Comprobante enviado. Está pendiente de validación; el colegio lo confirmará.');
      setCodigo(''); setConf(null);
      cargar();
    } catch (err) { setMsg('Error: ' + err.message); }
    setSubiendo(false); input.value = '';
  }

  return (
    <div className="card">
      <h3>Enviar comprobante de pago</h3>
      <p className="text-sm text-gray-500 mb-3">Sube la captura o foto de tu transferencia o depósito. Si pagas por otro alumno, escribe su código.</p>
      <label className="max-w-xs mb-3">Código de alumno (opcional)
        <input value={codigo} onChange={(e) => verificar(e.target.value)} placeholder="Ej. 202601" inputMode="numeric" />
      </label>
      {conf && conf.error && <p className="text-sm text-red-600 mb-2">{conf.error}</p>}
      {conf && conf.estado === 'pregunta' && (
        <div className="bg-amber-50 rounded-xl p-3 mb-3 text-sm">
          <p>¿Este pago es de <b>{conf.nombre}</b>?</p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setConf({ ...conf, estado: 'ok' })}>Sí, es él/ella</button>
            <button className="secondary" onClick={() => { setCodigo(''); setConf(null); }}>No, corregir código</button>
          </div>
        </div>
      )}
      {conf && conf.estado === 'ok' && <p className="text-sm text-emerald-700 mb-2">Pago para: <b>{conf.nombre}</b></p>}
      <input type="file" accept="image/*" onChange={subir} disabled={subiendo} className="w-auto" />
      {msg && <p className="text-sm text-gray-500 mt-2">{msg}</p>}
      {lista.length > 0 && (
        <table className="mt-4">
          <thead><tr><th>Fecha</th><th>Monto</th><th>Estado</th></tr></thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id}>
                <td>{new Date(c.creado_en).toLocaleDateString('es-HN')}</td>
                <td>{c.monto != null ? 'L. ' + Number(c.monto).toFixed(2) : '—'}</td>
                <td>{ESTADOS_COMP[c.estado] || c.estado}{c.estado === 'rechazado' && c.nota ? ' — ' + c.nota : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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

      <SubirComprobante />

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
                  <td>{p.pagado ? 'Pagado' : p.en_validacion ? 'Pendiente de validación' : 'Pendiente'}</td>
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

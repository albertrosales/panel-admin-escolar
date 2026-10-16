import { useEffect, useState } from 'react';
import { api } from '../api';

const BADGE = { pendiente: 'badge-amarillo', aprobada: 'badge-verde', rechazada: 'badge-rojo' };
const vacio = { anio_escolar: new Date().getFullYear() + 1, fecha_inicio: '', fecha_fin: '', monto: '', instrucciones: '', aprobacion_automatica: false, bloquear_morosos: true };
const dmy = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '—');

function Periodos({ periodos, recargar, onVer }) {
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  async function guardar(e) {
    e.preventDefault(); setMsg('');
    try {
      f.id ? await api.matriculas.editarPeriodo(f.id, f) : await api.matriculas.crearPeriodo(f);
      setF(null); recargar();
    } catch (err) { setMsg(err.message); }
  }
  async function eliminar(p) {
    if (!window.confirm('¿Eliminar el período ' + p.anio_escolar + '?')) return;
    try { await api.matriculas.eliminarPeriodo(p.id); recargar(); } catch (err) { setMsg(err.message); }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="!mb-0">Períodos de matrícula</h3>
        {!f && <button onClick={() => setF({ ...vacio })}>Abrir nuevo período</button>}
      </div>
      <p className="text-sm text-gray-500 mb-3">Los alumnos solo pueden matricularse desde su panel entre la fecha de inicio y la de cierre.</p>
      {f && (
        <form onSubmit={guardar} className="flex flex-col gap-3 border border-gray-200 rounded-xl p-4 mb-4">
          <div className="grid sm:grid-cols-4 gap-3">
            <label>Año escolar<input type="number" value={f.anio_escolar} onChange={set('anio_escolar')} required /></label>
            <label>Abre el<input type="date" value={f.fecha_inicio} onChange={set('fecha_inicio')} required /></label>
            <label>Cierra el<input type="date" value={f.fecha_fin} onChange={set('fecha_fin')} required /></label>
            <label>Costo de matrícula (L.)<input type="number" min="0" step="0.01" value={f.monto == null ? '' : f.monto} onChange={set('monto')} placeholder="Opcional" /></label>
          </div>
          <label>Indicaciones para las familias (opcional)
            <textarea rows="3" value={f.instrucciones || ''} onChange={set('instrucciones')} placeholder="Ej. Pague la matrícula y suba su comprobante en la pestaña Pagos." />
          </label>
          <label className="!flex-row items-center gap-2"><input type="checkbox" className="w-auto" checked={!!f.bloquear_morosos} onChange={set('bloquear_morosos')} />No permitir matricularse a quien tenga pagos vencidos</label>
          <label className="!flex-row items-center gap-2"><input type="checkbox" className="w-auto" checked={!!f.aprobacion_automatica} onChange={set('aprobacion_automatica')} />Aprobar automáticamente (sin revisión del director)</label>
          <div className="flex gap-2"><button type="submit">Guardar</button><button type="button" className="secondary" onClick={() => setF(null)}>Cancelar</button></div>
        </form>
      )}
      {msg && <p className="text-sm text-red-600 mb-2">{msg}</p>}
      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>Año</th><th>Abre</th><th>Cierra</th><th>Estado</th><th>Solicitudes</th><th></th></tr></thead>
          <tbody>
            {periodos.map((p) => (
              <tr key={p.id}>
                <td><b>{p.anio_escolar}</b></td><td>{dmy(p.fecha_inicio)}</td><td>{dmy(p.fecha_fin)}</td>
                <td>{p.abierta ? <span className="badge badge-verde">Abierta</span> : <span className="badge">{p.fecha_inicio > new Date().toISOString().slice(0, 10) ? 'Programada' : 'Cerrada'}</span>}</td>
                <td>{p.total}{p.pendientes ? <span className="badge badge-amarillo ml-2">{p.pendientes} por revisar</span> : null}</td>
                <td className="whitespace-nowrap">
                  <button className="secondary" onClick={() => onVer(p.id)}>Ver solicitudes</button>{' '}
                  <button className="secondary" onClick={() => setF({ ...p })}>Editar</button>{' '}
                  {!p.total && <button className="secondary" onClick={() => eliminar(p)}>Eliminar</button>}
                </td>
              </tr>
            ))}
            {periodos.length === 0 && <tr><td colSpan={6} className="text-gray-500">Aún no hay períodos. Abre uno para que las familias puedan matricularse.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Solicitudes({ periodos, periodoId, setPeriodoId, recargarPeriodos }) {
  const [lista, setLista] = useState([]);
  const [estado, setEstado] = useState('');
  const [msg, setMsg] = useState('');
  const cargar = () => api.matriculas.solicitudes({ ...(periodoId ? { periodo_id: periodoId } : {}), ...(estado ? { estado } : {}) }).then(setLista).catch((e) => setMsg(e.message));
  useEffect(() => { cargar(); }, [periodoId, estado]);

  async function aprobar(s) {
    try { const r = await api.matriculas.aprobar(s.id); setMsg(r.avisos && r.avisos.length ? 'Aprobada, pero: ' + r.avisos.join(' · ') : ''); cargar(); recargarPeriodos(); } catch (e) { setMsg(e.message); }
  }
  async function rechazar(s) {
    const motivo = window.prompt('Motivo del rechazo (se enviará al encargado por correo)');
    if (motivo === null) return;
    if (!motivo.trim()) { setMsg('Escribe el motivo del rechazo'); return; }
    try { await api.matriculas.rechazar(s.id, motivo.trim()); cargar(); recargarPeriodos(); } catch (e) { setMsg(e.message); }
  }

  async function eliminar(s) {
    const txt = s.estado === 'aprobada'
      ? `¿Eliminar a ${s.nombre_completo} de la matrícula ${s.anio_escolar}? Se le quitarán las clases de ${s.grado_destino || 'su sección'} que se le activaron al aprobar (también en Moodle).`
      : `¿Eliminar la solicitud de ${s.nombre_completo}?`;
    if (!window.confirm(txt)) return;
    try {
      const r = await api.matriculas.eliminarSolicitud(s.id);
      setMsg(r.avisos && r.avisos.length ? 'Eliminada, pero: ' + r.avisos.join(' · ') : '');
      cargar(); recargarPeriodos();
    } catch (e) { setMsg(e.message); }
  }

  return (
    <div className="card">
      <h3>Solicitudes de matrícula</h3>
      <div className="flex flex-wrap gap-3 mb-3">
        <select className="w-44" value={periodoId} onChange={(e) => setPeriodoId(e.target.value)}>
          <option value="">Todos los años</option>
          {periodos.map((p) => <option key={p.id} value={p.id}>{p.anio_escolar}</option>)}
        </select>
        <select className="w-44" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todas</option><option value="pendiente">Por revisar</option><option value="aprobada">Aprobadas</option><option value="rechazada">Rechazadas</option>
        </select>
      </div>
      {msg && <p className="text-sm text-red-600 mb-2">{msg}</p>}
      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>Alumno</th><th>Año</th><th>Sección elegida</th><th>Encargado</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {lista.map((s) => (
              <tr key={s.id}>
                <td>{s.nombre_completo}<span className="block text-xs text-gray-400">{s.codigo}</span></td>
                <td>{s.anio_escolar}</td>
                <td><b>{s.grado_destino || '—'}</b></td>
                <td className="text-sm">{s.nombre_encargado}<span className="block text-xs text-gray-500">{s.telefono_encargado} · {s.correo_encargado}</span>
                  {s.observaciones && <span className="block text-xs text-gray-500">“{s.observaciones}”</span>}</td>
                <td><span className={'badge ' + BADGE[s.estado]}>{s.estado}</span>{s.motivo_rechazo && <span className="block text-xs text-gray-500">{s.motivo_rechazo}</span>}</td>
                <td className="whitespace-nowrap">
                  {s.estado !== 'aprobada' && <button onClick={() => aprobar(s)}>Aprobar</button>}{' '}
                  {s.estado === 'pendiente' && <button className="secondary" onClick={() => rechazar(s)}>Rechazar</button>}{' '}
                  <button className="secondary" onClick={() => eliminar(s)}>Eliminar</button>
                </td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={6} className="text-gray-500">No hay solicitudes.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500 mt-3">Al aprobar se actualizan los datos de contacto, se envía el correo de confirmación y el alumno queda matriculado en todas las clases de la sección elegida, también en Moodle.</p>
    </div>
  );
}

export default function Matricula() {
  const [periodos, setPeriodos] = useState([]);
  const [periodoId, setPeriodoId] = useState('');
  const recargar = () => api.matriculas.periodos().then(setPeriodos).catch(() => {});
  useEffect(() => { recargar(); }, []);
  return (
    <div>
      <h2>Matrícula en línea</h2>
      <Periodos periodos={periodos} recargar={recargar} onVer={(id) => { setPeriodoId(String(id)); window.scrollTo({ top: 9999, behavior: 'smooth' }); }} />
      <Solicitudes periodos={periodos} periodoId={periodoId} setPeriodoId={setPeriodoId} recargarPeriodos={recargar} />
    </div>
  );
}

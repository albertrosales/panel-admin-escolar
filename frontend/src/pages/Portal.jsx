import { useEffect, useState } from 'react';
import { api, cerrarSesionPortal } from '../api';
import { comprimirImagen } from '../imagen';
import EstadoBadge from '../components/EstadoBadge';

function salir() {
  cerrarSesionPortal();
  window.location.href = '/portal/login';
}

function fecha(valor) {
  if (!valor) return '—';
  const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/); // las fechas sin hora no deben correrse de día
  return m ? m[3] + '/' + m[2] + '/' + m[1] : new Date(valor).toLocaleDateString('es-HN');
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
          <p className="text-sm text-gray-500">{datos.tipo === 'alumno' ? 'Alumno · Código ' + perfil.codigo + ' · Panel para el alumno y su familia' : 'Docente'}</p>
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

function MatriculaAlumno({ onCambio }) {
  const [d, setD] = useState(null);
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');
  const cargar = () => api.portal.matricula().then((r) => {
    setD(r);
    if (r.datos) setF({ grado_id: '', nombre_encargado: r.datos.nombre_encargado || '', telefono_encargado: r.datos.telefono_encargado || '', correo_encargado: r.datos.correo_encargado || '',
      telefono: r.datos.telefono || '', direccion: r.datos.direccion || '', observaciones: '', acepta: false });
  }).catch((e) => setMsg(e.message));
  useEffect(() => { cargar(); }, []);
  if (!d) return <div className="card"><p className="text-sm text-gray-500">{msg || 'Cargando...'}</p></div>;

  const p = d.periodo;
  if (!p) return <div className="card"><h3>Matrícula</h3><p className="text-sm text-gray-500">No hay un período de matrícula programado por ahora. Te avisaremos cuando se abra.</p></div>;
  const s = d.solicitud;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function enviar(e) {
    e.preventDefault(); setMsg(''); setOk('');
    try {
      const r = await api.portal.solicitarMatricula(f);
      setOk(r.estado === 'aprobada' ? '¡Matrícula aprobada!' : 'Solicitud enviada. La revisaremos y te avisaremos por correo.');
      await cargar(); onCambio && onCambio();
    } catch (err) { setMsg(err.message); }
  }

  return (
    <div className="card">
      <h3>Matrícula año escolar {p.anio_escolar}</h3>
      <p className="text-sm text-gray-500 mb-3">Período de matrícula: del {fecha(p.fecha_inicio)} al {fecha(p.fecha_fin)}{p.monto != null ? ' · Costo: L. ' + Number(p.monto).toFixed(2) : ''}</p>
      {p.instrucciones && <p className="text-sm bg-blue-50 border border-blue-100 rounded-xl p-3 mb-3 whitespace-pre-line">{p.instrucciones}</p>}
      {ok && <p className="text-sm text-emerald-700 mb-3">{ok}</p>}

      {s && s.estado === 'aprobada' && <p className="text-sm text-emerald-700">✔ Matrícula aprobada para <b>{s.grado_nombre}</b>. ¡Gracias!</p>}
      {s && s.estado === 'pendiente' && <p className="text-sm text-amber-700">Tu solicitud para <b>{s.grado_nombre}</b> está en revisión. Te avisaremos por correo.</p>}
      {s && s.estado === 'rechazada' && <p className="text-sm text-red-600 mb-3">Tu solicitud no pudo ser aprobada: {s.motivo_rechazo || 'consulta con administración'}.{p.abierta ? ' Puedes corregirla y enviarla de nuevo.' : ''}</p>}

      {!s && p.ventana === 'proxima' && <p className="text-sm text-gray-600">La matrícula aún no está abierta. Podrás hacerla desde el {fecha(p.fecha_inicio)}.</p>}
      {!s && p.ventana === 'cerrada' && <p className="text-sm text-gray-600">El período de matrícula cerró el {fecha(p.fecha_fin)}. Comunícate con administración.</p>}

      {p.abierta && (!s || s.estado === 'rechazada') && (d.bloqueado
        ? <p className="text-sm text-red-600">{d.bloqueado}</p>
        : f && (
          <form onSubmit={enviar} className="flex flex-col gap-3">
            <label>Grado al que se matricula
              <select value={f.grado_id} onChange={set('grado_id')} required>
                <option value="">Selecciona...</option>
                {d.grados.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
            </label>
            <p className="text-xs text-gray-500 -mb-1">Confirma los datos del padre, madre o encargado. A este correo llegan los avisos del colegio.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <label>Nombre del encargado<input value={f.nombre_encargado} onChange={set('nombre_encargado')} required /></label>
              <label>Teléfono del encargado<input value={f.telefono_encargado} onChange={set('telefono_encargado')} required /></label>
              <label>Correo del encargado<input type="email" value={f.correo_encargado} onChange={set('correo_encargado')} required /></label>
              <label>Teléfono del alumno (opcional)<input value={f.telefono} onChange={set('telefono')} /></label>
            </div>
            <label>Dirección (opcional)<input value={f.direccion} onChange={set('direccion')} /></label>
            <label>Comentarios para el colegio (opcional)<textarea rows="2" value={f.observaciones} onChange={set('observaciones')} /></label>
            <label className="!flex-row items-center gap-2 text-sm"><input type="checkbox" className="w-auto" checked={f.acepta} onChange={set('acepta')} />Confirmo que los datos son correctos</label>
            {msg && <p className="text-sm text-red-600">{msg}</p>}
            <div><button type="submit">Enviar solicitud de matrícula</button></div>
          </form>
        ))}
    </div>
  );
}

function VistaAlumno({ datos }) {
  const perfil = datos.perfil;
  const [tab, setTab] = useState('inicio');
  const [mat, setMat] = useState(null);
  const cargarMat = () => api.portal.matricula().then(setMat).catch(() => {});
  useEffect(() => { cargarMat(); }, []);

  const pendientes = datos.pagos.filter((x) => !x.pagado);
  const deuda = pendientes.reduce((t, x) => t + Number(x.monto || 0), 0);
  const vencidos = pendientes.filter((x) => new Date(x.fecha_vencimiento) < new Date()).length;
  const avisoMat = mat && mat.periodo && mat.periodo.abierta && (!mat.solicitud || mat.solicitud.estado === 'rechazada');

  const tabs = [['inicio', 'Inicio'], ['notas', 'Calificaciones'], ['pagos', 'Pagos'], ['matricula', 'Matrícula'], ['info', 'Mi información']];

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map(([k, n]) => (
          <button key={k} className={tab === k ? '' : 'secondary'} onClick={() => setTab(k)}>
            {n}{k === 'matricula' && avisoMat ? ' •' : ''}
          </button>
        ))}
      </div>

      {tab === 'inicio' && (
        <div>
          {avisoMat && (
            <div className="card border-blue-200 bg-blue-50">
              <h3>La matrícula {mat.periodo.anio_escolar} está abierta</h3>
              <p className="text-sm mb-3">Hasta el {fecha(mat.periodo.fecha_fin)} puedes matricularte desde aquí.</p>
              <button onClick={() => setTab('matricula')}>Ir a matrícula</button>
            </div>
          )}
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="card !mb-0"><p className="text-xs text-gray-500">Estado de cuenta</p><p className="text-lg font-semibold">{pendientes.length ? 'L. ' + deuda.toFixed(2) : 'Al día'}</p>
              <p className="text-xs text-gray-500">{pendientes.length ? pendientes.length + ' pago(s) pendiente(s)' + (vencidos ? ' · ' + vencidos + ' vencido(s)' : '') : 'Sin pagos pendientes'}</p></div>
            <div className="card !mb-0"><p className="text-xs text-gray-500">Mis clases</p><p className="text-lg font-semibold">{datos.clases.length}</p>
              <p className="text-xs text-gray-500">{datos.clases.map((c) => c.nombre).join(', ') || 'Sin clases'}</p></div>
            <div className="card !mb-0"><p className="text-xs text-gray-500">Ingreso al colegio</p><p className="text-lg font-semibold">{fecha(perfil.fecha_matricula)}</p></div>
          </div>
        </div>
      )}

      {tab === 'notas' && (
        <div className="card">
          <h3>Calificaciones</h3>
          {datos.notas === null && <p className="text-sm text-gray-500">No se pudieron cargar las calificaciones en este momento.</p>}
          {datos.notas !== null && datos.notas.length === 0 && <p className="text-sm text-gray-500">Aún no hay calificaciones registradas.</p>}
          {datos.notas !== null && datos.notas.length > 0 && (
            <table>
              <thead><tr><th>Clase</th><th>Nota</th></tr></thead>
              <tbody>{datos.notas.map((n, i) => <tr key={i}><td>{n.clase}</td><td>{n.nota || '—'}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'pagos' && (
        <div>
          <SubirComprobante />
          <div className="card">
            <h3>Historial de pagos</h3>
            {datos.pagos.length === 0 ? (
              <p className="text-sm text-gray-500">No hay pagos registrados.</p>
            ) : (
              <table>
                <thead><tr><th>Periodo</th><th>Monto</th><th>Vencimiento</th><th>Estado</th></tr></thead>
                <tbody>
                  {datos.pagos.map((p, i) => (
                    <tr key={i}>
                      <td>{p.periodo}</td><td>L. {p.monto}</td><td>{fecha(p.fecha_vencimiento)}</td>
                      <td>{p.pagado ? 'Pagado' : p.en_validacion ? 'Pendiente de validación' : 'Pendiente'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'matricula' && <MatriculaAlumno onCambio={cargarMat} />}

      {tab === 'info' && (
        <div className="card">
          <h3>Mi información</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <p><span className="text-gray-500">Código de alumno:</span> {perfil.codigo}</p>
            <p><span className="text-gray-500">Teléfono:</span> {perfil.telefono || '—'}</p>
            <p><span className="text-gray-500">Dirección:</span> {perfil.direccion || '—'}</p>
            <p><span className="text-gray-500">Ingreso al colegio:</span> {fecha(perfil.fecha_matricula)}</p>
          </div>
          <p className="text-xs text-gray-500 mt-3">Para corregir estos datos, hazlo al enviar tu matrícula o comunícate con administración.</p>
        </div>
      )}
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

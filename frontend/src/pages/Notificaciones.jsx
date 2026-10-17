import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

const ESTADO_CLS = { enviado: 'badge-verde', entregado: 'badge-verde', pendiente: 'badge-amarillo', enviando: 'badge-amarillo', fallido: 'badge-rojo' };
const usadas = (t) => [...new Set([...String(t).matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) => m[1].toLowerCase()))];

// ---------------- Enviar ----------------
function Enviar({ plantillas, info }) {
  const [clave, setClave] = useState('');
  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [extras, setExtras] = useState({});
  const [tipo, setTipo] = useState('todos');
  const [grados, setGrados] = useState([]);
  const [alumnos, setAlumnos] = useState([]);
  const [gradoId, setGradoId] = useState('');
  const [sel, setSel] = useState([]);
  const [buscar, setBuscar] = useState('');
  const [vista, setVista] = useState(null);
  const [prueba, setPrueba] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => { api.grados.listar({ colegio_id: 1 }).then(setGrados); api.alumnos.listar({}).then(setAlumnos); }, []);

  function elegir(c) {
    setClave(c); setVista(null); setMsg('');
    const p = plantillas.find((x) => x.clave === c);
    setAsunto(p ? p.asunto : ''); setCuerpo(p ? p.cuerpo : ''); setExtras({});
  }

  const manuales = useMemo(() => usadas(asunto + '\n' + cuerpo).filter((v) => info.variables_manuales[v] && !['periodo_academico', 'nombre_director'].includes(v)), [asunto, cuerpo, info]);
  const audiencia = () => (tipo === 'grado' ? { tipo, grado_id: gradoId } : tipo === 'alumnos' ? { tipo, alumno_ids: sel } : { tipo: 'todos' });
  const cuerpoReq = () => ({ clave, asunto, cuerpo, extras, audiencia: audiencia() });
  const lista = alumnos.filter((a) => !buscar || (a.nombre_completo + ' ' + a.codigo).toLowerCase().includes(buscar.toLowerCase()));

  async function previsualizar() {
    setMsg('');
    try { setVista(await api.correos.vistaPrevia(cuerpoReq())); } catch (e) { setMsg(e.message); }
  }
  async function probar() {
    try { await api.correos.prueba({ ...cuerpoReq(), para: prueba }); setMsg('Prueba enviada a ' + prueba); } catch (e) { setMsg(e.message); }
  }
  async function enviar() {
    try {
      const v = await api.correos.vistaPrevia(cuerpoReq());
      if (!v.destinatarios) { setMsg('No hay destinatarios en esa selección.'); return; }
      if (!window.confirm(`Se enviará un correo individual a ${v.destinatarios - v.sin_correo} encargado(s)${v.sin_correo ? ` (${v.sin_correo} alumno(s) no tienen correo registrado)` : ''}. ¿Continuar?`)) return;
      const r = await api.correos.enviar(cuerpoReq());
      setMsg(`En cola: ${r.en_cola}. Sin correo: ${r.sin_correo}.${r.repetidos ? ' Omitidos por repetir el mismo correo: ' + r.repetidos + '.' : ''} Revisa el estado en Historial.`);
    } catch (e) { setMsg(e.message); }
  }

  return (
    <div>
      {!info.configurado && <div className="card border-amber-200 bg-amber-50 text-sm">El correo aún no está conectado en el servidor. Mira la pestaña <b>Ajustes</b>.</div>}
      <div className="card">
        <h3>1. Plantilla</h3>
        <select value={clave} onChange={(e) => elegir(e.target.value)}>
          <option value="">Selecciona una plantilla...</option>
          {['Pagos', 'Asistencia', 'Académico', 'Dirección'].map((g) => (
            <optgroup key={g} label={g}>{plantillas.filter((p) => p.grupo === g).map((p) => <option key={p.clave} value={p.clave}>{p.nombre}</option>)}</optgroup>
          ))}
        </select>
        {clave && (
          <div className="flex flex-col gap-3 mt-3">
            <label>Asunto<input value={asunto} onChange={(e) => setAsunto(e.target.value)} /></label>
            <label>Mensaje<textarea rows="9" value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} /></label>
            <p className="text-xs text-gray-500">Las variables como {'{{nombre_alumno}}'} se completan solas con los datos de cada alumno. Los cambios aquí aplican solo a este envío.</p>
            {manuales.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-3">
                {manuales.map((v) => (
                  <label key={v} className={['mensaje_director', 'mensaje_personalizado'].includes(v) ? 'sm:col-span-2' : ''}>{info.variables_manuales[v]}
                    {['mensaje_director', 'mensaje_personalizado'].includes(v)
                      ? <textarea rows="4" value={extras[v] || ''} onChange={(e) => setExtras({ ...extras, [v]: e.target.value })} />
                      : <input value={extras[v] || ''} onChange={(e) => setExtras({ ...extras, [v]: e.target.value })} />}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {clave && (
        <>
          <div className="card">
            <h3>2. Destinatarios</h3>
            <p className="text-sm text-gray-500 mb-2">Se envía a los encargados, un correo individual por alumno.</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {[['todos', 'Toda la institución'], ['grado', 'Una clase'], ['alumnos', 'Alumnos específicos']].map(([k, n]) => (
                <button key={k} className={tipo === k ? '' : 'secondary'} onClick={() => setTipo(k)}>{n}</button>
              ))}
            </div>
            {tipo === 'grado' && (
              <select value={gradoId} onChange={(e) => setGradoId(e.target.value)}>
                <option value="">Selecciona la clase...</option>
                {grados.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
            )}
            {tipo === 'alumnos' && (
              <div>
                <input placeholder="Buscar por nombre o código..." value={buscar} onChange={(e) => setBuscar(e.target.value)} className="mb-2" />
                <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-xl p-2 text-sm">
                  {lista.map((a) => (
                    <label key={a.id} className="!flex-row items-center gap-2 py-0.5">
                      <input type="checkbox" className="w-auto" checked={sel.includes(a.id)} onChange={(e) => setSel(e.target.checked ? [...sel, a.id] : sel.filter((x) => x !== a.id))} />
                      <span>{a.nombre_completo} <span className="text-gray-400">· {a.codigo}</span></span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">{sel.length} seleccionado(s)</p>
              </div>
            )}
          </div>

          <div className="card">
            <h3>3. Revisar y enviar</h3>
            <div className="flex flex-wrap gap-2 items-end">
              <button className="secondary" onClick={previsualizar}>Vista previa</button>
              <button onClick={enviar} disabled={!info.configurado}>Enviar</button>
              <input className="w-56" placeholder="Correo para prueba" value={prueba} onChange={(e) => setPrueba(e.target.value)} />
              <button className="secondary" onClick={probar} disabled={!info.configurado || !prueba}>Enviar prueba</button>
            </div>
            {msg && <p className="text-sm text-gray-600 mt-3">{msg}</p>}
            {vista && vista.vista && (
              <div className="mt-4">
                <p className="text-sm text-gray-500 mb-2">Ejemplo con los datos reales de <b>{vista.vista.alumno}</b> · {vista.destinatarios} destinatario(s). <b>Asunto:</b> {vista.vista.asunto}</p>
                <iframe title="Vista previa" srcDoc={vista.vista.html} className="w-full border border-gray-200 rounded-xl" style={{ height: 420 }} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------- Plantillas ----------------
function Plantillas({ plantillas, recargar, info }) {
  const [abierta, setAbierta] = useState(null);
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');

  function abrir(p) { setAbierta(p.clave); setF({ asunto: p.asunto, cuerpo: p.cuerpo, activa: p.activa, parametro: p.parametro == null ? '' : p.parametro }); setMsg(''); }
  async function guardar(p, extra) {
    const datos = { ...(f && abierta === p.clave ? f : { asunto: p.asunto, cuerpo: p.cuerpo, activa: p.activa, parametro: p.parametro == null ? '' : p.parametro }), ...extra };
    try { await api.correos.guardarPlantilla(p.clave, datos); setMsg('Guardado.'); await recargar(); } catch (e) { setMsg(e.message); }
  }
  async function restaurar(p) {
    if (!window.confirm('¿Volver al texto original de esta plantilla?')) return;
    await api.correos.restaurar(p.clave); setAbierta(null); recargar();
  }

  return (
    <div>
      {['Pagos', 'Asistencia', 'Académico', 'Dirección'].map((g) => (
        <div className="card" key={g}>
          <h3>{g}</h3>
          <div className="flex flex-col divide-y divide-gray-100">
            {plantillas.filter((p) => p.grupo === g).map((p) => (
              <div key={p.clave} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <b className="text-sm">{p.nombre}</b> {p.editada && <span className="badge badge-amarillo">Editada</span>}
                    {p.auto && <p className="text-xs text-gray-500">{p.auto.evento}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    {p.auto && (
                      <label className="!flex-row items-center gap-2 text-sm">
                        <input type="checkbox" className="w-auto" checked={p.activa} onChange={(e) => guardar(p, { activa: e.target.checked })} />
                        Automática
                      </label>
                    )}
                    <button className="secondary" onClick={() => (abierta === p.clave ? setAbierta(null) : abrir(p))}>{abierta === p.clave ? 'Cerrar' : 'Editar'}</button>
                  </div>
                </div>
                {abierta === p.clave && f && (
                  <div className="flex flex-col gap-3 mt-3">
                    <label>Asunto<input value={f.asunto} onChange={(e) => setF({ ...f, asunto: e.target.value })} /></label>
                    <label>Mensaje<textarea rows="9" value={f.cuerpo} onChange={(e) => setF({ ...f, cuerpo: e.target.value })} /></label>
                    {p.auto && p.auto.parametro && (
                      <label className="max-w-xs">{p.auto.parametro.etiqueta}
                        <input type="number" min="1" value={f.parametro} onChange={(e) => setF({ ...f, parametro: e.target.value })} />
                      </label>
                    )}
                    <p className="text-xs text-gray-500">
                      Variables automáticas: {info.variables_auto.map((v) => '{{' + v + '}}').join(' ')}<br />
                      Las que escribe quien envía: {Object.keys(info.variables_manuales).map((v) => '{{' + v + '}}').join(' ')}.<br />
                      Si un dato no existe, esa línea se omite en el correo.
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => guardar(p)}>Guardar</button>
                      {p.editada && <button className="secondary" onClick={() => restaurar(p)}>Restaurar original</button>}
                    </div>
                    {msg && <p className="text-sm text-gray-500">{msg}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------- Historial ----------------
function Historial() {
  const [lista, setLista] = useState([]);
  const [estado, setEstado] = useState('');
  const cargar = () => api.correos.historial(estado).then(setLista).catch(() => {});
  useEffect(() => { cargar(); }, [estado]);
  return (
    <div className="card">
      <div className="flex gap-3 items-center mb-3">
        <select className="w-48" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos</option><option value="enviado">Enviados</option><option value="pendiente">Pendientes</option><option value="fallido">Fallidos</option>
        </select>
        <button className="secondary" onClick={cargar}>Actualizar</button>
      </div>
      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>Fecha</th><th>Alumno</th><th>Para</th><th>Asunto</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {lista.map((n) => (
              <tr key={n.id}>
                <td className="whitespace-nowrap">{new Date(n.creado_en).toLocaleString('es-HN')}</td>
                <td>{n.alumno || '—'}</td>
                <td>{n.destinatario || '—'}</td>
                <td>{n.asunto}</td>
                <td><span className={'badge ' + (ESTADO_CLS[n.estado] || '')}>{n.estado}</span>{n.error && <span className="block text-xs text-gray-500">{n.error}</span>}</td>
                <td>{n.estado === 'fallido' && n.destinatario && <button className="secondary" onClick={() => api.correos.reintentar(n.id).then(cargar)}>Reintentar</button>}</td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={6} className="text-gray-500">Aún no hay correos.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- Ajustes ----------------
function Ajustes({ info, recargar }) {
  const [f, setF] = useState({ correo_color: info.correo_color || '#2455e6', correo_logo_url: info.correo_logo_url || '', correo_pie: info.correo_pie || '' });
  const [msg, setMsg] = useState('');
  async function guardar(e) {
    e.preventDefault();
    try { await api.correos.guardarEstado(f); setMsg('Guardado.'); recargar(); } catch (e2) { setMsg(e2.message); }
  }
  return (
    <div>
      <div className="card">
        <h3>Conexión de correo</h3>
        <p className="text-sm">
          Estado: {info.configurado ? <span className="badge badge-verde">Conectado</span> : <span className="badge badge-rojo">No conectado</span>} · Remitente: <b>{info.remitente}</b>
        </p>
        {!info.configurado && (
          <p className="text-sm text-gray-500 mt-2">Faltan las variables <code>GMAIL_CLIENT_ID</code>, <code>GMAIL_CLIENT_SECRET</code> y <code>GMAIL_REFRESH_TOKEN</code> en Render.</p>
        )}
      </div>
      <div className="card">
        <h3>Identidad visual de los correos</h3>
        <form onSubmit={guardar} className="flex flex-col gap-3 max-w-lg">
          <label>Color principal<input type="color" className="w-20 h-10 p-1" value={f.correo_color} onChange={(e) => setF({ ...f, correo_color: e.target.value })} /></label>
          <p className="text-xs text-gray-500">El logo y el nombre se cambian en Configuración → Marca de la institución.</p>
          <label>Pie del correo (opcional)<input value={f.correo_pie} onChange={(e) => setF({ ...f, correo_pie: e.target.value })} placeholder="Tocoa, Colón · Tel. ..." /></label>
          <div><button type="submit">Guardar</button></div>
          {msg && <p className="text-sm text-gray-500">{msg}</p>}
        </form>
      </div>
    </div>
  );
}

export default function Notificaciones() {
  const [tab, setTab] = useState('enviar');
  const [plantillas, setPlantillas] = useState([]);
  const [info, setInfo] = useState(null);
  const recargar = () => Promise.all([api.correos.plantillas().then(setPlantillas), api.correos.estado().then(setInfo)]);
  useEffect(() => { recargar(); }, []);
  if (!info) return <p>Cargando...</p>;
  return (
    <div>
      <h2>Notificaciones por correo</h2>
      <div className="flex flex-wrap gap-2 mb-4">
        {[['enviar', 'Enviar'], ['plantillas', 'Plantillas y automáticas'], ['historial', 'Historial'], ['ajustes', 'Ajustes']].map(([k, n]) => (
          <button key={k} className={tab === k ? '' : 'secondary'} onClick={() => setTab(k)}>{n}</button>
        ))}
      </div>
      {tab === 'enviar' && <Enviar plantillas={plantillas} info={info} />}
      {tab === 'plantillas' && <Plantillas plantillas={plantillas} recargar={recargar} info={info} />}
      {tab === 'historial' && <Historial />}
      {tab === 'ajustes' && <Ajustes info={info} recargar={recargar} />}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api, guardarSesion, obtenerUsuario, descargarRespaldo } from '../api';

const ESTADO = { activa: ['Activa', 'badge-verde'], prueba: ['Prueba', 'badge-amarillo'], vencida: ['Vencida', 'badge-rojo'], suspendida: ['Suspendida', 'badge-rojo'] };
const MODULOS = { comprobantes: 'Comprobantes de pago', conciliacion: 'Estado de cuenta bancario', asistencia: 'Asistencia', notificaciones: 'Notificaciones por correo', matricula: 'Matrícula en línea', importacion: 'Importación desde Excel' };
const dmy = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : 'Sin vencimiento');

function Resumen() {
  const [r, setR] = useState(null);
  useEffect(() => { api.proveedor.resumen().then(setR).catch(() => {}); }, []);
  if (!r) return null;
  const k = [['Colegios', r.colegios], ['Activos', r.activos], ['En prueba', r.prueba], ['Por vencer (15 días)', r.por_vencer], ['Vencidos', r.vencidos], ['Suspendidos', r.suspendidos], ['Alumnos activos', r.alumnos]];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      {k.map(([n, v]) => <div key={n} className="stat-box"><div className="num">{v}</div><div className="label">{n}</div></div>)}
    </div>
  );
}

function NuevoColegio({ planes, onListo, onCancelar }) {
  const [f, setF] = useState({ nombre: '', moodle_url: '', variable_token: 'MOODLE_TOKEN_', plan_id: '', prueba: true, dias: 30, admin: { nombre: '', correo: '', password: '' } });
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const setA = (k) => (e) => setF({ ...f, admin: { ...f.admin, [k]: e.target.value } });
  async function guardar(e) {
    e.preventDefault(); setMsg('');
    try { await api.proveedor.crearColegio(f); onListo(); } catch (err) { setMsg(err.message); }
  }
  return (
    <form onSubmit={guardar} className="card flex flex-col gap-3">
      <h3>Nuevo colegio</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <label>Nombre del colegio<input value={f.nombre} onChange={set('nombre')} required /></label>
        <label>Dirección de su Moodle<input value={f.moodle_url} onChange={set('moodle_url')} placeholder="https://campus.colegio.com" required /></label>
        <label>Variable del token en Render<input value={f.variable_token} onChange={set('variable_token')} required /></label>
        <label>Plan
          <select value={f.plan_id} onChange={set('plan_id')} required>
            <option value="">Selecciona...</option>
            {planes.filter((p) => p.activo).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
      </div>
      <label className="!flex-row items-center gap-2"><input type="checkbox" className="w-auto" checked={f.prueba} onChange={set('prueba')} />Empezar con prueba gratuita de
        <input type="number" min="1" className="w-20" value={f.dias} onChange={set('dias')} /> días</label>
      <p className="text-xs text-gray-500 -mb-1">Administrador del colegio (con este usuario entrarán a su panel)</p>
      <div className="grid sm:grid-cols-3 gap-3">
        <label>Nombre<input value={f.admin.nombre} onChange={setA('nombre')} required /></label>
        <label>Correo<input type="email" value={f.admin.correo} onChange={setA('correo')} required /></label>
        <label>Contraseña (mín. 8)<input type="text" value={f.admin.password} onChange={setA('password')} required minLength={8} /></label>
      </div>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <div className="flex gap-2"><button type="submit">Crear colegio</button><button type="button" className="secondary" onClick={onCancelar}>Cancelar</button></div>
    </form>
  );
}

function UsuariosColegio({ colegioId }) {
  const [lista, setLista] = useState([]);
  const [msg, setMsg] = useState('');
  const cargar = () => api.proveedor.usuarios(colegioId).then((r) => setLista(r.map((u) => ({ ...u, password: '' })))).catch((e) => setMsg(e.message));
  useEffect(() => { cargar(); }, [colegioId]);
  const set = (i, k, v) => setLista(lista.map((u, j) => (j === i ? { ...u, [k]: v } : u)));
  async function guardar(u) {
    setMsg('');
    try {
      const d = { nombre: u.nombre, correo: u.correo, activo: u.activo };
      if (u.password) d.password = u.password;
      await api.proveedor.editarUsuario(colegioId, u.id, d); setMsg('Usuario guardado.'); cargar();
    } catch (e) { setMsg(e.message); }
  }
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-1">Usuarios del colegio (correo, contraseña y acceso)</p>
      <div className="flex flex-col gap-2">
        {lista.map((u, i) => (
          <div key={u.id} className="grid sm:grid-cols-5 gap-2 items-end">
            <label>Nombre<input value={u.nombre} onChange={(e) => set(i, 'nombre', e.target.value)} /></label>
            <label>Correo<input type="email" value={u.correo} onChange={(e) => set(i, 'correo', e.target.value)} /></label>
            <label>Nueva contraseña<input type="text" placeholder="(sin cambios)" value={u.password} onChange={(e) => set(i, 'password', e.target.value)} /></label>
            <label className="!flex-row items-center gap-2 text-sm"><input type="checkbox" className="w-auto" checked={u.activo} onChange={(e) => set(i, 'activo', e.target.checked)} />Activo · {u.rol}</label>
            <button className="secondary" onClick={() => guardar(u)}>Guardar usuario</button>
          </div>
        ))}
        {lista.length === 0 && <p className="text-sm text-gray-500">Este colegio no tiene usuarios.</p>}
      </div>
      {msg && <p className="text-sm text-gray-600 mt-1">{msg}</p>}
    </div>
  );
}

function EditarColegio({ c, planes, onListo }) {
  const [f, setF] = useState({ nombre: c.nombre, moodle_url: c.moodle_url || '', plan_id: c.plan_id || '', licencia_estado: c.licencia_estado, licencia_vence: c.licencia_vence || '',
    limite_alumnos: c.limite_alumnos ?? '', limite_usuarios: c.limite_usuarios ?? '', notas_proveedor: c.notas_proveedor || '', modulos: { ...(c.modulos || {}) } });
  const [dias, setDias] = useState(30);
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const efectivo = (k) => (typeof f.modulos[k] === 'boolean' ? f.modulos[k] : (f.plan_id ? !!((planes.find((p) => p.id === Number(f.plan_id)) || {}).modulos || {})[k] : true));

  async function guardar() {
    setMsg('');
    try { await api.proveedor.editarColegio(c.id, { ...f, plan_id: f.plan_id || null }); setMsg('Guardado.'); onListo(); } catch (e) { setMsg(e.message); }
  }
  async function extender() {
    try { const r = await api.proveedor.extender(c.id, dias); setF({ ...f, licencia_vence: r.licencia_vence }); setMsg('Licencia extendida hasta ' + dmy(r.licencia_vence)); onListo(); } catch (e) { setMsg(e.message); }
  }
  async function entrar() {
    try {
      const r = await api.proveedor.entrar(c.id);
      localStorage.setItem('token_proveedor', localStorage.getItem('token'));
      localStorage.setItem('usuario_proveedor', localStorage.getItem('usuario'));
      guardarSesion(r.token, obtenerUsuario());
      window.location.href = '/';
    } catch (e) { setMsg(e.message); }
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 mt-3 flex flex-col gap-3 bg-gray-50">
      <div className="grid sm:grid-cols-3 gap-3">
        <label>Nombre<input value={f.nombre} onChange={set('nombre')} /></label>
        <label>Dirección de su Moodle<input value={f.moodle_url} onChange={set('moodle_url')} placeholder="https://campus.colegio.com" /></label>
        <label>Plan
          <select value={f.plan_id} onChange={set('plan_id')}>
            <option value="">Sin plan (todo habilitado)</option>
            {planes.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
        <label>Estado
          <select value={f.licencia_estado} onChange={set('licencia_estado')}>
            <option value="activa">Activa</option><option value="prueba">Prueba gratuita</option><option value="suspendida">Suspendida</option>
          </select>
        </label>
        <label>Vence el<input type="date" value={f.licencia_vence} onChange={set('licencia_vence')} /></label>
        <label>Límite de alumnos (vacío = el del plan)<input type="number" min="0" value={f.limite_alumnos} onChange={set('limite_alumnos')} /></label>
        <label>Límite de usuarios (vacío = el del plan)<input type="number" min="0" value={f.limite_usuarios} onChange={set('limite_usuarios')} /></label>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label>Extender licencia (días)<input type="number" min="1" className="w-24" value={dias} onChange={(e) => setDias(e.target.value)} /></label>
        <button className="secondary" onClick={extender}>Extender</button>
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1">Módulos (marca solo los que este colegio necesita)</p>
        <div className="grid sm:grid-cols-2 gap-1">
          {Object.entries(MODULOS).map(([k, n]) => (
            <label key={k} className="!flex-row items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" className="w-auto" checked={efectivo(k)} onChange={(e) => setF({ ...f, modulos: { ...f.modulos, [k]: e.target.checked } })} />{n}
            </label>
          ))}
        </div>
      </div>
      <UsuariosColegio colegioId={c.id} />
      <label>Notas internas<textarea rows="2" value={f.notas_proveedor} onChange={set('notas_proveedor')} /></label>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={guardar}>Guardar cambios</button>
        <button className="secondary" onClick={entrar}>Entrar al panel (soporte)</button>
        {msg && <span className="text-sm text-gray-600">{msg}</span>}
      </div>
    </div>
  );
}

function Colegios({ planes }) {
  const [lista, setLista] = useState([]);
  const [abierto, setAbierto] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const cargar = () => api.proveedor.colegios().then(setLista).catch(() => {});
  useEffect(() => { cargar(); }, []);
  return (
    <div>
      {nuevo && <NuevoColegio planes={planes} onCancelar={() => setNuevo(false)} onListo={() => { setNuevo(false); cargar(); }} />}
      <div className="card">
        <div className="flex items-center justify-between mb-3"><h3 className="!mb-0">Colegios</h3>{!nuevo && <button onClick={() => setNuevo(true)}>Nuevo colegio</button>}</div>
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>Colegio</th><th>Plan</th><th>Licencia</th><th>Vence</th><th>Alumnos</th><th>Usuarios</th><th></th></tr></thead>
            <tbody>
              {lista.map((c) => {
                const [n, cls] = ESTADO[c.licencia.estado] || [c.licencia.estado, ''];
                return (
                  <tr key={c.id} className="align-top">
                    <td colSpan={abierto === c.id ? 7 : 1}>
                      {abierto === c.id ? (
                        <div><b>{c.nombre}</b> <span className="text-xs text-gray-400">{c.moodle_url}</span>
                          <EditarColegio c={c} planes={planes} onListo={cargar} />
                          <button className="secondary mt-2" onClick={() => setAbierto(null)}>Cerrar</button></div>
                      ) : <><b>{c.nombre}</b><span className="block text-xs text-gray-400">{c.moodle_url}</span></>}
                    </td>
                    {abierto !== c.id && <>
                      <td>{c.plan_nombre || '—'}</td>
                      <td><span className={'badge ' + cls}>{n}</span></td>
                      <td>{dmy(c.licencia.vence)}{c.licencia.dias_restantes != null && c.licencia.dias_restantes >= 0 && c.licencia.dias_restantes <= 15 ? <span className="block text-xs text-amber-600">{c.licencia.dias_restantes} día(s)</span> : null}</td>
                      <td>{c.alumnos}{c.limites.alumnos != null ? ' / ' + c.limites.alumnos : ''}</td>
                      <td>{c.usuarios}{c.limites.usuarios != null ? ' / ' + c.limites.usuarios : ''}</td>
                      <td><button className="secondary" onClick={() => setAbierto(c.id)}>Administrar</button></td>
                    </>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Planes({ planes, recargar }) {
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  const nuevo = () => setF({ nombre: '', precio_mensual: '', max_alumnos: '', max_usuarios: '', dias_prueba: '', modulos: {}, activo: true });
  async function guardar(e) {
    e.preventDefault(); setMsg('');
    try { f.id ? await api.proveedor.editarPlan(f.id, f) : await api.proveedor.crearPlan(f); setF(null); recargar(); } catch (err) { setMsg(err.message); }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3"><h3 className="!mb-0">Planes de suscripción</h3>{!f && <button onClick={nuevo}>Nuevo plan</button>}</div>
      {f && (
        <form onSubmit={guardar} className="flex flex-col gap-3 border border-gray-200 rounded-xl p-4 mb-4">
          <div className="grid sm:grid-cols-5 gap-3">
            <label>Nombre<input value={f.nombre} onChange={set('nombre')} required /></label>
            <label>Precio mensual (L.)<input type="number" min="0" step="0.01" value={f.precio_mensual ?? ''} onChange={set('precio_mensual')} /></label>
            <label>Máx. alumnos<input type="number" min="0" value={f.max_alumnos ?? ''} onChange={set('max_alumnos')} placeholder="Sin límite" /></label>
            <label>Máx. usuarios<input type="number" min="0" value={f.max_usuarios ?? ''} onChange={set('max_usuarios')} placeholder="Sin límite" /></label>
            <label>Días de prueba<input type="number" min="0" value={f.dias_prueba ?? ''} onChange={set('dias_prueba')} /></label>
          </div>
          <div className="grid sm:grid-cols-3 gap-1">
            {Object.entries(MODULOS).map(([k, n]) => (
              <label key={k} className="!flex-row items-center gap-2 text-sm text-gray-700"><input type="checkbox" className="w-auto" checked={!!(f.modulos || {})[k]} onChange={(e) => setF({ ...f, modulos: { ...f.modulos, [k]: e.target.checked } })} />{n}</label>
            ))}
          </div>
          <label className="!flex-row items-center gap-2 text-sm"><input type="checkbox" className="w-auto" checked={f.activo !== false} onChange={set('activo')} />Plan disponible para nuevos colegios</label>
          {msg && <p className="text-sm text-red-600">{msg}</p>}
          <div className="flex gap-2"><button type="submit">Guardar plan</button><button type="button" className="secondary" onClick={() => setF(null)}>Cancelar</button></div>
        </form>
      )}
      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>Plan</th><th>Precio</th><th>Alumnos</th><th>Usuarios</th><th>Módulos</th><th></th></tr></thead>
          <tbody>
            {planes.map((p) => (
              <tr key={p.id}>
                <td><b>{p.nombre}</b>{!p.activo && <span className="badge ml-2">Oculto</span>}</td>
                <td>{p.precio_mensual != null ? 'L. ' + Number(p.precio_mensual).toFixed(2) : 'Por definir'}</td>
                <td>{p.max_alumnos ?? 'Sin límite'}</td><td>{p.max_usuarios ?? 'Sin límite'}</td>
                <td className="text-xs text-gray-500">{Object.keys(MODULOS).filter((k) => (p.modulos || {})[k]).map((k) => MODULOS[k]).join(', ') || 'Solo lo básico'}</td>
                <td><button className="secondary" onClick={() => setF({ ...p })}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Respaldos() {
  const [lista, setLista] = useState([]);
  const [msg, setMsg] = useState('');
  useEffect(() => { api.proveedor.colegios().then(setLista).catch(() => {}); }, []);
  async function bajar(id) {
    setMsg('Preparando copia...');
    try { await descargarRespaldo(id); setMsg('Copia descargada.'); } catch (e) { setMsg(e.message); }
  }
  return (
    <div className="card">
      <h3>Copias de seguridad</h3>
      <p className="text-sm text-gray-500 mb-3">El archivo incluye los datos del colegio sin fotos de comprobantes ni el token de Moodle. Si configuras <code>BACKUP_EMAIL</code> en Render, cada domingo se envía una copia de cada colegio a ese correo.
        Para recuperar registros borrados: <code>node server/scripts/restaurar.js archivo.json.gz [id_colegio] --simular</code> (quita --simular para aplicar).</p>
      <div className="flex flex-col gap-2">
        <div><button onClick={() => bajar('todos')}>Descargar todos los colegios</button></div>
        {lista.map((c) => <div key={c.id} className="flex items-center gap-3 text-sm"><span className="w-60">{c.nombre}</span><button className="secondary" onClick={() => bajar(c.id)}>Descargar</button></div>)}
      </div>
      {msg && <p className="text-sm text-gray-500 mt-2">{msg}</p>}
    </div>
  );
}

export default function Proveedor() {
  const [tab, setTab] = useState('colegios');
  const [planes, setPlanes] = useState([]);
  const cargarPlanes = () => api.proveedor.planes().then(setPlanes).catch(() => {});
  useEffect(() => { cargarPlanes(); }, []);
  return (
    <div>
      <h2>Panel del proveedor</h2>
      <Resumen />
      <div className="flex gap-2 mb-4">
        {[['colegios', 'Colegios'], ['planes', 'Planes'], ['respaldos', 'Respaldos']].map(([k, n]) => <button key={k} className={tab === k ? '' : 'secondary'} onClick={() => setTab(k)}>{n}</button>)}
      </div>
      {tab === 'colegios' && <Colegios planes={planes} />}
      {tab === 'planes' && <Planes planes={planes} recargar={cargarPlanes} />}
      {tab === 'respaldos' && <Respaldos />}
    </div>
  );
}

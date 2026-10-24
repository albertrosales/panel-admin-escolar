import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api, obtenerUsuario } from '../api';
import EscanerQR from '../components/EscanerQR';

const L = (n) => 'L. ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaTxt = (f) => (f ? f.split('-').reverse().join('/') : '');
const ESTADO = { pagado: ['Pagado', 'badge-verde'], usado: ['Ya ingresó', 'badge-amarillo'], pendiente: ['Sin pagar', 'badge-rojo'], anulado: ['Anulado', ''] };
const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function imprimir(evento, boletos, colegio) {
  const imgs = await Promise.all(boletos.map((b) => QRCode.toDataURL(b.codigo, { width: 300, margin: 1 })));
  const w = window.open('', '_blank');
  if (!w) { alert('El navegador bloqueó la ventana. Permite las ventanas emergentes para imprimir.'); return; }
  w.document.write(`<!doctype html><title>Boletos</title><style>body{font-family:Arial;margin:16px}.b{display:flex;align-items:center;gap:16px;border:2px dashed #333;border-radius:12px;padding:12px 16px;margin:0 0 12px;page-break-inside:avoid;width:520px}
  img{width:150px;height:150px}h2{margin:0 0 4px;font-size:20px}p{margin:2px 0;font-size:14px}.c{font-family:monospace;font-size:13px;margin-top:6px}</style>` +
    boletos.map((b, i) => `<div class="b"><img src="${imgs[i]}"><div><p style="font-size:12px;color:#555">${esc(colegio || '')}</p><h2>${esc(evento.nombre)}</h2>
    <p>${evento.fecha ? fechaTxt(evento.fecha) + (evento.hora ? ' · ' + esc(evento.hora) : '') : ''}</p><p>${esc(evento.lugar || '')}</p>
    <p>${b.comprador ? 'A nombre de: ' + esc(b.comprador) : ''}</p><p class="c">${esc(b.codigo)}</p></div></div>`).join('') + '<script>setTimeout(()=>window.print(),400)<\/script>');
  w.document.close();
}

function FormEvento({ inicial, onGuardado, onCancelar }) {
  const [f, setF] = useState(inicial || { nombre: '', fecha: '', hora: '', lugar: '', precio: '', capacidad: '', descripcion: '' });
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function guardar(e) {
    e.preventDefault();
    try { if (inicial && inicial.id) await api.eventos.editar(inicial.id, { ...f, activo: inicial.activo }); else await api.eventos.crear(f); onGuardado(); } catch (err) { setMsg(err.message); }
  }
  return (
    <form onSubmit={guardar} className="card">
      <h3>{inicial && inicial.id ? 'Editar evento' : 'Nuevo evento'}</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="sm:col-span-2">Nombre del evento<input value={f.nombre} onChange={set('nombre')} placeholder="Ej. Noche cultural" required /></label>
        <label>Fecha<input type="date" value={f.fecha || ''} onChange={set('fecha')} /></label>
        <label>Hora<input value={f.hora || ''} onChange={set('hora')} placeholder="6:00 p. m." /></label>
        <label>Lugar<input value={f.lugar || ''} onChange={set('lugar')} /></label>
        <label>Precio del boleto (L.)<input type="number" step="0.01" min="0" value={f.precio} onChange={set('precio')} required /></label>
        <label>Cupo máximo (opcional)<input type="number" min="1" value={f.capacidad || ''} onChange={set('capacidad')} /></label>
        <label className="sm:col-span-2">Descripción (opcional)<textarea rows="2" value={f.descripcion || ''} onChange={set('descripcion')} /></label>
      </div>
      {msg && <p className="text-sm text-red-600 mt-2">{msg}</p>}
      <div className="flex gap-2 mt-3"><button type="submit">Guardar</button><button type="button" className="secondary" onClick={onCancelar}>Cancelar</button></div>
    </form>
  );
}

function Vender({ evento, puedeCobrar, recargar, colegio }) {
  const [f, setF] = useState({ comprador: '', correo: '', telefono: '', cantidad: 1, metodo: 'Efectivo', estado: 'pagado', cortesia: false, enviar_correo: false });
  const [res, setRes] = useState(null);
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  async function vender(e) {
    e.preventDefault(); setMsg(''); setRes(null);
    try { const r = await api.eventos.vender(evento.id, f); setRes(r); recargar(); setF({ ...f, comprador: '', correo: '', telefono: '', cantidad: 1, cortesia: false }); } catch (err) { setMsg(err.message); }
  }
  const total = f.cortesia ? 0 : evento.precio * (Number(f.cantidad) || 0);
  return (
    <div className="card">
      <h3>Vender boletos</h3>
      <form onSubmit={vender} className="grid sm:grid-cols-2 gap-3">
        <label>Nombre del comprador<input value={f.comprador} onChange={set('comprador')} /></label>
        <label>Cantidad<input type="number" min="1" max="100" value={f.cantidad} onChange={set('cantidad')} required /></label>
        <label>Correo (para enviarle el boleto)<input type="email" value={f.correo} onChange={set('correo')} /></label>
        <label>Teléfono<input value={f.telefono} onChange={set('telefono')} /></label>
        <label>Método de pago<select value={f.metodo} onChange={set('metodo')}><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option></select></label>
        <label>Estado<select value={f.estado} onChange={set('estado')}><option value="pagado">Pagado ahora</option><option value="pendiente">Reservado (paga después)</option></select></label>
        <label className="!flex-row items-center gap-2"><input type="checkbox" className="w-auto" checked={f.cortesia} onChange={set('cortesia')} /> Cortesía (sin costo)</label>
        <label className="!flex-row items-center gap-2"><input type="checkbox" className="w-auto" checked={f.enviar_correo} onChange={set('enviar_correo')} disabled={!f.correo} /> Enviar boletos por correo</label>
        <div className="sm:col-span-2 flex items-center gap-3"><button type="submit">Generar boleto(s)</button><span className="text-sm">Total: <strong>{L(total)}</strong></span></div>
      </form>
      {msg && <p className="text-sm text-red-600 mt-2">{msg}</p>}
      {res && (
        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl text-sm">
          <p><strong>{res.boletos.length} boleto(s) generado(s).</strong> Total: {L(res.total)}</p>
          {res.correo && <p className={res.correo.enviado ? 'text-green-700' : 'text-amber-700'}>{res.correo.enviado ? 'Boletos enviados a ' + res.correo.para : 'No se envió el correo: ' + res.correo.motivo}</p>}
          <p className="font-mono text-xs mt-1">{res.boletos.map((b) => b.codigo).join('  ·  ')}</p>
          <button type="button" className="secondary mt-2" onClick={() => imprimir(evento, res.boletos.map((b) => ({ ...b, comprador: f.comprador })), colegio)}>Imprimir boletos</button>
        </div>
      )}
    </div>
  );
}

function Lista({ evento, puedeCobrar, recargar, colegio }) {
  const [filas, setFilas] = useState([]);
  const [q, setQ] = useState(''); const [estado, setEstado] = useState('');
  const [msg, setMsg] = useState('');
  const cargar = () => api.eventos.boletos(evento.id, Object.fromEntries(Object.entries({ q, estado }).filter(([, v]) => v))).then(setFilas).catch((e) => setMsg(e.message));
  useEffect(() => { cargar(); }, [evento.id, estado]);
  const accion = async (fn) => { try { await fn(); await cargar(); recargar(); } catch (e) { setMsg(e.message); } };
  return (
    <div className="card">
      <h3>Boletos vendidos</h3>
      <form onSubmit={(e) => { e.preventDefault(); cargar(); }} className="flex flex-wrap gap-2 mb-3">
        <input className="max-w-xs" placeholder="Buscar nombre, código o correo" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="max-w-[180px]" value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todos</option>{Object.entries(ESTADO).map(([k, [n]]) => <option key={k} value={k}>{n}</option>)}</select>
        <button type="submit">Buscar</button>
        <button type="button" className="secondary" disabled={!filas.length} onClick={() => imprimir(evento, filas.filter((b) => b.estado !== 'anulado'), colegio)}>Imprimir los mostrados</button>
      </form>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <div className="overflow-x-auto">
        <table><thead><tr><th>Código</th><th>Comprador</th><th>Estado</th><th className="text-right">Monto</th><th></th></tr></thead>
          <tbody>
            {filas.map((b) => (
              <tr key={b.id}>
                <td className="font-mono text-xs">{b.codigo}</td><td>{b.comprador || '—'}{b.correo && <div className="text-xs text-gray-500">{b.correo}</div>}</td>
                <td><span className={'badge ' + ESTADO[b.estado][1]}>{ESTADO[b.estado][0]}</span></td><td className="text-right">{L(b.monto)}</td>
                <td className="whitespace-nowrap">
                  {b.estado === 'pendiente' && <button className="secondary" onClick={() => accion(() => api.eventos.pagar(b.id))}>Confirmar pago</button>}{' '}
                  {puedeCobrar && ['pendiente', 'pagado'].includes(b.estado) && <button className="secondary" onClick={() => window.confirm('¿Anular este boleto? Dejará de ser válido y no contará como ingreso.') && accion(() => api.eventos.anular(b.id))}>Anular</button>}
                </td>
              </tr>
            ))}
            {!filas.length && <tr><td colSpan="5" className="text-center text-gray-500 py-6">Sin boletos.</td></tr>}
          </tbody></table>
      </div>
    </div>
  );
}

function Escaner({ evento, recargar }) {
  const [camara, setCamara] = useState(false);
  const [manual, setManual] = useState('');
  const [r, setR] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const input = useRef(null);
  const COL = { aprobado: ['bg-green-600', '✅ APROBADO'], ya_usado: ['bg-amber-500', '⚠️ YA USADO'], pendiente: ['bg-amber-500', '⚠️ SIN PAGAR'], anulado: ['bg-red-600', '❌ ANULADO'], no_existe: ['bg-red-600', '❌ NO VÁLIDO'], otro_evento: ['bg-red-600', '❌ OTRO EVENTO'] };
  async function revisar(codigo) {
    if (ocupado) return; setOcupado(true);
    try {
      const x = await api.eventos.escanear(codigo, evento.id); setR(x); recargar();
      if (navigator.vibrate) navigator.vibrate(x.resultado === 'aprobado' ? 120 : [200, 100, 200]);
    } catch (e) { setR({ resultado: 'no_existe', mensaje: e.message }); }
    setOcupado(false);
  }
  const enviar = (e) => { e.preventDefault(); if (manual.trim()) { revisar(manual.trim()); setManual(''); } };
  return (
    <div className="card">
      <h3>Escanear en la entrada</h3>
      <div className="flex flex-wrap gap-2 mb-3">
        <button onClick={() => setCamara(!camara)}>{camara ? 'Cerrar cámara' : 'Abrir cámara'}</button>
        <form onSubmit={enviar} className="flex gap-2">
          <input ref={input} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Escribe el código o usa un lector" autoFocus />
          <button type="submit" className="secondary">Verificar</button>
        </form>
      </div>
      <EscanerQR activo={camara} onCodigo={revisar} />
      {r && (
        <div className={'mt-3 rounded-2xl text-white p-5 ' + COL[r.resultado][0]}>
          <p className="text-3xl font-bold">{COL[r.resultado][1]}</p>
          <p className="mt-1">{r.mensaje}</p>
          {r.boleto && <p className="mt-2 text-sm opacity-90">{r.boleto.evento} · {r.boleto.comprador || 'Sin nombre'} · <span className="font-mono">{r.boleto.codigo}</span>{r.resultado === 'ya_usado' && r.boleto.usado_en ? ' · ingresó ' + new Date(r.boleto.usado_en).toLocaleString('es-HN') : ''}</p>}
          {r.resultado === 'pendiente' && r.boleto && <button className="mt-3 !bg-white !text-gray-900" onClick={async () => { await api.eventos.pagar(r.boleto.id); revisar(r.boleto.codigo); }}>Cobrar y dar ingreso</button>}
        </div>
      )}
    </div>
  );
}

function Detalle({ evento, puedeCobrar, recargar, volver, colegio }) {
  const [tab, setTab] = useState('escanear');
  const T = [['escanear', 'Escanear'], ['vender', 'Vender'], ['lista', 'Boletos']];
  return (
    <div>
      <button className="secondary mb-3" onClick={volver}>← Eventos</button>
      <div className="card">
        <h2 className="!mb-1">{evento.nombre}</h2>
        <p className="text-sm text-gray-500">{[evento.fecha && fechaTxt(evento.fecha), evento.hora, evento.lugar].filter(Boolean).join(' · ')} · Boleto {L(evento.precio)}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-center">
          <div><p className="text-2xl font-semibold">{evento.vendidos}{evento.capacidad ? ' / ' + evento.capacidad : ''}</p><p className="text-xs text-gray-500">Vendidos</p></div>
          <div><p className="text-2xl font-semibold">{evento.ingresaron}</p><p className="text-xs text-gray-500">Ya ingresaron</p></div>
          <div><p className="text-2xl font-semibold">{evento.pendientes}</p><p className="text-xs text-gray-500">Sin pagar</p></div>
          <div><p className="text-2xl font-semibold text-green-700">{L(evento.recaudado)}</p><p className="text-xs text-gray-500">Recaudado</p></div>
        </div>
      </div>
      <div className="flex gap-2 mb-3">{T.map(([k, n]) => <button key={k} className={tab === k ? '' : 'secondary'} onClick={() => setTab(k)}>{n}</button>)}</div>
      {tab === 'escanear' && <Escaner evento={evento} recargar={recargar} />}
      {tab === 'vender' && <Vender evento={evento} puedeCobrar={puedeCobrar} recargar={recargar} colegio={colegio} />}
      {tab === 'lista' && <Lista evento={evento} puedeCobrar={puedeCobrar} recargar={recargar} colegio={colegio} />}
    </div>
  );
}

export default function Eventos({ ctx }) {
  const usuario = obtenerUsuario();
  const puedeCobrar = usuario && ['admin', 'director', 'superadmin'].includes(usuario.rol);
  const [lista, setLista] = useState([]);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');
  const cargar = () => api.eventos.listar().then((l) => { setLista(l); setSel((s) => (s ? l.find((x) => x.id === s.id) || null : s)); }).catch((e) => setMsg(e.message));
  useEffect(() => { cargar(); }, []);
  const colegio = ctx && ctx.colegio.nombre;
  if (sel) return <Detalle evento={sel} puedeCobrar={puedeCobrar} recargar={cargar} volver={() => setSel(null)} colegio={colegio} />;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="!mb-0">Eventos y boletos</h2>
        {puedeCobrar && <button onClick={() => setForm({})}>+ Nuevo evento</button>}
      </div>
      <p className="text-sm text-gray-500 mb-3">Crea un evento con precio, vende boletos con código QR y escanéalos en la entrada: el sistema te dice si cada boleto está aprobado. Lo recaudado se suma solo a las finanzas.</p>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      {form && <FormEvento inicial={form.id ? form : null} onGuardado={() => { setForm(null); cargar(); }} onCancelar={() => setForm(null)} />}
      <div className="grid md:grid-cols-2 gap-3">
        {lista.map((e) => (
          <div key={e.id} className={'card ' + (e.activo ? '' : 'opacity-60')}>
            <div className="flex justify-between gap-2"><h3 className="!mb-0">{e.nombre}</h3>{!e.activo && <span className="badge">Cerrado</span>}</div>
            <p className="text-sm text-gray-500">{[e.fecha && fechaTxt(e.fecha), e.hora, e.lugar].filter(Boolean).join(' · ') || 'Sin fecha'}</p>
            <p className="text-sm mt-1">Boleto {L(e.precio)} · {e.vendidos}{e.capacidad ? '/' + e.capacidad : ''} vendidos · {e.ingresaron} ingresaron · <strong>{L(e.recaudado)}</strong></p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setSel(e)}>Abrir</button>
              {puedeCobrar && <button className="secondary" onClick={() => setForm(e)}>Editar</button>}
              {puedeCobrar && <button className="secondary" onClick={async () => { await api.eventos.editar(e.id, { ...e, activo: !e.activo }); cargar(); }}>{e.activo ? 'Cerrar' : 'Reabrir'}</button>}
              {puedeCobrar && e.vendidos === 0 && e.pendientes === 0 && <button className="secondary" onClick={async () => { if (window.confirm('¿Eliminar este evento?')) { try { await api.eventos.borrar(e.id); cargar(); } catch (x) { setMsg(x.message); } } }}>Eliminar</button>}
            </div>
          </div>
        ))}
        {!lista.length && <p className="text-gray-500">Aún no hay eventos.</p>}
      </div>
    </div>
  );
}

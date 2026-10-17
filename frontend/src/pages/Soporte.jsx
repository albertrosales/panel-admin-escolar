import { useEffect, useState } from 'react';
import { api } from '../api';

const ESTADO = { abierto: ['Abierto', 'badge-amarillo'], en_proceso: ['En proceso', 'badge-amarillo'], resuelto: ['Resuelto', 'badge-verde'], cerrado: ['Cerrado', ''] };
const PRIO = { baja: 'Baja', normal: 'Normal', alta: 'Alta' };
const fh = (d) => new Date(d).toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' });

function Hilo({ id, esProveedor, onCambio }) {
  const [t, setT] = useState(null);
  const [txt, setTxt] = useState('');
  const [msg, setMsg] = useState('');
  const cargar = () => api.soporte.ver(id).then(setT).catch((e) => setMsg(e.message));
  useEffect(() => { cargar(); }, [id]);
  if (!t) return <p className="text-sm text-gray-500">{msg || 'Cargando...'}</p>;
  async function enviar(e) {
    e.preventDefault(); setMsg('');
    try { await api.soporte.responder(id, txt); setTxt(''); cargar(); onCambio(); } catch (err) { setMsg(err.message); }
  }
  async function estado(v) { try { await api.soporte.estado(id, v); cargar(); onCambio(); } catch (err) { setMsg(err.message); } }
  return (
    <div className="mt-3 border border-gray-200 rounded-xl p-4 bg-gray-50">
      <p className="text-xs text-gray-500 mb-3">{t.colegio} · {t.usuario} · {t.categoria} · prioridad {PRIO[t.prioridad]}</p>
      <div className="flex flex-col gap-2 mb-3">
        {t.mensajes.map((m, i) => (
          <div key={i} className={'rounded-lg px-3 py-2 text-sm max-w-[85%] ' + (m.autor_tipo === 'proveedor' ? 'bg-blue-50 self-end' : 'bg-white border border-gray-200 self-start')}>
            <p className="whitespace-pre-line">{m.mensaje}</p>
            <p className="text-[11px] text-gray-400 mt-1">{m.autor_tipo === 'proveedor' ? 'Soporte' : m.autor} · {fh(m.creado_en)}</p>
          </div>
        ))}
      </div>
      {t.estado !== 'cerrado' && (
        <form onSubmit={enviar} className="flex flex-col gap-2">
          <textarea rows="3" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Escribe tu respuesta..." required />
          <div className="flex flex-wrap gap-2">
            <button type="submit">Responder</button>
            {esProveedor && t.estado !== 'resuelto' && <button type="button" className="secondary" onClick={() => estado('resuelto')}>Marcar resuelto</button>}
            <button type="button" className="secondary" onClick={() => estado('cerrado')}>Cerrar consulta</button>
          </div>
        </form>
      )}
      {msg && <p className="text-sm text-red-600 mt-2">{msg}</p>}
    </div>
  );
}

export default function Soporte({ esProveedor }) {
  const [lista, setLista] = useState([]);
  const [abierto, setAbierto] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [f, setF] = useState({ asunto: '', categoria: 'consulta', prioridad: 'normal', mensaje: '' });
  const [msg, setMsg] = useState('');
  const cargar = () => api.soporte.listar().then(setLista).catch((e) => setMsg(e.message));
  useEffect(() => { cargar(); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function crear(e) {
    e.preventDefault(); setMsg('');
    try { const t = await api.soporte.crear(f); setNuevo(false); setF({ asunto: '', categoria: 'consulta', prioridad: 'normal', mensaje: '' }); await cargar(); setAbierto(t.id); } catch (err) { setMsg(err.message); }
  }
  return (
    <div>
      <h2>Centro de soporte</h2>
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="!mb-0">{esProveedor ? 'Consultas de los colegios' : 'Mis consultas'}</h3>
          {!nuevo && !esProveedor && <button onClick={() => setNuevo(true)}>Nueva consulta</button>}
        </div>
        {nuevo && (
          <form onSubmit={crear} className="flex flex-col gap-3 border border-gray-200 rounded-xl p-4 mb-4">
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="sm:col-span-1">Asunto<input value={f.asunto} onChange={set('asunto')} required maxLength={200} /></label>
              <label>Tipo<select value={f.categoria} onChange={set('categoria')}><option value="consulta">Consulta</option><option value="problema">Problema</option><option value="solicitud">Solicitud</option></select></label>
              <label>Prioridad<select value={f.prioridad} onChange={set('prioridad')}><option value="baja">Baja</option><option value="normal">Normal</option><option value="alta">Alta</option></select></label>
            </div>
            <label>Cuéntanos qué pasa<textarea rows="4" value={f.mensaje} onChange={set('mensaje')} required /></label>
            <div className="flex gap-2"><button type="submit">Enviar</button><button type="button" className="secondary" onClick={() => setNuevo(false)}>Cancelar</button></div>
          </form>
        )}
        {msg && <p className="text-sm text-red-600 mb-2">{msg}</p>}
        <div className="flex flex-col divide-y divide-gray-100">
          {lista.map((t) => {
            const [n, cls] = ESTADO[t.estado] || [t.estado, ''];
            return (
              <div key={t.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><b className="text-sm">#{t.id} · {t.asunto}</b>
                    <p className="text-xs text-gray-500">{esProveedor ? t.colegio + ' · ' : ''}{fh(t.actualizado_en)} · {t.mensajes} mensaje(s)</p></div>
                  <div className="flex items-center gap-2"><span className={'badge ' + cls}>{n}</span>
                    <button className="secondary" onClick={() => setAbierto(abierto === t.id ? null : t.id)}>{abierto === t.id ? 'Cerrar' : 'Abrir'}</button></div>
                </div>
                {abierto === t.id && <Hilo id={t.id} esProveedor={esProveedor} onCambio={cargar} />}
              </div>
            );
          })}
          {lista.length === 0 && <p className="text-sm text-gray-500">Aún no hay consultas.</p>}
        </div>
      </div>
    </div>
  );
}

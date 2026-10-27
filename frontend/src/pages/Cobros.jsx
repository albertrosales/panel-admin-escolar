import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Cargando } from '../components/UI';

const L = (n) => 'L. ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (f) => (f ? new Date(f).toLocaleDateString('es-HN') : '—');

export default function Cobros() {
  const [filas, setFilas] = useState(null);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [sel, setSel] = useState(new Set());
  const [plantilla, setPlantilla] = useState('mensualidad_vencida');
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargar = () => api.cobros.pendientes().then(setFilas).catch((e) => { setFilas([]); setMsg(e.message); });
  useEffect(() => { cargar(); }, []);

  const vista = useMemo(() => (filas || []).filter((a) =>
    (filtro === 'todos' || (filtro === 'vencidos' ? a.vencido : !a.vencido)) &&
    (!q || (a.nombre_completo + ' ' + (a.codigo || '') + ' ' + (a.nombre_encargado || '')).toLowerCase().includes(q.toLowerCase()))), [filas, q, filtro]);

  if (!filas) return <Cargando tarjetas={2} />;
  const seleccionables = vista.filter((a) => a.correo_encargado);
  const todos = seleccionables.length > 0 && seleccionables.every((a) => sel.has(a.id));
  const elegidos = filas.filter((a) => sel.has(a.id));
  const total = elegidos.reduce((t, a) => t + a.total, 0);
  const alternar = (id) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const marcarTodos = () => setSel(todos ? new Set([...sel].filter((id) => !seleccionables.some((a) => a.id === id))) : new Set([...sel, ...seleccionables.map((a) => a.id)]));

  async function enviar() {
    if (!window.confirm(`¿Enviar el recordatorio por correo a ${elegidos.length} encargado(s)?`)) return;
    setEnviando(true); setMsg('');
    try {
      const r = await api.cobros.recordar([...sel], plantilla);
      setMsg(`Recordatorios en cola: ${r.en_cola}` + (r.sin_correo ? ` · ${r.sin_correo} sin correo` : '') + '. Se envían en unos segundos.');
      setSel(new Set()); cargar();
    } catch (e) { setMsg(e.message); }
    setEnviando(false);
  }

  const vencidos = filas.filter((a) => a.vencido).length;
  return (
    <div>
      <h2>Cobros pendientes</h2>
      <div className="stats-row">
        <div className="card stat-box"><div className="num">{filas.length}</div><div className="label">Alumnos con pagos pendientes</div></div>
        <div className="card stat-box"><div className="num text-red-600">{vencidos}</div><div className="label">Con pagos vencidos</div></div>
        <div className="card stat-box"><div className="num text-red-600">{L(filas.reduce((t, a) => t + a.total, 0))}</div><div className="label">Total por cobrar</div></div>
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <input className="max-w-xs" placeholder="Buscar alumno, código o encargado" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="max-w-[190px]" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="todos">Todos</option><option value="vencidos">Solo vencidos</option><option value="por_vencer">Aún no vencen</option>
          </select>
        </div>

        {sel.size > 0 && (
          <div className="barra-seleccion">
            <span><b>{sel.size}</b> seleccionado(s) · {L(total)}</span>
            <select className="max-w-[260px]" value={plantilla} onChange={(e) => setPlantilla(e.target.value)}>
              <option value="mensualidad_vencida">Aviso de mensualidad vencida</option>
              <option value="recordatorio_vencimiento">Recordatorio de próximo vencimiento</option>
            </select>
            <button onClick={enviar} disabled={enviando}>Enviar recordatorio por correo</button>
            <button className="secondary" onClick={() => setSel(new Set())}>Quitar selección</button>
          </div>
        )}
        {msg && <p className="text-sm text-gray-600 mb-2">{msg}</p>}

        <div className="overflow-x-auto">
          <table>
            <thead><tr>
              <th className="w-8"><input type="checkbox" className="w-auto" checked={todos} onChange={marcarTodos} aria-label="Seleccionar todos" /></th>
              <th>Alumno</th><th>Encargado</th><th>Pagos</th><th className="text-right">Debe</th><th>Más antiguo</th><th>Estado</th>
            </tr></thead>
            <tbody>
              {vista.map((a) => (
                <tr key={a.id}>
                  <td><input type="checkbox" className="w-auto" disabled={!a.correo_encargado} checked={sel.has(a.id)} onChange={() => alternar(a.id)} title={a.correo_encargado ? '' : 'Sin correo del encargado'} /></td>
                  <td><Link to={'/alumnos/' + a.id}>{a.nombre_completo}</Link><div className="text-xs text-gray-500">Código {a.codigo}</div></td>
                  <td>{a.nombre_encargado || '—'}<div className="text-xs text-gray-500">{a.correo_encargado || <span className="text-red-600">Sin correo</span>}</div></td>
                  <td>{a.pagos}</td>
                  <td className="text-right font-semibold">{L(a.total)}</td>
                  <td>{fecha(a.mas_antiguo)}</td>
                  <td>
                    {a.vencido ? <span className="badge badge-rojo">Vencido</span> : <span className="badge badge-amarillo">Por vencer</span>}
                    {a.en_validacion && <div className="text-xs text-blue-600 mt-1">Comprobante en revisión</div>}
                    {a.ultimo_aviso && <div className="text-xs text-gray-400 mt-1">Último aviso {fecha(a.ultimo_aviso)}</div>}
                  </td>
                </tr>
              ))}
              {!vista.length && <tr><td colSpan="7" className="text-center text-gray-500 py-6">{filas.length ? 'Sin resultados.' : 'No hay pagos pendientes. ¡Todo al día!'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

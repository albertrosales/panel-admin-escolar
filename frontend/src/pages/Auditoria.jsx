import { useEffect, useState } from 'react';
import { api } from '../api';

const fh = (d) => new Date(d).toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'medium' });
const ENTIDADES = ['alumnos', 'profesores', 'grados', 'pagos', 'gastos', 'ingresos', 'eventos', 'comprobantes', 'conciliacion', 'matriculas', 'asistencia', 'correos', 'admin', 'colegio', 'auth', 'soporte'];

export default function Auditoria() {
  const [f, setF] = useState({ desde: '', hasta: '', usuario: '', entidad: '', q: '' });
  const [datos, setDatos] = useState({ total: 0, filas: [] });
  const [pag, setPag] = useState(0);
  const [ver, setVer] = useState(null);
  const [msg, setMsg] = useState('');
  const LIM = 50;
  const cargar = (p = pag) => api.auditoria({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), limite: LIM, offset: p * LIM }).then((d) => { setDatos(d); setMsg(''); }).catch((e) => setMsg(e.message));
  useEffect(() => { cargar(0); setPag(0); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const buscar = (e) => { e.preventDefault(); setPag(0); cargar(0); };
  const ir = (p) => { setPag(p); cargar(p); };

  return (
    <div>
      <h2>Registro de auditoría</h2>
      <form onSubmit={buscar} className="card flex flex-wrap items-end gap-3">
        <label>Desde<input type="date" value={f.desde} onChange={set('desde')} /></label>
        <label>Hasta<input type="date" value={f.hasta} onChange={set('hasta')} /></label>
        <label>Usuario<input value={f.usuario} onChange={set('usuario')} placeholder="correo" /></label>
        <label>Sección<select value={f.entidad} onChange={set('entidad')}><option value="">Todas</option>{ENTIDADES.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
        <label>Buscar<input value={f.q} onChange={set('q')} placeholder="texto o dato" /></label>
        <button type="submit">Filtrar</button>
      </form>
      <div className="card">
        {msg && <p className="text-sm text-red-600 mb-2">{msg}</p>}
        <p className="text-xs text-gray-500 mb-2">{datos.total} registro(s). Se guarda cada cambio con quién lo hizo y cuándo.</p>
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Sección</th><th></th></tr></thead>
            <tbody>
              {datos.filas.map((r) => (
                <>
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{fh(r.creado_en)}</td>
                    <td>{r.usuario || '—'}{r.soporte && <span className="badge badge-amarillo ml-1">soporte</span>}<span className="block text-xs text-gray-400">{r.rol}</span></td>
                    <td>{r.accion}<span className="block text-xs text-gray-400">{r.ruta}</span></td>
                    <td>{r.entidad}{r.entidad_id ? ' #' + r.entidad_id : ''}</td>
                    <td>{r.detalle && <button className="secondary" onClick={() => setVer(ver === r.id ? null : r.id)}>{ver === r.id ? 'Ocultar' : 'Detalle'}</button>}</td>
                  </tr>
                  {ver === r.id && <tr key={r.id + 'd'}><td colSpan={5}><pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap break-all">{JSON.stringify(r.detalle, null, 2)}</pre><p className="text-[11px] text-gray-400 mt-1">IP {r.ip || '—'}</p></td></tr>}
                </>
              ))}
              {datos.filas.length === 0 && <tr><td colSpan={5} className="text-gray-500">Sin registros.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 mt-3">
          <button className="secondary" disabled={pag === 0} onClick={() => ir(pag - 1)}>Anterior</button>
          <button className="secondary" disabled={(pag + 1) * LIM >= datos.total} onClick={() => ir(pag + 1)}>Siguiente</button>
        </div>
      </div>
    </div>
  );
}

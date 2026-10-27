import { useEffect, useState } from 'react';
import { Printer, Mail } from 'lucide-react';
import { api, abrirRecibosPDF } from '../api';
import { Cargando } from '../components/UI';

const L = (n) => 'L. ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (f) => (f ? new Date(f).toLocaleDateString('es-HN') : '—');
const hoy = () => new Date().toISOString().slice(0, 10);
const haceDias = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

export default function Recibos() {
  const [filas, setFilas] = useState(null);
  const [q, setQ] = useState('');
  const [desde, setDesde] = useState(haceDias(30));
  const [hasta, setHasta] = useState(hoy());
  const [sel, setSel] = useState(new Set());
  const [msg, setMsg] = useState('');

  const cargar = () => api.recibos.listar({ q, desde, hasta }).then((r) => { setFilas(r); setSel(new Set()); }).catch((e) => { setFilas([]); setMsg(e.message); });
  useEffect(() => { cargar(); }, []);
  if (!filas) return <Cargando tarjetas={2} />;

  const todos = filas.length > 0 && filas.every((f) => sel.has(f.id));
  const alternar = (id) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const ids = (uno) => (uno ? [uno] : [...sel]);
  async function imprimir(uno) { setMsg(''); try { await abrirRecibosPDF(ids(uno)); } catch (e) { setMsg(e.message); } }
  async function enviar(uno) {
    setMsg('');
    try {
      const r = await api.recibos.enviar(ids(uno));
      setMsg(`Enviados: ${r.enviados}` + (r.fallos.length ? ' · No se pudo: ' + r.fallos.join('; ') : ''));
    } catch (e) { setMsg(e.message); }
  }

  return (
    <div>
      <h2>Recibos de pago</h2>
      <div className="card">
        <p className="text-sm text-gray-500 mb-3">Cada pago registrado tiene su recibo. Al imprimir varios, salen <b>2 recibos por hoja tamaño carta</b>. Al confirmar un pago, el recibo también se envía solo al correo del encargado (en PDF).</p>
        <form onSubmit={(e) => { e.preventDefault(); cargar(); }} className="flex flex-wrap gap-2 items-end mb-3">
          <label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
          <label>Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
          <label>Alumno o código<input className="max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" /></label>
          <button type="submit">Buscar</button>
        </form>

        {sel.size > 0 && (
          <div className="barra-seleccion">
            <span><b>{sel.size}</b> seleccionado(s)</span>
            <button onClick={() => imprimir()} className="inline-flex items-center gap-2"><Printer size={15} /> Imprimir (2 por hoja)</button>
            <button className="secondary inline-flex items-center gap-2" onClick={() => enviar()}><Mail size={15} /> Enviar por correo</button>
            <button className="secondary" onClick={() => setSel(new Set())}>Quitar selección</button>
          </div>
        )}
        {msg && <p className="text-sm text-gray-600 mb-2">{msg}</p>}

        <div className="overflow-x-auto">
          <table>
            <thead><tr>
              <th className="w-8"><input type="checkbox" className="w-auto" checked={todos} onChange={() => setSel(todos ? new Set() : new Set(filas.map((f) => f.id)))} aria-label="Seleccionar todos" /></th>
              <th>Recibo</th><th>Alumno</th><th>Periodo</th><th>Fecha</th><th>Forma</th><th className="text-right">Monto</th><th></th>
            </tr></thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td><input type="checkbox" className="w-auto" checked={sel.has(f.id)} onChange={() => alternar(f.id)} /></td>
                  <td className="font-mono text-xs">{f.numero}</td>
                  <td>{f.nombre_completo}<div className="text-xs text-gray-500">Código {f.codigo}</div></td>
                  <td>{f.periodo}</td><td>{fecha(f.fecha_pago)}</td><td>{f.metodo_pago || '—'}</td>
                  <td className="text-right font-semibold">{L(f.monto)}</td>
                  <td className="whitespace-nowrap">
                    <button className="secondary" onClick={() => imprimir(f.id)}>Imprimir</button>{' '}
                    <button className="secondary" onClick={() => enviar(f.id)} disabled={!f.correo_encargado} title={f.correo_encargado ? '' : 'Sin correo del encargado'}>Enviar</button>
                  </td>
                </tr>
              ))}
              {!filas.length && <tr><td colSpan="8" className="text-center text-gray-500 py-6">No hay pagos en ese rango.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

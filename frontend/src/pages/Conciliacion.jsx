import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

function leer(file) {
  return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(file); });
}

export default function Conciliacion() {
  const [res, setRes] = useState(null);
  const [sin, setSin] = useState([]);
  const [msg, setMsg] = useState('');
  const [cargando, setCargando] = useState(false);
  const ref = useRef();
  const cargar = () => api.conciliacion.sinAsignar().then(setSin).catch(() => {});
  useEffect(() => { cargar(); }, []);

  async function subir(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setCargando(true); setMsg('Leyendo el estado de cuenta... puede tardar un minuto.'); setRes(null);
    try { setRes(await api.conciliacion.subir(await leer(f), f.name)); setMsg(''); cargar(); }
    catch (err) { setMsg('Error: ' + err.message); }
    setCargando(false); ref.current.value = '';
  }

  return (
    <div>
      <h2>Estado de cuenta</h2>
      <div className="card">
        <h3>Confirmar pagos con el estado de cuenta</h3>
        <p className="text-sm text-gray-500 mb-3">
          Sube el estado de cuenta del banco (PDF, Excel o CSV). El sistema busca los depósitos y confirma solo los comprobantes
          que coinciden por referencia, o por monto y fecha cuando el cruce es único. Lo que no coincida queda para tu revisión.
        </p>
        <input ref={ref} type="file" accept=".pdf,.csv,.xlsx,.xls,.txt" onChange={subir} disabled={cargando} className="w-auto" />
        {msg && <p className="text-sm text-gray-500 mt-2">{msg}</p>}
        {res && (
          <div className="text-sm mt-3">
            <p>Depósitos leídos: <b>{res.leidos}</b> ({res.nuevos} nuevos, {res.repetidos} ya importados)</p>
            <p>Pagos confirmados automáticamente: <b>{res.confirmados.length}</b></p>
            <p>Comprobantes que siguen pendientes de validación: <b>{res.siguen_pendientes}</b></p>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Depósitos del banco sin comprobante</h3>
        {sin.length === 0 ? <p className="text-sm text-gray-500">No hay depósitos sin asignar.</p> : (
          <table>
            <thead><tr><th>Fecha</th><th>Referencia</th><th>Monto</th><th>Detalle</th></tr></thead>
            <tbody>
              {sin.map((m) => (
                <tr key={m.id}>
                  <td>{m.fecha ? new Date(m.fecha).toLocaleDateString('es-HN', { timeZone: 'UTC' }) : '—'}</td>
                  <td>{m.referencia || '—'}</td>
                  <td>L. {Number(m.monto).toFixed(2)}</td>
                  <td>{m.descripcion || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

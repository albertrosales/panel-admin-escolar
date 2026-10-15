import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

function leer(file) {
  return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(file); });
}

export default function Conciliacion() {
  const [res, setRes] = useState(null);
  const [msg, setMsg] = useState('');
  const [cargando, setCargando] = useState(false);
  const [cuentas, setCuentas] = useState([]);
  const [cuenta, setCuenta] = useState('');
  const ref = useRef();

  useEffect(() => {
    api.admin.cuentas().then((r) => setCuentas(String(r.cuentas_destino || '').split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean))).catch(() => {});
  }, []);

  async function subir(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setCargando(true); setMsg('Leyendo el estado de cuenta...'); setRes(null);
    try { setRes(await api.conciliacion.subir(await leer(f), f.name, cuenta)); setMsg(''); }
    catch (err) { setMsg('Error: ' + err.message); }
    setCargando(false); ref.current.value = '';
  }

  return (
    <div>
      <h2>Estado de cuenta</h2>
      <div className="card">
        <h3>Confirmar pagos con el estado de cuenta</h3>
        <p className="text-sm text-gray-500 mb-3">
          Sube el estado de cuenta (PDF, Excel o CSV) de la cuenta donde se recibieron los pagos. El sistema solo busca los depósitos
          que correspondan a comprobantes pendientes; el resto de movimientos (por ejemplo, gastos personales) se descarta y no se guarda.
        </p>
        {cuentas.length > 0 && (
          <label className="mb-3 max-w-xs">¿De qué cuenta es este estado?
            <select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
              <option value="">No indicar</option>
              {cuentas.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
        <input ref={ref} type="file" accept=".pdf,.csv,.xlsx,.xls,.txt" onChange={subir} disabled={cargando} className="w-auto" />
        {msg && <p className="text-sm text-gray-500 mt-2">{msg}</p>}
        {res && (
          <div className="text-sm mt-3 flex flex-col gap-1">
            <p>Depósitos leídos en el archivo: <b>{res.leidos}</b></p>
            <p>Pagos confirmados automáticamente: <b>{res.confirmados}</b></p>
            <p>Con depósito probable (revísalos en Comprobantes): <b>{res.probables}</b></p>
            <p>Comprobantes que siguen pendientes de validación: <b>{res.siguen_pendientes}</b></p>
            {res.detalle && res.detalle.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-gray-600">
                {res.detalle.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api';
import Gastos from './Gastos';
import Ingresos from './Ingresos';

const L = (n) => 'L. ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hoy = () => new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesTxt = (m) => MESES[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);

function Resumen() {
  const [f, setF] = useState({ desde: hoy().slice(0, 8) + '01', hasta: '' });
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState('');
  const cargar = (x = f) => api.finanzas.resumen(Object.fromEntries(Object.entries(x).filter(([, v]) => v))).then(setD).catch((e) => setMsg(e.message));
  useEffect(() => { cargar(); }, []);
  const atajo = (tipo) => {
    const h = new Date(Date.now() - 6 * 3600e3); const y = h.getUTCFullYear(), m = h.getUTCMonth();
    const x = tipo === 'mes' ? { desde: hoy().slice(0, 8) + '01', hasta: '' } : tipo === 'anio' ? { desde: y + '-01-01', hasta: '' } : { desde: '', hasta: '' };
    setF(x); cargar(x);
  };
  const Fila = ({ n, v, sub, neg }) => <div className="flex justify-between py-1 text-sm"><span>{n}{sub && <span className="text-gray-400"> · {sub}</span>}</span><span className={neg ? 'text-red-600' : ''}>{neg ? '− ' : ''}{L(v)}</span></div>;
  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); cargar(); }} className="card flex flex-wrap items-end gap-3">
        <label>Desde<input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></label>
        <label>Hasta<input type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></label>
        <button type="submit">Ver</button>
        <button type="button" className="secondary" onClick={() => atajo('mes')}>Este mes</button>
        <button type="button" className="secondary" onClick={() => atajo('anio')}>Este año</button>
        <button type="button" className="secondary" onClick={() => atajo('todo')}>Todo</button>
      </form>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      {d && (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="card"><p className="text-sm text-gray-500">Ingresos totales</p><p className="text-2xl font-semibold text-green-700">{L(d.ingresos.total)}</p></div>
            <div className="card"><p className="text-sm text-gray-500">Gastos</p><p className="text-2xl font-semibold text-red-600">{L(d.gastos.total)}</p></div>
            <div className="card"><p className="text-sm text-gray-500">Balance</p><p className={'text-2xl font-semibold ' + (d.balance < 0 ? 'text-red-600' : '')}>{L(d.balance)}</p></div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="card">
              <h3>De dónde entra el dinero</h3>
              <Fila n="Pagos de alumnos (mensualidades)" v={d.ingresos.pagos_alumnos.total} sub={d.ingresos.pagos_alumnos.cantidad + ' pago(s)'} />
              <Fila n="Eventos y boletos" v={d.ingresos.eventos.total} />
              {d.ingresos.eventos.detalle.map((e) => <div key={e.evento} className="pl-4 text-xs text-gray-500 flex justify-between"><span>{e.evento} ({e.cantidad})</span><span>{L(e.total)}</span></div>)}
              <Fila n="Otros ingresos" v={d.ingresos.otros.total} />
              {d.ingresos.otros.detalle.map((e) => <div key={e.categoria} className="pl-4 text-xs text-gray-500 flex justify-between"><span>{e.categoria}</span><span>{L(e.total)}</span></div>)}
              <div className="border-t border-gray-200 mt-2 pt-2 font-semibold flex justify-between"><span>Total</span><span>{L(d.ingresos.total)}</span></div>
            </div>
            <div className="card">
              <h3>En qué se gasta</h3>
              {d.gastos.detalle.length === 0 && <p className="text-sm text-gray-500">Sin gastos en este período.</p>}
              {d.gastos.detalle.map((g) => <Fila key={g.categoria} n={g.categoria} v={g.total} neg />)}
              {d.gastos.detalle.length > 0 && <div className="border-t border-gray-200 mt-2 pt-2 font-semibold flex justify-between"><span>Total</span><span>{L(d.gastos.total)}</span></div>}
            </div>
          </div>
          {d.meses.length > 0 && (
            <div className="card overflow-x-auto">
              <h3>Por mes</h3>
              <table><thead><tr><th>Mes</th><th className="text-right">Ingresos</th><th className="text-right">Gastos</th><th className="text-right">Balance</th></tr></thead>
                <tbody>{d.meses.map((m) => <tr key={m.mes}><td>{mesTxt(m.mes)}</td><td className="text-right">{L(m.ingresos)}</td><td className="text-right">{L(m.gastos)}</td><td className={'text-right ' + (m.ingresos - m.gastos < 0 ? 'text-red-600' : '')}>{L(m.ingresos - m.gastos)}</td></tr>)}</tbody></table>
            </div>
          )}
          <p className="text-xs text-gray-500">Los pagos de alumnos se toman de las mensualidades marcadas como pagadas; los boletos, de los vendidos y pagados (no cuentan los anulados ni los pendientes).</p>
        </>
      )}
    </div>
  );
}

export default function Finanzas() {
  const [tab, setTab] = useState('resumen');
  const T = [['resumen', 'Resumen'], ['ingresos', 'Otros ingresos'], ['gastos', 'Gastos']];
  return (
    <div>
      <h2>Finanzas</h2>
      <div className="flex gap-2 mb-4">{T.map(([k, n]) => <button key={k} className={tab === k ? '' : 'secondary'} onClick={() => setTab(k)}>{n}</button>)}</div>
      {tab === 'resumen' && <Resumen />}
      {tab === 'ingresos' && <Ingresos />}
      {tab === 'gastos' && <Gastos />}
    </div>
  );
}

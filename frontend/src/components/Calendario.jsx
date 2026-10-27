import { useEffect, useState } from 'react';
import { Esqueleto } from './UI';
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { api } from '../api';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const pad = (n) => String(n).padStart(2, '0');
const key = (y, m, d) => y + '-' + pad(m + 1) + '-' + pad(d);

export default function Calendario({ onClose }) {
  const t = new Date();
  const hoyKey = key(t.getFullYear(), t.getMonth(), t.getDate());
  const [y, setY] = useState(t.getFullYear());
  const [m, setM] = useState(t.getMonth());
  const [sel, setSel] = useState(hoyKey);
  const [mes, setMes] = useState({ dias: {}, dia_pago: 5 });
  const [det, setDet] = useState(null);
  const [crear, setCrear] = useState(false);
  const [f, setF] = useState({ titulo: '', tipo: 'evento', descripcion: '' });

  const cargarMes = () => api.calendario.mes(y + '-' + pad(m + 1)).then(setMes).catch(() => {});
  const cargarDia = () => api.calendario.dia(sel).then(setDet).catch(() => setDet(null));
  useEffect(() => { cargarMes(); }, [y, m]);
  useEffect(() => { cargarDia(); }, [sel]);

  function mover(delta) {
    const d = new Date(y, m + delta, 1);
    setY(d.getFullYear()); setM(d.getMonth());
  }

  async function guardar(e) {
    e.preventDefault();
    await api.calendario.crear({ ...f, fecha: sel });
    setF({ titulo: '', tipo: 'evento', descripcion: '' });
    setCrear(false);
    cargarMes(); cargarDia();
  }

  async function borrar(id) {
    await api.calendario.borrar(id);
    cargarMes(); cargarDia();
  }

  const primero = new Date(y, m, 1).getDay();
  const total = new Date(y, m + 1, 0).getDate();
  const celdas = [...Array(primero).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  const [sy, sm, sd] = sel.split('-').map(Number);
  const fechaSel = new Date(sy, sm - 1, sd);
  const diaPago = Math.min(mes.dia_pago || 5, total);

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden w-full">
      <div className="bg-red-600 text-white p-5 flex items-start justify-between">
        <div>
          <div className="text-6xl font-bold leading-none">{sd}</div>
          <div className="text-lg mt-1">{DIAS[fechaSel.getDay()]}</div>
          <div className="text-sm opacity-80">{MESES[sm - 1]} {sy}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar calendario" className="!bg-white/20 hover:!bg-white/30 !p-1.5 !rounded-full"><X size={16} /></button>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <button type="button" className="secondary !p-1.5" onClick={() => mover(-1)} aria-label="Mes anterior"><ChevronLeft size={16} /></button>
          <b className="text-sm">{MESES[m]} {y}</b>
          <button type="button" className="secondary !p-1.5" onClick={() => mover(1)} aria-label="Mes siguiente"><ChevronRight size={16} /></button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] text-gray-400 mb-1">
          {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
          {celdas.map((d, i) => {
            if (!d) return <span key={i} />;
            const k = key(y, m, d);
            const info = mes.dias[k] || {};
            const esSel = k === sel;
            return (
              <button key={i} type="button" onClick={() => setSel(k)}
                className={'!p-0 h-9 !rounded-lg relative flex flex-col items-center justify-center ' +
                  (esSel ? '!bg-red-600 !text-white' : k === hoyKey ? '!bg-red-50 !text-red-600 font-bold' : '!bg-transparent !text-gray-700 hover:!bg-gray-100')}>
                {d}
                <span className="flex gap-0.5 absolute bottom-0.5">
                  {info.eventos && <i className={'w-1 h-1 rounded-full ' + (esSel ? 'bg-white' : 'bg-red-500')} />}
                  {(d === diaPago || info.vencimientos) && <i className={'w-1 h-1 rounded-full ' + (esSel ? 'bg-white' : 'bg-emerald-500')} />}
                  {info.actividad && <i className={'w-1 h-1 rounded-full ' + (esSel ? 'bg-white' : 'bg-blue-500')} />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-3 text-[11px] text-gray-400 mt-3">
          <span><i className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1" />Evento</span>
          <span><i className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />Cobros</span>
          <span><i className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1" />Actividad</span>
        </div>

        <div className="mt-4 border-t border-gray-100 pt-3 max-h-72 overflow-y-auto text-sm">
          <div className="flex items-center justify-between mb-2">
            <b>Este día</b>
            <button type="button" className="!p-1.5 !rounded-full" onClick={() => setCrear(!crear)} aria-label="Crear evento"><Plus size={14} /></button>
          </div>

          {crear && (
            <form onSubmit={guardar} className="flex flex-col gap-2 mb-3 bg-gray-50 p-3 rounded-xl">
              <input required placeholder="Título" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
              <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
                <option value="evento">Evento</option>
                <option value="recordatorio">Recordatorio</option>
                <option value="cobro">Día de cobros</option>
              </select>
              <input placeholder="Detalle (opcional)" value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
              <button type="submit">Guardar</button>
            </form>
          )}

          {!det && <Esqueleto h={80} />}
          {det && (
            <ul className="flex flex-col gap-1.5">
              {sd === diaPago && sm - 1 === m && sy === y && <li className="text-emerald-700">💰 Día de pago mensual</li>}
              {det.eventos.map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span><b>{e.titulo}</b> <span className="text-gray-400">· {e.tipo}</span>{e.descripcion && <span className="block text-gray-500">{e.descripcion}</span>}</span>
                  <button type="button" className="secondary !p-1 shrink-0 self-start" onClick={() => borrar(e.id)} aria-label="Eliminar"><Trash2 size={13} /></button>
                </li>
              ))}
              {det.vencimientos.length > 0 && <li className="text-emerald-700">{det.vencimientos.length} cobro(s) vencen · {det.vencimientos.filter((v) => !v.pagado).length} pendientes</li>}
              {det.pagados.map((p, i) => <li key={'p' + i}>✅ {p.nombre_completo} pagó L. {p.monto}</li>)}
              {det.actividad.map((a, i) => <li key={'a' + i} className="text-gray-600">• {a.nombre_completo}: {a.descripcion}</li>)}
              {!det.eventos.length && !det.vencimientos.length && !det.pagados.length && !det.actividad.length && sd !== diaPago &&
                <li className="text-gray-400">Sin movimientos este día.</li>}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

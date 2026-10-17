import { useState } from 'react';
import { api, descargarPlantilla } from '../api';

const TIPOS = {
  alumnos: ['Alumnos', 'Nombre, identidad, sección (los matricula en todas sus clases), encargado, teléfonos, mensualidad.'],
  profesores: ['Docentes', 'Nombre, correo, teléfono y fecha de ingreso.'],
  saldos: ['Saldos pendientes', 'Deudas anteriores: cada fila crea un pago pendiente para el alumno (por código, identidad o nombre).']
};
const COLOR = { ok: 'text-green-700', omitida: 'text-amber-600', error: 'text-red-600' };

export default function Importacion() {
  const [tipo, setTipo] = useState('alumnos');
  const [archivo, setArchivo] = useState(null);
  const [res, setRes] = useState(null);
  const [msg, setMsg] = useState('');
  const [cargando, setCargando] = useState(false);

  function elegir(e) {
    const f = e.target.files[0]; setRes(null); setMsg('');
    if (!f) return setArchivo(null);
    const r = new FileReader();
    r.onload = () => setArchivo({ nombre: f.name, data: r.result });
    r.readAsDataURL(f);
  }
  async function correr(aplicar) {
    setCargando(true); setMsg(''); 
    try { setRes(await (aplicar ? api.importacion.importar : api.importacion.analizar)({ tipo, archivo: archivo.data })); }
    catch (e) { setMsg(e.message); setRes(null); }
    setCargando(false);
  }
  const hayOk = res && res.ok > 0;

  return (
    <div>
      <h2>Importar desde Excel</h2>
      <div className="card flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {Object.entries(TIPOS).map(([k, [n]]) => (
            <button key={k} className={tipo === k ? '' : 'secondary'} onClick={() => { setTipo(k); setRes(null); setMsg(''); }}>{n}</button>
          ))}
        </div>
        <p className="text-sm text-gray-500">{TIPOS[tipo][1]}</p>
        <ol className="text-sm text-gray-600 list-decimal ml-5 flex flex-col gap-1">
          <li><button className="secondary" onClick={() => descargarPlantilla(tipo).catch((e) => setMsg(e.message))}>Descargar plantilla</button> y llénala con tus datos (borra la fila de ejemplo).</li>
          <li>Súbela aquí y pulsa <b>Revisar</b>: verás los errores fila por fila sin guardar nada.</li>
          <li>Si todo está bien, pulsa <b>Importar</b>. Las filas con error se omiten; las que ya existen no se duplican.</li>
        </ol>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={elegir} />
        <div className="flex gap-2">
          <button disabled={!archivo || cargando} onClick={() => correr(false)}>{cargando ? 'Procesando...' : 'Revisar'}</button>
          <button disabled={!hayOk || res.aplicado || cargando} onClick={() => correr(true)}>Importar {hayOk && !res.aplicado ? res.ok + ' fila(s)' : ''}</button>
        </div>
        {tipo === 'alumnos' && <p className="text-xs text-gray-400">Los alumnos se crean en el panel con su código. Las cuentas de Moodle no se crean automáticamente en la importación.</p>}
        {msg && <p className="text-sm text-red-600">{msg}</p>}
      </div>
      {res && (
        <div className="card">
          <h3>{res.aplicado ? 'Importación terminada' : 'Resultado de la revisión (aún no se guardó nada)'}</h3>
          <p className="text-sm mb-3"><b className="text-green-700">{res.ok}</b> {res.aplicado ? 'importadas' : 'listas'} · <b className="text-amber-600">{res.omitidas}</b> omitidas · <b className="text-red-600">{res.errores}</b> con error · {res.total} en total</p>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table>
              <thead><tr><th>Fila</th><th>Estado</th><th>Detalle</th></tr></thead>
              <tbody>{res.filas.filter((f) => f.estado !== 'ok').concat(res.filas.filter((f) => f.estado === 'ok').slice(0, 20)).map((f, i) => (
                <tr key={i}><td>{f.fila}</td><td className={COLOR[f.estado]}>{f.estado}</td><td>{f.mensaje}</td></tr>
              ))}</tbody>
            </table>
          </div>
          {res.ok > 20 && <p className="text-xs text-gray-400 mt-2">Se muestran los errores y las primeras 20 filas correctas.</p>}
        </div>
      )}
    </div>
  );
}

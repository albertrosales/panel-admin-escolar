import { useEffect, useState } from 'react';
import { Cargando } from './UI';
import { saceApi } from '../api';

const ROM = ['I', 'II', 'III', 'IV'];

function Clase({ c, A, onGuardado }) {
  const [par, setPar] = useState(() => [1, 2, 3, 4].map((n) => { const x = (c.parciales || []).find((p) => p.parcial === n); return { parcial: n, inicio: x ? x.inicio : '', fin: x ? x.fin : '' }; }));
  const [datos, setDatos] = useState(null);
  const [just, setJust] = useState(true);
  const [msg, setMsg] = useState('');
  const [cargando, setCargando] = useState(false);
  const setP = (i, k, v) => setPar(par.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  async function generar() {
    setMsg(''); setCargando(true);
    try {
      const lista = par.filter((p) => p.inicio && p.fin);
      if (!lista.length) throw new Error('Escribe las fechas de al menos un parcial');
      await A.guardarParciales(c.id, lista);
      setDatos(await A.datos(c.id, just)); onGuardado && onGuardado();
    } catch (e) { setMsg(e.message); }
    setCargando(false);
  }
  const edit = (ai, pi, k, v) => setDatos({ ...datos, alumnos: datos.alumnos.map((a, i) => (i !== ai ? a : { ...a, p: a.p.map((x, j) => (j === pi ? { ...x, [k]: v } : x)) })) });
  const enc = (k, v) => setDatos({ ...datos, encabezado: { ...datos.encabezado, [k]: v } });

  return (
    <div className="card">
      <h3>{c.seccion ? c.seccion + ' · ' : ''}{c.materia || c.nombre}</h3>
      {c.profesor && <p className="text-xs text-gray-500 mb-2">Docente: {c.profesor}</p>}
      <p className="text-sm text-gray-500 mb-2">Fechas de cada parcial (el sistema toma las notas calificadas y las inasistencias dentro de ese rango):</p>
      <div className="grid sm:grid-cols-2 gap-2 mb-3">
        {par.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-sm"><b className="w-20">Parcial {ROM[i]}</b>
            <input type="date" value={p.inicio} onChange={(e) => setP(i, 'inicio', e.target.value)} /> <span>a</span>
            <input type="date" value={p.fin} onChange={(e) => setP(i, 'fin', e.target.value)} /></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={generar} disabled={cargando}>{cargando ? 'Calculando...' : 'Calcular hoja SACE'}</button>
        <label className="flex items-center gap-2 text-sm !mb-0"><input type="checkbox" style={{ width: 'auto' }} checked={just} onChange={(e) => setJust(e.target.checked)} /> Contar inasistencias justificadas</label>
      </div>
      {msg && <p className="text-sm text-red-600 mt-2">{msg}</p>}
      {datos && (
        <div className="mt-4">
          {datos.aviso && <p className="text-sm text-amber-600 mb-2">{datos.aviso}</p>}
          <div className="grid sm:grid-cols-2 gap-2 mb-3">
            {[['centro', 'Código | Centro'], ['modalidad', 'Modalidad'], ['grado', 'Grado y sección (ej. SÉPTIMO GRADO SECCIÓN 12)'], ['jornada', 'Jornada'], ['asignatura', 'Asignatura']].map(([k, t]) => (
              <label key={k}>{t}<input value={datos.encabezado[k] || ''} onChange={(e) => enc(k, e.target.value)} /></label>
            ))}
          </div>
          <p className="text-xs text-gray-500 mb-1">Revisa y corrige si hace falta antes de descargar. Las notas son el porcentaje de las actividades calificadas del parcial.</p>
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th>Identidad</th><th>Nombre</th>{ROM.map((r) => <th key={r} colSpan={2} className="text-center">Parcial {r}</th>)}</tr>
                <tr><th></th><th></th>{ROM.map((r) => [<th key={r + 'i'} className="text-xs">Inas.</th>, <th key={r + 'n'} className="text-xs">Nota</th>])}</tr></thead>
              <tbody>
                {datos.alumnos.map((a, ai) => (
                  <tr key={ai}><td className="text-xs">{a.identidad || <span className="text-red-500">falta</span>}</td><td className="text-sm whitespace-nowrap">{a.nombre}</td>
                    {a.p.map((x, pi) => [
                      <td key={pi + 'i'}><input type="number" min="0" style={{ width: 60 }} value={x.inas} onChange={(e) => edit(ai, pi, 'inas', e.target.value)} /></td>,
                      <td key={pi + 'n'}><input type="number" min="0" max="100" style={{ width: 60 }} value={x.nota} onChange={(e) => edit(ai, pi, 'nota', e.target.value)} /></td>])}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3"><button onClick={() => A.descargar(c.id, datos).catch((e) => setMsg(e.message))}>Descargar Excel</button></div>
        </div>
      )}
    </div>
  );
}

export default function SacePanel({ portal }) {
  const A = saceApi(portal);
  const [clases, setClases] = useState(null);
  const [msg, setMsg] = useState('');
  const cargar = () => A.clases().then(setClases).catch((e) => setMsg(e.message));
  useEffect(() => { cargar(); }, []);
  if (!clases) return msg ? <p className="text-sm text-gray-500">{msg}</p> : <Cargando tarjetas={1} />;
  return (
    <div>
      {clases.length === 0 && <div className="card"><p className="text-sm text-gray-500">Aún no hay clases creadas.</p></div>}
      {clases.map((c) => <Clase key={c.id} c={c} A={A} onGuardado={cargar} />)}
    </div>
  );
}

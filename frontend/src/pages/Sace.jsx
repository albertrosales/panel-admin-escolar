import { useEffect, useState } from 'react';
import { saceApi } from '../api';
import SacePanel from '../components/SacePanel';

function Config() {
  const A = saceApi(false);
  const [f, setF] = useState({ sace_codigo: '', sace_centro: '', sace_modalidad: '', sace_jornada: '' });
  const [msg, setMsg] = useState('');
  useEffect(() => { A.config().then((c) => setF({ sace_codigo: c.sace_codigo || '', sace_centro: c.sace_centro || c.nombre || '', sace_modalidad: c.sace_modalidad || '', sace_jornada: c.sace_jornada || '' })).catch(() => {}); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function guardar(e) { e.preventDefault(); try { await A.guardarConfig(f); setMsg('Guardado'); } catch (x) { setMsg(x.message); } }
  return (
    <form onSubmit={guardar} className="card">
      <h3>Datos del centro (encabezado del SACE)</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <label>Código del centro<input value={f.sace_codigo} onChange={set('sace_codigo')} placeholder="020900076M02" /></label>
        <label>Nombre del centro<input value={f.sace_centro} onChange={set('sace_centro')} /></label>
        <label>Modalidad<input value={f.sace_modalidad} onChange={set('sace_modalidad')} placeholder="TERCER CICLO DE EDUCACIÓN BÁSICA" /></label>
        <label>Jornada<input value={f.sace_jornada} onChange={set('sace_jornada')} placeholder="MATUTINA" /></label>
      </div>
      <div className="flex items-center gap-3 mt-3"><button type="submit">Guardar</button>{msg && <span className="text-sm text-gray-500">{msg}</span>}</div>
    </form>
  );
}

export default function Sace() {
  return (
    <div>
      <h2>SACE · Notas e inasistencias</h2>
      <Config />
      <SacePanel portal={false} />
    </div>
  );
}

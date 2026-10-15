import { useEffect, useState } from 'react';
import { api } from '../api';

const COLEGIO_ID = 1;
const hoy = () => new Date().toISOString().slice(0, 10);
const ESTADOS = [['P', 'Presente'], ['A', 'Ausente'], ['T', 'Tarde'], ['J', 'Justificada']];

export default function Asistencia() {
  const [grados, setGrados] = useState([]);
  const [grado, setGrado] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const [lista, setLista] = useState([]);
  const [msg, setMsg] = useState('');

  useEffect(() => { api.grados.listar({ colegio_id: COLEGIO_ID }).then(setGrados); }, []);
  useEffect(() => {
    if (!grado) return setLista([]);
    api.asistencia.lista(grado, fecha).then((r) => setLista(r.map((a) => ({ ...a, estado: a.estado || 'P' }))));
    setMsg('');
  }, [grado, fecha]);

  function marcar(id, estado) { setLista(lista.map((a) => (a.id === id ? { ...a, estado } : a))); }

  async function guardar() {
    try {
      const r = await api.asistencia.guardar({ grado_id: grado, fecha, registros: lista.map((a) => ({ alumno_id: a.id, estado: a.estado })) });
      setMsg(r.guardados + ' registros guardados.');
    } catch (e) { setMsg('Error: ' + e.message); }
  }

  return (
    <div>
      <h2>Asistencia</h2>
      <div className="card">
        <div className="flex flex-wrap gap-3 items-end mb-4">
          <label>Clase
            <select value={grado} onChange={(e) => setGrado(e.target.value)}>
              <option value="">Selecciona...</option>
              {grados.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
          </label>
          <label>Fecha
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
        </div>
        {grado && lista.length === 0 && <p className="text-sm text-gray-500">No hay alumnos matriculados en esta clase.</p>}
        {lista.length > 0 && (
          <>
            <table>
              <thead><tr><th>Alumno</th><th>Estado</th></tr></thead>
              <tbody>
                {lista.map((a) => (
                  <tr key={a.id}>
                    <td>{a.nombre_completo}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {ESTADOS.map(([k, n]) => (
                          <button key={k} type="button" onClick={() => marcar(a.id, k)}
                            className={a.estado === k ? '' : 'secondary'} style={{ padding: '.2rem .6rem', fontSize: '.8rem' }}>{n}</button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="mt-4" onClick={guardar}>Guardar asistencia</button>
          </>
        )}
        {msg && <p className="text-sm text-gray-500 mt-2">{msg}</p>}
      </div>
    </div>
  );
}

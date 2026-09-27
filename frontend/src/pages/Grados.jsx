import { useEffect, useState } from 'react';
import { api } from '../api';

const COLEGIO_ID = 1;

export default function Grados() {
  const [grados, setGrados] = useState([]);
  const [nombre, setNombre] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  function cargar() {
    api.grados.listar({ colegio_id: COLEGIO_ID }).then(setGrados);
  }
  useEffect(cargar, []);

  async function crear(e) {
    e.preventDefault();
    setError('');
    if (!nombre.trim()) {
      setError('El nombre de la clase es obligatorio.');
      return;
    }
    setCargando(true);
    try {
      await api.grados.crear({ colegio_id: COLEGIO_ID, nombre });
      setNombre('');
      cargar();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div>
      <h2>Clases / Grados</h2>

      <form className="card" onSubmit={crear}>
        <p className="text-sm text-gray-500 mb-3">
          Crea una clase directamente en el panel. Si más adelante quieres sincronizarla con un curso de
          Moodle, avísame y lo conectamos.
        </p>
        <div className="flex gap-2 max-w-md">
          <input
            className="flex-1"
            placeholder="Nombre de la clase (ej: 8vo Grado B)"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <button type="submit" disabled={cargando}>{cargando ? 'Creando...' : 'Crear clase'}</button>
        </div>
        {error && <p className="text-red-600 mt-2">{error}</p>}
      </form>

      <div className="card">
        <h3>Clases existentes</h3>
        <table>
          <thead><tr><th>Nombre</th><th>Origen</th></tr></thead>
          <tbody>
            {grados.map((g) => (
              <tr key={g.id}>
                <td>{g.nombre}</td>
                <td>{g.moodle_category_id ? 'Sincronizada con Moodle' : 'Creada en el panel'}</td>
              </tr>
            ))}
            {grados.length === 0 && (
              <tr><td colSpan={2} className="text-gray-500">Sin clases todavía</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

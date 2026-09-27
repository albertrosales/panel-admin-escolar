import { useEffect, useState } from 'react';
import { api } from '../api';

const COLEGIO_ID = 1;

export default function Grados() {
  const [grados, setGrados] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [nombre, setNombre] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  function cargar() {
    api.grados.listar({ colegio_id: COLEGIO_ID }).then(setGrados);
  }
  useEffect(cargar, []);

  useEffect(() => {
    api.grados.listarCategoriasMoodle({ colegio_id: COLEGIO_ID })
      .then(setCategorias)
      .catch(() => setCategorias([]));
  }, []);

  async function crear(e) {
    e.preventDefault();
    setError('');
    if (!nombre.trim()) {
      setError('El nombre de la clase es obligatorio.');
      return;
    }
    setCargando(true);
    try {
      await api.grados.crear({
        colegio_id: COLEGIO_ID,
        nombre,
        categoria_moodle_id: categoriaId || undefined
      });
      setNombre('');
      setCategoriaId('');
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
          Si eliges una categoría de Moodle, se crea el curso allá automáticamente y queda conectado.
          Si la dejas en blanco, la clase queda solo en el panel.
        </p>
        <div className="flex flex-col gap-3 max-w-md">
          <label>
            Nombre de la clase
            <input
              placeholder="ej: Deportes 7° Grado A"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </label>
          <label>
            Categoría en Moodle (opcional)
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">Sin conectar a Moodle</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
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

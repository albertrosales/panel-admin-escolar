import { useEffect, useState } from 'react';
import { api } from '../api';

const COLEGIO_ID = 1;

export default function Grados() {
  const [grados, setGrados] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [nombre, setNombre] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [seccion, setSeccion] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  function cargar() {
    api.grados.listar({ colegio_id: COLEGIO_ID }).then(setGrados);
  }
  useEffect(cargar, []);
  const secciones = [...new Set(grados.map((g) => g.seccion).filter(Boolean))].sort();

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
        categoria_moodle_id: categoriaId || undefined,
        seccion
      });
      setNombre('');
      setSeccion('');
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
          Al crear la clase, el curso se crea al instante en el Moodle del colegio y queda conectado.
          Puedes elegir en qué categoría de Moodle va; si no eliges, se usa la principal.
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
              <option value="">Automática (categoría principal)</option>
              <option value="none">Solo en el panel (sin Moodle)</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            Grado y sección (ej: 7.º Grado A)
            <input list="secciones" placeholder="Las clases con la misma sección se matriculan juntas" value={seccion} onChange={(e) => setSeccion(e.target.value)} />
          </label>
          <button type="submit" disabled={cargando}>{cargando ? 'Creando...' : 'Crear clase'}</button>
        </div>
        {error && <p className="text-red-600 mt-2">{error}</p>}
      </form>

      <datalist id="secciones">{secciones.map((x) => <option key={x} value={x} />)}</datalist>
      <div className="card">
        <h3>Clases existentes</h3>
        <p className="text-sm text-gray-500 mb-3">
          Cuando un alumno se matricula en una sección (por ejemplo 8.º Grado A), se le activan todas las clases que tengan esa sección.
          Revisa que cada clase tenga la suya.
        </p>
        <table>
          <thead><tr><th>Nombre</th><th>Grado y sección</th><th>Origen</th></tr></thead>
          <tbody>
            {grados.map((g) => (
              <tr key={g.id}>
                <td>{g.nombre}</td>
                <td>
                  <input list="secciones" defaultValue={g.seccion || ''} placeholder="Sin sección" className="w-48"
                    onBlur={(e) => { if (e.target.value !== (g.seccion || '')) api.grados.asignarSeccion(g.id, e.target.value).then(cargar); }} />
                </td>
                <td>{g.moodle_category_id ? 'Sincronizada con Moodle' : (
                  <span>Solo en el panel <button type="button" className="secondary ml-2" onClick={() => { setError(''); api.grados.crearEnMoodle(g.id).then(cargar).catch((e3) => setError(e3.message)); }}>Crear en Moodle</button></span>
                )}</td>
              </tr>
            ))}
            {grados.length === 0 && (
              <tr><td colSpan={3} className="text-gray-500">Sin clases todavía</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

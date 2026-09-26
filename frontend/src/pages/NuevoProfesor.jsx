import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

const COLEGIO_ID = 1;

export default function NuevoProfesor() {
  const navigate = useNavigate();
  const [grados, setGrados] = useState([]);
  const [form, setForm] = useState({
    nombre_completo: '', correo: '', telefono: '', fecha_ingreso: '',
    direccion: '', fecha_nacimiento: '', identidad: '', es_extranjero: false
  });
  const [asignaciones, setAsignaciones] = useState({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    api.grados.listar({ colegio_id: COLEGIO_ID }).then(setGrados);
  }, []);

  function actualizar(campo, valor) {
    setForm({ ...form, [campo]: valor });
  }

  function toggleClase(gradoId, nombreGrado) {
    const copia = { ...asignaciones };
    if (gradoId in copia) delete copia[gradoId];
    else copia[gradoId] = nombreGrado;
    setAsignaciones(copia);
  }

  function cambiarMateria(gradoId, materia) {
    setAsignaciones({ ...asignaciones, [gradoId]: materia });
  }

  async function enviar(e) {
    e.preventDefault();
    setError('');
    if (!form.nombre_completo.trim() || !form.fecha_ingreso) {
      setError('Nombre completo y fecha de ingreso son obligatorios.');
      return;
    }
    setCargando(true);
    try {
      const listaAsignaciones = Object.entries(asignaciones).map(([grado_id, materia]) => ({
        grado_id: Number(grado_id),
        materia: materia || 'Sin especificar'
      }));
      const res = await api.profesores.crear({
        colegio_id: COLEGIO_ID,
        ...form,
        asignaciones: listaAsignaciones
      });
      setResultado(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  if (resultado) {
    return (
      <div>
        <h2>Profesor creado</h2>
        <div className="card">
          <p><strong>{resultado.profesor.nombre_completo}</strong> fue registrado correctamente.</p>

          {resultado.moodle && resultado.moodle.creado && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p><strong>Se creó un usuario nuevo en Moodle. Copia estos datos ahora, no se volverán a mostrar:</strong></p>
              <p>Usuario: <code>{resultado.moodle.username}</code></p>
              <p>Contraseña: <code>{resultado.moodle.password}</code></p>
            </div>
          )}

          {resultado.erroresAsignacion && resultado.erroresAsignacion.length > 0 && (
            <div className="mt-3 text-red-600">
              <p>Hubo problemas asignando algunas clases:</p>
              <ul>
                {resultado.erroresAsignacion.map((e, i) => <li key={i}>{e.grado}: {e.error}</li>)}
              </ul>
            </div>
          )}

          <div className="mt-4">
            <button onClick={() => navigate('/profesores')}>Volver a la lista</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2>Nuevo profesor</h2>
      <form className="card" onSubmit={enviar}>
        <div className="flex flex-col gap-3 max-w-lg">
          <label>
            Nombre completo *
            <input value={form.nombre_completo} onChange={(e) => actualizar('nombre_completo', e.target.value)} />
          </label>
          <label>
            Correo (para crear su acceso a Moodle)
            <input value={form.correo} onChange={(e) => actualizar('correo', e.target.value)} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label>
              Teléfono
              <input value={form.telefono} onChange={(e) => actualizar('telefono', e.target.value)} />
            </label>
            <label>
              Fecha de ingreso *
              <input type="date" value={form.fecha_ingreso} onChange={(e) => actualizar('fecha_ingreso', e.target.value)} />
            </label>
          </div>

          <label>
            Dirección
            <input value={form.direccion} onChange={(e) => actualizar('direccion', e.target.value)} />
          </label>

          <div className="grid grid-cols-2 gap-3 items-end">
            <label>
              Fecha de nacimiento
              <input type="date" value={form.fecha_nacimiento} onChange={(e) => actualizar('fecha_nacimiento', e.target.value)} />
            </label>
            <label>
              Número de identidad / DNI
              <input value={form.identidad} onChange={(e) => actualizar('identidad', e.target.value)} />
            </label>
          </div>

          <label className="flex-row items-center gap-2 !flex-row">
            <input
              type="checkbox"
              className="w-auto"
              checked={form.es_extranjero}
              onChange={(e) => actualizar('es_extranjero', e.target.checked)}
            />
            Profesor extranjero
          </label>

          <div className="border-t border-gray-200 pt-4 mt-1">
            <p className="mb-2 text-xs font-medium text-gray-500">Clases que imparte</p>
            <div className="flex flex-col gap-2">
              {grados.map((g) => (
                <div key={g.id} className="flex items-center gap-2">
                  <input type="checkbox" className="w-auto" checked={g.id in asignaciones} onChange={() => toggleClase(g.id, g.nombre)} />
                  <span className="min-w-[220px] text-sm">{g.nombre}</span>
                  {g.id in asignaciones && (
                    <input
                      placeholder="Materia (ej: Matemáticas)"
                      value={asignaciones[g.id]}
                      onChange={(e) => cambiarMateria(g.id, e.target.value)}
                      className="flex-1"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-red-600">{error}</p>}

          <button type="submit" disabled={cargando}>{cargando ? 'Guardando...' : 'Crear profesor'}</button>
        </div>
      </form>
    </div>
  );
}

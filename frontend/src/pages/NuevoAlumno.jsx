import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import SelectorClases from '../components/SelectorClases';

const COLEGIO_ID = 1;

export default function NuevoAlumno() {
  const navigate = useNavigate();
  const [grados, setGrados] = useState([]);
  const [form, setForm] = useState({
    nombre_completo: '',
    nombre_encargado: '',
    telefono_encargado: '',
    correo_encargado: '',
    correo_alumno: '',
    telefono: '',
    direccion: '',
    fecha_nacimiento: '',
    identidad: '',
    es_extranjero: false
  });
  const [gradosSeleccionados, setGradosSeleccionados] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    api.grados.listar({ colegio_id: COLEGIO_ID }).then(setGrados);
  }, []);

  function actualizar(campo, valor) {
    setForm({ ...form, [campo]: valor });
  }

  async function enviar(e) {
    e.preventDefault();
    setError('');
    if (!form.nombre_completo.trim()) {
      setError('El nombre completo es obligatorio.');
      return;
    }
    setCargando(true);
    try {
      const res = await api.alumnos.crear({
        colegio_id: COLEGIO_ID,
        ...form,
        grados: gradosSeleccionados
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
        <h2>Alumno creado</h2>
        <div className="card">
          <p><strong>{resultado.alumno.nombre_completo}</strong> fue registrado correctamente.</p>
          <p>Clases matriculadas: {resultado.clasesMatriculadas.join(', ') || 'ninguna'}</p>

          {resultado.moodle && resultado.moodle.creado && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p><strong>Se creó un usuario nuevo en Moodle. Copia estos datos ahora, no se volverán a mostrar:</strong></p>
              <p>Usuario: <code>{resultado.moodle.username}</code></p>
              <p>Contraseña: <code>{resultado.moodle.password}</code></p>
            </div>
          )}

          {resultado.moodle && !resultado.moodle.creado && (
            <p className="text-sm text-gray-500">Se vinculó a un usuario de Moodle ya existente con ese correo.</p>
          )}

          {resultado.erroresMatricula && resultado.erroresMatricula.length > 0 && (
            <div className="mt-3 text-red-600">
              <p>Hubo problemas matriculando en algunas clases:</p>
              <ul>
                {resultado.erroresMatricula.map((e, i) => <li key={i}>{e.grado}: {e.error}</li>)}
              </ul>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button onClick={() => navigate('/alumnos/' + resultado.alumno.id)}>Ver detalle del alumno</button>
            <button className="secondary" onClick={() => navigate('/alumnos')}>Volver a la lista</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2>Nuevo alumno</h2>
      <form className="card" onSubmit={enviar}>
        <div className="flex flex-col gap-3 max-w-lg">
          <label>
            Nombre completo del alumno *
            <input value={form.nombre_completo} onChange={(e) => actualizar('nombre_completo', e.target.value)} />
          </label>
          <label>
            Correo del alumno (para crear su acceso a Moodle)
            <input value={form.correo_alumno} onChange={(e) => actualizar('correo_alumno', e.target.value)} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label>
              Teléfono propio
              <input value={form.telefono} onChange={(e) => actualizar('telefono', e.target.value)} />
            </label>
            <label>
              Fecha de nacimiento
              <input type="date" value={form.fecha_nacimiento} onChange={(e) => actualizar('fecha_nacimiento', e.target.value)} />
            </label>
          </div>

          <label>
            Dirección
            <input value={form.direccion} onChange={(e) => actualizar('direccion', e.target.value)} />
          </label>

          <div className="grid grid-cols-2 gap-3 items-end">
            <label>
              Número de identidad / DNI
              <input value={form.identidad} onChange={(e) => actualizar('identidad', e.target.value)} />
            </label>
            <label className="flex-row items-center gap-2 !flex-row">
              <input
                type="checkbox"
                className="w-auto"
                checked={form.es_extranjero}
                onChange={(e) => actualizar('es_extranjero', e.target.checked)}
              />
              Alumno extranjero
            </label>
          </div>

          <div className="border-t border-gray-200 pt-4 mt-1">
            <p className="text-xs font-medium text-gray-500 mb-2">Datos del encargado</p>
            <div className="flex flex-col gap-3">
              <label>
                Nombre del encargado
                <input value={form.nombre_encargado} onChange={(e) => actualizar('nombre_encargado', e.target.value)} />
              </label>
              <label>
                Teléfono del encargado
                <input value={form.telefono_encargado} onChange={(e) => actualizar('telefono_encargado', e.target.value)} />
              </label>
              <label>
                Correo del encargado (se usa para Moodle si el alumno no tiene correo propio)
                <input value={form.correo_encargado} onChange={(e) => actualizar('correo_encargado', e.target.value)} />
              </label>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-gray-500">Clases en las que matricular</p>
            <SelectorClases grados={grados} seleccionados={gradosSeleccionados} onChange={setGradosSeleccionados} />
          </div>

          {error && <p className="text-red-600">{error}</p>}

          <button type="submit" disabled={cargando}>{cargando ? 'Guardando...' : 'Crear alumno'}</button>
        </div>
      </form>
    </div>
  );
}

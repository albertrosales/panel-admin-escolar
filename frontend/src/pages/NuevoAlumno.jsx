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
    correo_alumno: ''
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
            <div style={{ marginTop: 16, padding: 12, background: 'rgba(255,200,0,0.1)', borderRadius: 8 }}>
              <p><strong>Se creó un usuario nuevo en Moodle. Copia estos datos ahora, no se volverán a mostrar:</strong></p>
              <p>Usuario: <code>{resultado.moodle.username}</code></p>
              <p>Contraseña: <code>{resultado.moodle.password}</code></p>
            </div>
          )}

          {resultado.moodle && !resultado.moodle.creado && (
            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Se vinculó a un usuario de Moodle ya existente con ese correo.</p>
          )}

          {resultado.erroresMatricula && resultado.erroresMatricula.length > 0 && (
            <div style={{ marginTop: 12, color: '#c0392b' }}>
              <p>Hubo problemas matriculando en algunas clases:</p>
              <ul>
                {resultado.erroresMatricula.map((e, i) => <li key={i}>{e.grado}: {e.error}</li>)}
              </ul>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <button onClick={() => navigate('/alumnos/' + resultado.alumno.id)}>Ver detalle del alumno</button>{' '}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
          <label>
            Nombre completo del alumno *
            <input value={form.nombre_completo} onChange={(e) => actualizar('nombre_completo', e.target.value)} />
          </label>
          <label>
            Correo del alumno (para crear su acceso a Moodle)
            <input value={form.correo_alumno} onChange={(e) => actualizar('correo_alumno', e.target.value)} />
          </label>
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

          <div>
            <p style={{ marginBottom: 6 }}>Clases en las que matricular</p>
            <SelectorClases grados={grados} seleccionados={gradosSeleccionados} onChange={setGradosSeleccionados} />
          </div>

          {error && <p style={{ color: '#c0392b' }}>{error}</p>}

          <button type="submit" disabled={cargando}>{cargando ? 'Guardando...' : 'Crear alumno'}</button>
        </div>
      </form>
    </div>
  );
}

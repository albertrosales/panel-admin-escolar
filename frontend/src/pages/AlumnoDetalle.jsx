import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, resolverUrlArchivo } from '../api';
import EstadoBadge from '../components/EstadoBadge';
import SelectorClases from '../components/SelectorClases';

const COLEGIO_ID = 1;

export default function AlumnoDetalle() {
  const { id } = useParams();
  const [alumno, setAlumno] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [todosGrados, setTodosGrados] = useState([]);
  const [nuevasClases, setNuevasClases] = useState([]);
  const [matriculando, setMatriculando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [motivoBaja, setMotivoBaja] = useState('');
  const [mostrarBaja, setMostrarBaja] = useState(false);

  function cargar() {
    api.alumnos.detalle(id).then((data) => {
      setAlumno(data);
      setForm({
        nombre_completo: data.nombre_completo || '',
        telefono: data.telefono || '',
        direccion: data.direccion || '',
        fecha_nacimiento: data.fecha_nacimiento ? data.fecha_nacimiento.slice(0, 10) : '',
        identidad: data.identidad || '',
        es_extranjero: !!data.es_extranjero,
        nombre_encargado: data.nombre_encargado || '',
        telefono_encargado: data.telefono_encargado || '',
        correo_encargado: data.correo_encargado || '',
        fecha_matricula: data.fecha_matricula ? data.fecha_matricula.slice(0, 10) : '',
        monto_mensualidad: data.monto_mensualidad || ''
      });
    });
    api.grados.listar({ colegio_id: COLEGIO_ID }).then(setTodosGrados);
  }
  useEffect(cargar, [id]);

  async function generar(tipo) {
    setMensaje('Generando documento...');
    try {
      const fn = tipo === 'constancia' ? api.reportes.constancia : api.reportes.reportePago;
      const doc = await fn(id);
      setMensaje('Documento generado.');
      window.open(resolverUrlArchivo(doc.archivo_url), '_blank');
      cargar();
    } catch (e) {
      setMensaje(`Error: ${e.message}`);
    }
  }

  async function marcarPagado(pagoId) {
    await api.pagos.marcarPagado(pagoId, 'efectivo');
    cargar();
  }

  async function matricularClases() {
    if (nuevasClases.length === 0) return;
    setMatriculando(true);
    try {
      await api.alumnos.matricular(id, { grados: nuevasClases });
      setNuevasClases([]);
      cargar();
    } catch (e) {
      setMensaje(`Error al matricular: ${e.message}`);
    } finally {
      setMatriculando(false);
    }
  }

  async function guardarEdicion() {
    setGuardando(true);
    try {
      await api.alumnos.actualizar(id, {
        ...form,
        monto_mensualidad: form.monto_mensualidad === '' ? null : Number(form.monto_mensualidad)
      });
      setEditando(false);
      cargar();
    } catch (e) {
      setMensaje(`Error al guardar: ${e.message}`);
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarBaja() {
    setGuardando(true);
    try {
      await api.alumnos.darDeBaja(id, motivoBaja);
      setMostrarBaja(false);
      setMotivoBaja('');
      cargar();
    } catch (e) {
      setMensaje(`Error al dar de baja: ${e.message}`);
    } finally {
      setGuardando(false);
    }
  }

  async function reactivar() {
    setGuardando(true);
    try {
      await api.alumnos.reactivar(id);
      cargar();
    } catch (e) {
      setMensaje(`Error al reactivar: ${e.message}`);
    } finally {
      setGuardando(false);
    }
  }

  if (!alumno || !form) return <p>Cargando...</p>;

  const idsYaMatriculado = (alumno.clases || []).map((c) => c.id);
  const gradosDisponibles = todosGrados.filter((g) => !idsYaMatriculado.includes(g.id));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="!mb-0">
          {alumno.nombre_completo} <EstadoBadge estado={alumno.estado_pago} />
          {!alumno.activo && <span className="badge badge-rojo ml-2">Baja</span>}
          {alumno.es_extranjero && <span className="badge badge-amarillo ml-2">Extranjero</span>}
        </h2>
        <div className="flex gap-2">
          {!editando && <button className="secondary" onClick={() => setEditando(true)}>Editar</button>}
          {alumno.activo ? (
            <button className="secondary text-red-600" onClick={() => setMostrarBaja(true)}>Dar de baja</button>
          ) : (
            <button onClick={reactivar} disabled={guardando}>Reactivar</button>
          )}
        </div>
      </div>

      {mostrarBaja && (
        <div className="card border-red-200 bg-red-50 mb-5">
          <h3>Dar de baja a este alumno</h3>
          <p className="text-sm text-gray-500 mb-2">Se marcará como inactivo y, si tiene acceso a Moodle, se suspenderá.</p>
          <label>
            Motivo (opcional)
            <input value={motivoBaja} onChange={(e) => setMotivoBaja(e.target.value)} />
          </label>
          <div className="flex gap-2 mt-3">
            <button className="!bg-red-600 hover:!bg-red-700" onClick={confirmarBaja} disabled={guardando}>
              {guardando ? 'Procesando...' : 'Confirmar baja'}
            </button>
            <button className="secondary" onClick={() => setMostrarBaja(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="card mb-5">
        <h3>Datos de contacto</h3>
        {!editando ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <p><span className="text-gray-500">Teléfono:</span> {alumno.telefono || '—'}</p>
            <p><span className="text-gray-500">Fecha de nacimiento:</span> {alumno.fecha_nacimiento ? new Date(alumno.fecha_nacimiento).toLocaleDateString('es-HN') : '—'}</p>
            <p><span className="text-gray-500">Dirección:</span> {alumno.direccion || '—'}</p>
            <p><span className="text-gray-500">Identidad:</span> {alumno.identidad || '—'}</p>
            <p><span className="text-gray-500">Ingreso:</span> {alumno.fecha_matricula ? new Date(alumno.fecha_matricula).toLocaleDateString('es-HN') : '—'}</p>
            <p><span className="text-gray-500">Mensualidad:</span> {alumno.monto_mensualidad ? 'L. ' + Number(alumno.monto_mensualidad).toFixed(2) : 'No configurada'}</p>
            <p><span className="text-gray-500">Encargado:</span> {alumno.nombre_encargado || '—'}</p>
            <p><span className="text-gray-500">Tel. encargado:</span> {alumno.telefono_encargado || '—'}</p>
            <p><span className="text-gray-500">Correo encargado:</span> {alumno.correo_encargado || '—'}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 max-w-lg">
            <label>
              Nombre completo
              <input

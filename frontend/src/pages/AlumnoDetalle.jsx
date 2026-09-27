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
              <input value={form.nombre_completo} onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label>
                Teléfono
                <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
              </label>
              <label>
                Fecha de nacimiento
                <input type="date" value={form.fecha_nacimiento} onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })} />
              </label>
            </div>
            <label>
              Dirección
              <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3 items-end">
              <label>
                Identidad
                <input value={form.identidad} onChange={(e) => setForm({ ...form, identidad: e.target.value })} />
              </label>
              <label className="flex-row items-center gap-2 !flex-row">
                <input type="checkbox" className="w-auto" checked={form.es_extranjero} onChange={(e) => setForm({ ...form, es_extranjero: e.target.checked })} />
                Extranjero
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label>
                Fecha real de ingreso
                <input type="date" value={form.fecha_matricula} onChange={(e) => setForm({ ...form, fecha_matricula: e.target.value })} />
              </label>
              <label>
                Monto de mensualidad (L.)
                <input type="number" step="0.01" value={form.monto_mensualidad} onChange={(e) => setForm({ ...form, monto_mensualidad: e.target.value })} />
              </label>
            </div>
            <label>
              Nombre del encargado
              <input value={form.nombre_encargado} onChange={(e) => setForm({ ...form, nombre_encargado: e.target.value })} />
            </label>
            <label>
              Teléfono del encargado
              <input value={form.telefono_encargado} onChange={(e) => setForm({ ...form, telefono_encargado: e.target.value })} />
            </label>
            <label>
              Correo del encargado
              <input value={form.correo_encargado} onChange={(e) => setForm({ ...form, correo_encargado: e.target.value })} />
            </label>
            <div className="flex gap-2 mt-1">
              <button onClick={guardarEdicion} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar cambios'}</button>
              <button className="secondary" onClick={() => setEditando(false)}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Clases matriculadas</h3>
        {(alumno.clases || []).length === 0 && (
          <p className="text-sm text-gray-500">Este alumno no está matriculado en ninguna clase todavía.</p>
        )}
        <ul>
          {(alumno.clases || []).map((c) => (
            <li key={c.id} className="text-sm">{c.nombre}</li>
          ))}
        </ul>

        {gradosDisponibles.length > 0 && (
          <div className="mt-4 border-t border-gray-200 pt-4">
            <p className="mb-1.5">Matricular en clases adicionales</p>
            <SelectorClases grados={gradosDisponibles} seleccionados={nuevasClases} onChange={setNuevasClases} />
            <button className="mt-3" disabled={matriculando || nuevasClases.length === 0} onClick={matricularClases}>
              {matriculando ? 'Matriculando...' : 'Matricular en las clases seleccionadas'}
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Documentos</h3>
        <div className="flex gap-2">
          <button onClick={() => generar('constancia')}>Generar constancia de estudio</button>
          <button className="secondary" onClick={() => generar('reporte_pago')}>Generar reporte de pago</button>
        </div>
        {mensaje && <p className="text-sm text-gray-500 mt-2">{mensaje}</p>}
      </div>

      <div className="card">
        <h3>Pagos</h3>
        <table>
          <thead>
            <tr><th>Periodo</th><th>Monto</th><th>Vencimiento</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {alumno.pagos.map((p) => (
              <tr key={p.id}>
                <td>{p.periodo}</td>
                <td>L. {p.monto}</td>
                <td>{new Date(p.fecha_vencimiento).toLocaleDateString('es-HN')}</td>
                <td>{p.pagado ? 'Pagado' : 'Pendiente'}</td>
                <td>{!p.pagado && <button onClick={() => marcarPagado(p.id)}>Marcar pagado</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Historial</h3>
        <table>
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th></tr></thead>
          <tbody>
            {alumno.historial.map((h) => (
              <tr key={h.id}>
                <td>{new Date(h.fecha).toLocaleString('es-HN')}</td>
                <td>{h.tipo}</td>

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

  function cargar() {
    api.alumnos.detalle(id).then(setAlumno);
    api.grados.listar({ colegio_id: COLEGIO_ID }).then(setTodosGrados);
  }
  useEffect(cargar, [id]);

  async function generar(tipo) {
    setMensaje('Generando documento...');
    try {
      const fn = tipo === 'constancia' ? api.reportes.constancia : api.reportes.reportePago;
      const doc = await fn(id);
      setMensaje('Documento generado.');
      window.open(doc.archivo_url, '_blank');
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

  if (!alumno) return <p>Cargando...</p>;

  const idsYaMatriculado = (alumno.clases || []).map((c) => c.id);
  const gradosDisponibles = todosGrados.filter((g) => !idsYaMatriculado.includes(g.id));

  return (
    <div>
      <h2>{alumno.nombre_completo} <EstadoBadge estado={alumno.estado_pago} /></h2>

      <div className="card">
        <h3>Clases matriculadas</h3>
        {(alumno.clases || []).length === 0 && (
          <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Este alumno no está matriculado en ninguna clase todavía.</p>
        )}
        <ul>
          {(alumno.clases || []).map((c) => (
            <li key={c.id} style={{ fontSize: 14 }}>{c.nombre}</li>
          ))}
        </ul>

        {gradosDisponibles.length > 0 && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <p style={{ marginBottom: 6 }}>Matricular en clases adicionales</p>
            <SelectorClases grados={gradosDisponibles} seleccionados={nuevasClases} onChange={setNuevasClases} />
            <button style={{ marginTop: 12 }} disabled={matriculando || nuevasClases.length === 0} onClick={matricularClases}>
              {matriculando ? 'Matriculando...' : 'Matricular en las clases seleccionadas'}
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Documentos</h3>
        <button onClick={() => generar('constancia')}>Generar constancia de estudio</button>{' '}
        <button className="secondary" onClick={() => generar('reporte_pago')}>Generar reporte de pago</button>
        {mensaje && <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 8 }}>{mensaje}</p>}
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
                <td>{h.descripcion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

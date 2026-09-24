import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import EstadoBadge from '../components/EstadoBadge';

export default function AlumnoDetalle() {
  const { id } = useParams();
  const [alumno, setAlumno] = useState(null);
  const [mensaje, setMensaje] = useState('');

  function cargar() {
    api.alumnos.detalle(id).then(setAlumno);
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

  if (!alumno) return <p>Cargando...</p>;

  return (
    <div>
      <h2>{alumno.nombre_completo} <EstadoBadge estado={alumno.estado_pago} /></h2>

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

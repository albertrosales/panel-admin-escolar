import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import EstadoBadge from '../components/EstadoBadge';

const COLEGIO_ID = 1;

export default function Alumnos() {
  const [alumnos, setAlumnos] = useState([]);
  const [filtro, setFiltro] = useState('');

  function cargar() {
    api.alumnos.listar({ colegio_id: COLEGIO_ID, ...(filtro ? { estado_pago: filtro } : {}) })
      .then(setAlumnos);
  }

  useEffect(cargar, [filtro]);

  return (
    <div>
      <h2>Alumnos</h2>
      <div className="card">
        <div style={{ marginBottom: 12 }}>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="al_dia">Al día</option>
            <option value="plan_pago">Plan de pago</option>
            <option value="moroso">Moroso</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Estado</th>
              <th>Encargado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {alumnos.map((a) => (
              <tr key={a.id}>
                <td>{a.nombre_completo}</td>
                <td><EstadoBadge estado={a.estado_pago} /></td>
                <td>{a.nombre_encargado || '—'}</td>
                <td><Link to={`/alumnos/${a.id}`}>Ver detalle</Link></td>
              </tr>
            ))}
            {alumnos.length === 0 && (
              <tr><td colSpan={4} style={{ color: 'var(--text-dim)' }}>Sin resultados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

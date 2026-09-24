import { useEffect, useState } from 'react';
import { api } from '../api';

const COLEGIO_ID = 1;

export default function Profesores() {
  const [profesores, setProfesores] = useState([]);
  const [expandido, setExpandido] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [comentario, setComentario] = useState('');

  useEffect(() => {
    api.profesores.listar({ colegio_id: COLEGIO_ID }).then(setProfesores);
  }, []);

  async function abrir(id) {
    if (expandido === id) { setExpandido(null); return; }
    const d = await api.profesores.detalle(id);
    setDetalle(d);
    setExpandido(id);
  }

  async function agregarResena(id) {
    if (!comentario.trim()) return;
    await api.profesores.agregarResena(id, { autor: 'Dirección', comentario });
    setComentario('');
    abrir(id);
  }

  async function generarInforme(id) {
    const doc = await api.reportes.informeDocente(id);
    window.open(doc.archivo_url, '_blank');
  }

  return (
    <div>
      <h2>Profesores</h2>
      {profesores.map((p) => (
        <div className="card" key={p.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>{p.nombre_completo}</strong>
              <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>{(p.materias || []).join(', ')}</div>
            </div>
            <div>
              <button className="secondary" onClick={() => abrir(p.id)}>
                {expandido === p.id ? 'Ocultar' : 'Ver detalle'}
              </button>{' '}
              <button onClick={() => generarInforme(p.id)}>Generar informe</button>
            </div>
          </div>

          {expandido === p.id && detalle && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>Antigüedad: {detalle.antiguedad_anios} años</p>
              <h4>Reseñas</h4>
              {detalle.resenas.map((r) => (
                <p key={r.id} style={{ fontSize: 13 }}>
                  <strong>{new Date(r.fecha).toLocaleDateString('es-HN')}</strong> — {r.comentario}
                </p>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  style={{ flex: 1 }}
                  placeholder="Nueva observación..."
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                />
                <button onClick={() => agregarResena(p.id)}>Agregar</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

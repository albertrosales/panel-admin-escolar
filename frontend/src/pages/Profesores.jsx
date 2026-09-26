import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, resolverUrlArchivo } from '../api';

const COLEGIO_ID = 1;

export default function Profesores() {
  const [profesores, setProfesores] = useState([]);
  const [expandido, setExpandido] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [comentario, setComentario] = useState('');
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);

  function cargarLista() {
    api.profesores.listar({ colegio_id: COLEGIO_ID }).then(setProfesores);
  }
  useEffect(cargarLista, []);

  async function abrir(id) {
    if (expandido === id) { setExpandido(null); setEditando(false); return; }
    const d = await api.profesores.detalle(id);
    setDetalle(d);
    setForm({
      nombre_completo: d.nombre_completo || '',
      correo: d.correo || '',
      telefono: d.telefono || '',
      direccion: d.direccion || '',
      fecha_nacimiento: d.fecha_nacimiento ? d.fecha_nacimiento.slice(0, 10) : '',
      identidad: d.identidad || '',
      es_extranjero: !!d.es_extranjero
    });
    setExpandido(id);
    setEditando(false);
  }

  async function agregarResena(id) {
    if (!comentario.trim()) return;
    await api.profesores.agregarResena(id, { autor: 'Dirección', comentario });
    setComentario('');
    abrir(id);
  }

  async function generarInforme(id) {
    const doc = await api.reportes.informeDocente(id);
    window.open(resolverUrlArchivo(doc.archivo_url), '_blank');
  }

  async function guardarEdicion(id) {
    setGuardando(true);
    try {
      await api.profesores.actualizar(id, form);
      setEditando(false);
      cargarLista();
      const d = await api.profesores.detalle(id);
      setDetalle(d);
    } finally {
      setGuardando(false);
    }
  }

  async function darDeBaja(id) {
    setGuardando(true);
    try {
      await api.profesores.darDeBaja(id, '');
      cargarLista();
      const d = await api.profesores.detalle(id);
      setDetalle(d);
    } finally {
      setGuardando(false);
    }
  }

  async function reactivar(id) {
    setGuardando(true);
    try {
      await api.profesores.reactivar(id);
      cargarLista();
      const d = await api.profesores.detalle(id);
      setDetalle(d);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="!mb-0">Profesores</h2>
        <Link to="/profesores/nuevo"><button>+ Nuevo profesor</button></Link>
      </div>
      {profesores.map((p) => (
        <div className="card" key={p.id}>
          <div className="flex justify-between items-center">
            <div>
              <strong>{p.nombre_completo}</strong>
              {!p.activo && <span className="badge badge-rojo ml-2">Baja</span>}
              {p.es_extranjero && <span className="badge badge-amarillo ml-2">Extranjero</span>}
              <div className="text-sm text-gray-500">{(p.materias || []).join(', ')}</div>
            </div>
            <div className="flex gap-2">
              <button className="secondary" onClick={() => abrir(p.id)}>
                {expandido === p.id ? 'Ocultar' : 'Ver detalle'}
              </button>
              <button onClick={() => generarInforme(p.id)}>Generar informe</button>
            </div>
          </div>

          {expandido === p.id && detalle && form && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <div className="flex justify-end gap-2 mb-3">
                {!editando && <button className="secondary" onClick={() => setEditando(true)}>Editar</button>}
                {detalle.activo ? (
                  <button className="secondary text-red-600" onClick={() => darDeBaja(p.id)} disabled={guardando}>Dar de baja</button>
                ) : (
                  <button onClick={() => reactivar(p.id)} disabled={guardando}>Reactivar</button>
                )}
              </div>

              {!editando ? (
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
                  <p><span className="text-gray-500">Antigüedad:</span> {detalle.antiguedad_anios} años</p>
                  <p><span className="text-gray-500">Correo:</span> {detalle.correo || '—'}</p>
                  <p><span className="text-gray-500">Teléfono:</span> {detalle.telefono || '—'}</p>
                  <p><span className="text-gray-500">Fecha de nacimiento:</span> {detalle.fecha_nacimiento ? new Date(detalle.fecha_nacimiento).toLocaleDateString('es-HN') : '—'}</p>
                  <p><span className="text-gray-500">Dirección:</span> {detalle.direccion || '—'}</p>
                  <p><span className="text-gray-500">Identidad:</span> {detalle.identidad || '—'}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 max-w-lg mb-4">
                  <label>
                    Nombre completo
                    <input value={form.nombre_completo} onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })} />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label>
                      Correo
                      <input value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} />
                    </label>
                    <label>
                      Teléfono
                      <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
                    </label>
                  </div>
                  <label>
                    Dirección
                    <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
                  </label>
                  <div className="grid grid-cols-2 gap-3 items-end">
                    <label>
                      Fecha de nacimiento
                      <input type="date" value={form.fecha_nacimiento} onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })} />
                    </label>
                    <label>
                      Identidad
                      <input value={form.identidad} onChange={(e) => setForm({ ...form, identidad: e.target.value })} />
                    </label>
                  </div>
                  <label className="flex-row items-center gap-2 !flex-row">
                    <input type="checkbox" className="w-auto" checked={form.es_extranjero} onChange={(e) => setForm({ ...form, es_extranjero: e.target.checked })} />
                    Extranjero
                  </label>
                  <div className="flex gap-2">
                    <button onClick={() => guardarEdicion(p.id)} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar cambios'}</button>
                    <button className="secondary" onClick={() => setEditando(false)}>Cancelar</button>
                  </div>
                </div>
              )}

              <h4>Clases que imparte</h4>
              {detalle.asignaciones.length === 0 && (
                <p className="text-sm text-gray-500">Sin clases asignadas.</p>
              )}
              <ul>
                {detalle.asignaciones.map((a) => (
                  <li key={a.id} className="text-sm">{a.grado_nombre} — {a.materia}</li>
                ))}
              </ul>

              <h4 className="mt-3">Reseñas</h4>
              {detalle.resenas.map((r) => (
                <p key={r.id} className="text-sm">
                  <strong>{new Date(r.fecha).toLocaleDateString('es-HN')}</strong> — {r.comentario}
                </p>
              ))}
              <div className="flex gap-2 mt-2">
                <input
                  className="flex-1"
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

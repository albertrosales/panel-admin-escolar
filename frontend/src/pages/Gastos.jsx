import { useEffect, useState } from 'react';
import { api } from '../api';

const L = (n) => 'L. ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hoy = () => new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
const VACIO = () => ({ fecha: hoy(), categoria: '', otra: '', descripcion: '', monto: '', proveedor: '', metodo: 'Efectivo', referencia: '', nota: '' });
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesTxt = (m) => MESES[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);

export default function Gastos() {
  const [cat, setCat] = useState({ categorias: [], metodos: [] });
  const [datos, setDatos] = useState({ gastos: [], total: 0, por_categoria: [], por_mes: [] });
  const [filtro, setFiltro] = useState({ desde: hoy().slice(0, 8) + '01', hasta: '', categoria: '', q: '' });
  const [f, setF] = useState(VACIO());
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(false);
  const [gestCat, setGestCat] = useState(false);
  const [nueva, setNueva] = useState('');
  const [msg, setMsg] = useState('');

  const cargar = (fl = filtro) => api.gastos.listar(Object.fromEntries(Object.entries(fl).filter(([, v]) => v))).then(setDatos).catch((e) => setMsg(e.message));
  const cargarCat = () => api.gastos.categorias().then(setCat).catch((e) => setMsg(e.message));
  useEffect(() => { cargarCat(); cargar(); }, []);

  const setK = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const esOtra = f.categoria === '__otra';

  function nuevoGasto() { setEditando(null); setF(VACIO()); setForm(true); setMsg(''); }
  function editar(g) {
    setEditando(g.id); setMsg(''); setForm(true);
    setF({ fecha: g.fecha, categoria: cat.categorias.some((c) => c.nombre === g.categoria) ? g.categoria : '__otra', otra: g.categoria, descripcion: g.descripcion, monto: String(g.monto), proveedor: g.proveedor || '', metodo: g.metodo || 'Efectivo', referencia: g.referencia || '', nota: g.nota || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function guardar(e) {
    e.preventDefault(); setMsg('');
    const datosEnvio = { ...f, categoria: esOtra ? f.otra : f.categoria };
    try {
      if (editando) await api.gastos.editar(editando, datosEnvio); else await api.gastos.crear(datosEnvio);
      setForm(false); setEditando(null); setF(VACIO()); setMsg('Gasto guardado.'); cargar(); cargarCat();
    } catch (err) { setMsg(err.message); }
  }
  async function borrar(g) {
    if (!window.confirm(`¿Eliminar el gasto "${g.descripcion}" por ${L(g.monto)}?`)) return;
    try { await api.gastos.borrar(g.id); cargar(); } catch (err) { setMsg(err.message); }
  }
  async function agregarCat(e) {
    e.preventDefault(); if (!nueva.trim()) return;
    try { await api.gastos.crearCategoria(nueva); setNueva(''); cargarCat(); } catch (err) { setMsg(err.message); }
  }
  async function quitarCat(c) {
    if (!window.confirm(`¿Quitar la categoría "${c.nombre}" de la lista? Los gastos ya registrados no se borran.`)) return;
    await api.gastos.borrarCategoria(c.id); cargarCat();
  }
  function exportar() {
    const filas = [['Fecha', 'Categoría', 'Descripción', 'Monto', 'Proveedor', 'Método', 'Referencia', 'Nota']]
      .concat(datos.gastos.map((g) => [g.fecha, g.categoria, g.descripcion, g.monto.toFixed(2), g.proveedor || '', g.metodo || '', g.referencia || '', g.nota || '']));
    const csv = '﻿' + filas.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'gastos-' + hoy() + '.csv'; a.click();
  }
  const buscar = (e) => { e.preventDefault(); cargar(); };
  const setFl = (k) => (e) => setFiltro({ ...filtro, [k]: e.target.value });
  const maxCat = Math.max(1, ...datos.por_categoria.map((c) => c.total));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="!mb-0">Gastos</h2>
        <div className="flex gap-2">
          <button className="secondary" onClick={() => setGestCat(!gestCat)}>Categorías</button>
          <button className="secondary" onClick={exportar} disabled={!datos.gastos.length}>Exportar Excel (CSV)</button>
          <button onClick={nuevoGasto}>+ Registrar gasto</button>
        </div>
      </div>
      {msg && <p className="text-sm text-gray-600 mb-2">{msg}</p>}

      {gestCat && (
        <div className="card">
          <h3>Categorías de gasto</h3>
          <p className="text-sm text-gray-500 mb-2">Estas son las opciones que aparecen al registrar un gasto. Agrega las que necesites; también puedes escribir una distinta directamente al registrar.</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {cat.categorias.map((c) => <span key={c.id} className="badge">{c.nombre} <button type="button" className="!bg-transparent !text-red-600 !p-0 !ml-1" title="Quitar" onClick={() => quitarCat(c)}>×</button></span>)}
          </div>
          <form onSubmit={agregarCat} className="flex gap-2 max-w-md">
            <input value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Nueva categoría..." />
            <button type="submit">Agregar</button>
          </form>
        </div>
      )}

      {form && (
        <form onSubmit={guardar} className="card">
          <h3>{editando ? 'Editar gasto' : 'Registrar gasto'}</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <label>Fecha<input type="date" value={f.fecha} onChange={setK('fecha')} required /></label>
            <label>Monto (L.)<input type="number" step="0.01" min="0.01" value={f.monto} onChange={setK('monto')} required /></label>
            <label>Categoría
              <select value={f.categoria} onChange={setK('categoria')} required>
                <option value="">Selecciona...</option>
                {cat.categorias.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                <option value="__otra">✍️ Otra (la escribo yo)</option>
              </select>
            </label>
            {esOtra && <label>Nombre de la categoría<input value={f.otra} onChange={setK('otra')} placeholder="Ej. Regalos para docentes" required /></label>}
            <label className="sm:col-span-2">¿En qué se gastó? (escribe lo que quieras)
              <input value={f.descripcion} onChange={setK('descripcion')} placeholder="Ej. Almuerzo de la reunión con padres de 7.º grado" required />
            </label>
            <label>Proveedor o a quién se pagó (opcional)<input value={f.proveedor} onChange={setK('proveedor')} /></label>
            <label>Método de pago
              <select value={f.metodo} onChange={setK('metodo')}>{cat.metodos.map((m) => <option key={m}>{m}</option>)}</select>
            </label>
            <label>N.º de factura o recibo (opcional)<input value={f.referencia} onChange={setK('referencia')} /></label>
            <label className="sm:col-span-2">Nota (opcional)<textarea rows="2" value={f.nota} onChange={setK('nota')} /></label>
          </div>
          <div className="flex gap-2 mt-3">
            <button type="submit">{editando ? 'Guardar cambios' : 'Guardar gasto'}</button>
            <button type="button" className="secondary" onClick={() => { setForm(false); setEditando(null); }}>Cancelar</button>
          </div>
        </form>
      )}

      <form onSubmit={buscar} className="card flex flex-wrap items-end gap-3">
        <label>Desde<input type="date" value={filtro.desde} onChange={setFl('desde')} /></label>
        <label>Hasta<input type="date" value={filtro.hasta} onChange={setFl('hasta')} /></label>
        <label>Categoría<select value={filtro.categoria} onChange={setFl('categoria')}><option value="">Todas</option>{cat.categorias.map((c) => <option key={c.id}>{c.nombre}</option>)}</select></label>
        <label>Buscar<input value={filtro.q} onChange={setFl('q')} placeholder="texto, proveedor..." /></label>
        <button type="submit">Filtrar</button>
      </form>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="card">
          <p className="text-sm text-gray-500">Total del período</p>
          <p className="text-3xl font-semibold">{L(datos.total)}</p>
          <p className="text-xs text-gray-500 mt-1">{datos.gastos.length} gasto(s)</p>
          {datos.por_mes.length > 1 && (
            <div className="mt-3 text-sm">{datos.por_mes.map((m) => <div key={m.mes} className="flex justify-between"><span>{mesTxt(m.mes)}</span><span>{L(m.total)}</span></div>)}</div>
          )}
        </div>
        <div className="card">
          <h3>Por categoría</h3>
          {datos.por_categoria.length === 0 && <p className="text-sm text-gray-500">Sin gastos en este período.</p>}
          {datos.por_categoria.map((c) => (
            <div key={c.categoria} className="mb-2 text-sm">
              <div className="flex justify-between"><span>{c.categoria}</span><span>{L(c.total)}</span></div>
              <div className="h-1.5 bg-gray-100 rounded"><div className="h-1.5 rounded bg-blue-500" style={{ width: (c.total / maxCat) * 100 + '%' }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table>
          <thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Proveedor</th><th>Método</th><th className="text-right">Monto</th><th></th></tr></thead>
          <tbody>
            {datos.gastos.map((g) => (
              <tr key={g.id}>
                <td className="whitespace-nowrap">{g.fecha}</td><td>{g.categoria}</td>
                <td>{g.descripcion}{g.nota && <div className="text-xs text-gray-500">{g.nota}</div>}</td>
                <td>{g.proveedor || '—'}{g.referencia && <div className="text-xs text-gray-500">Doc. {g.referencia}</div>}</td>
                <td>{g.metodo || '—'}</td><td className="text-right whitespace-nowrap">{L(g.monto)}</td>
                <td className="whitespace-nowrap"><button className="secondary" onClick={() => editar(g)}>Editar</button> <button className="secondary" onClick={() => borrar(g)}>Eliminar</button></td>
              </tr>
            ))}
            {!datos.gastos.length && <tr><td colSpan="7" className="text-center text-gray-500 py-6">Aún no hay gastos en este período. Usa "Registrar gasto".</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const express = require('express');
const router = express.Router();
const pool = require('../db');

const CATEGORIAS_BASE = ['Almuerzo', 'Alimentación en reuniones', 'Refrigerios y eventos', 'Papelería y útiles', 'Material didáctico', 'Limpieza',
  'Mantenimiento y reparaciones', 'Servicios (agua, luz, internet)', 'Transporte', 'Publicidad y promoción', 'Salarios y honorarios', 'Equipo y tecnología', 'Otros'];
const METODOS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque', 'Otro'];

// Solo dirección y administración ven y registran gastos
router.use((req, res, next) => {
  if (!['admin', 'director', 'superadmin'].includes(req.usuario.rol)) return res.status(403).json({ error: 'Solo dirección y administración pueden ver los gastos' });
  next();
});

async function categorias(colegioId) {
  let { rows } = await pool.query('SELECT id, nombre FROM gasto_categorias WHERE colegio_id = $1 ORDER BY nombre', [colegioId]);
  if (!rows.length) { // primera vez: se cargan las categorías predeterminadas
    for (const n of CATEGORIAS_BASE) await pool.query('INSERT INTO gasto_categorias (colegio_id, nombre) VALUES ($1,$2) ON CONFLICT DO NOTHING', [colegioId, n]);
    rows = (await pool.query('SELECT id, nombre FROM gasto_categorias WHERE colegio_id = $1 ORDER BY nombre', [colegioId])).rows;
  }
  return rows;
}

const limpio = (v, max) => { const t = String(v == null ? '' : v).trim(); return t ? t.slice(0, max) : null; };
function validar(b) {
  const monto = Number(b.monto);
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '') ? b.fecha : null;
  const categoria = limpio(b.categoria, 80), descripcion = limpio(b.descripcion, 500);
  if (!fecha) return { error: 'La fecha es obligatoria' };
  if (!categoria) return { error: 'Elige o escribe una categoría' };
  if (!descripcion) return { error: 'Escribe qué se compró o pagó' };
  if (!(monto > 0)) return { error: 'El monto debe ser mayor que cero' };
  return { v: { fecha, categoria, descripcion, monto: Math.round(monto * 100) / 100, proveedor: limpio(b.proveedor, 150), metodo: limpio(b.metodo, 30), referencia: limpio(b.referencia, 80), nota: limpio(b.nota, 1000) } };
}
// Si la categoría es nueva (escrita por el director), queda disponible para la próxima vez
async function recordarCategoria(colegioId, nombre) {
  await categorias(colegioId);
  await pool.query('INSERT INTO gasto_categorias (colegio_id, nombre) VALUES ($1,$2) ON CONFLICT DO NOTHING', [colegioId, nombre]);
}

router.get('/categorias', async (req, res) => {
  try { res.json({ categorias: await categorias(req.colegioId), metodos: METODOS }); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/categorias', async (req, res) => {
  try {
    const n = limpio(req.body.nombre, 80);
    if (!n) return res.status(400).json({ error: 'Escribe el nombre de la categoría' });
    await recordarCategoria(req.colegioId, n);
    res.status(201).json({ categorias: await categorias(req.colegioId) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/categorias/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM gasto_categorias WHERE id = $1 AND colegio_id = $2', [req.params.id, req.colegioId]); // los gastos ya registrados conservan su categoría
    res.json({ categorias: await categorias(req.colegioId) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function filtros(req) {
  const w = ['colegio_id = $1']; const p = [req.colegioId];
  const q = req.query;
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.desde || '')) { p.push(q.desde); w.push('fecha >= $' + p.length); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.hasta || '')) { p.push(q.hasta); w.push('fecha <= $' + p.length); }
  if (q.categoria) { p.push(q.categoria); w.push('categoria = $' + p.length); }
  if (q.q) { p.push('%' + q.q + '%'); w.push(`(descripcion ILIKE $${p.length} OR proveedor ILIKE $${p.length} OR nota ILIKE $${p.length})`); }
  return { where: w.join(' AND '), p };
}

router.get('/', async (req, res) => {
  try {
    const { where, p } = filtros(req);
    const { rows } = await pool.query(`SELECT id, to_char(fecha,'YYYY-MM-DD') AS fecha, categoria, descripcion, monto::float AS monto, proveedor, metodo, referencia, nota, registrado_por
      FROM gastos WHERE ${where} ORDER BY fecha DESC, id DESC LIMIT 1000`, p);
    const porCat = (await pool.query(`SELECT categoria, SUM(monto)::float AS total, COUNT(*)::int AS cantidad FROM gastos WHERE ${where} GROUP BY categoria ORDER BY total DESC`, p)).rows;
    const porMes = (await pool.query(`SELECT to_char(fecha,'YYYY-MM') AS mes, SUM(monto)::float AS total FROM gastos WHERE ${where} GROUP BY 1 ORDER BY 1`, p)).rows;
    res.json({ gastos: rows, total: rows.reduce((a, g) => a + g.monto, 0), por_categoria: porCat, por_mes: porMes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const r = validar(req.body); if (r.error) return res.status(400).json({ error: r.error });
    const v = r.v;
    await recordarCategoria(req.colegioId, v.categoria);
    const { rows: [g] } = await pool.query(
      `INSERT INTO gastos (colegio_id, fecha, categoria, descripcion, monto, proveedor, metodo, referencia, nota, registrado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [req.colegioId, v.fecha, v.categoria, v.descripcion, v.monto, v.proveedor, v.metodo, v.referencia, v.nota, req.usuario.correo]);
    res.status(201).json({ id: g.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const r = validar(req.body); if (r.error) return res.status(400).json({ error: r.error });
    const v = r.v;
    await recordarCategoria(req.colegioId, v.categoria);
    const u = await pool.query(
      `UPDATE gastos SET fecha=$3, categoria=$4, descripcion=$5, monto=$6, proveedor=$7, metodo=$8, referencia=$9, nota=$10, actualizado_en=NOW() WHERE id=$1 AND colegio_id=$2`,
      [req.params.id, req.colegioId, v.fecha, v.categoria, v.descripcion, v.monto, v.proveedor, v.metodo, v.referencia, v.nota]);
    if (!u.rowCount) return res.status(404).json({ error: 'Gasto no encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const d = await pool.query('DELETE FROM gastos WHERE id = $1 AND colegio_id = $2', [req.params.id, req.colegioId]);
    if (!d.rowCount) return res.status(404).json({ error: 'Gasto no encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../db');

const ymd = (d) => new Date(d).toISOString().slice(0, 10);

// Resumen del mes: días con marcas
router.get('/', async (req, res) => {
  try {
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : new Date().toISOString().slice(0, 7);
    const ini = mes + '-01';
    const c = req.colegioId;
    const rango = `>= $2::date AND fecha < ($2::date + interval '1 month')`;
    const [ev, hi, pv, col] = await Promise.all([
      pool.query(`SELECT fecha::date AS d, COUNT(*)::int n FROM eventos WHERE colegio_id=$1 AND fecha ${rango} GROUP BY 1`, [c, ini]),
      pool.query(`SELECT h.fecha::date AS d, COUNT(*)::int n FROM alumno_historial h JOIN alumnos a ON a.id=h.alumno_id
                  WHERE a.colegio_id=$1 AND h.fecha::date ${rango.replace('fecha', 'h.fecha::date')} GROUP BY 1`, [c, ini]),
      pool.query(`SELECT p.fecha_vencimiento::date AS d, COUNT(*)::int n FROM pagos p JOIN alumnos a ON a.id=p.alumno_id
                  WHERE a.colegio_id=$1 AND p.fecha_vencimiento ${rango.replace('fecha', 'p.fecha_vencimiento')} GROUP BY 1`, [c, ini]),
      pool.query('SELECT dia_pago_mensual FROM colegios WHERE id=$1', [c])
    ]);
    const dias = {};
    const marca = (rows, k) => rows.forEach((r) => { const f = ymd(r.d); (dias[f] = dias[f] || {})[k] = r.n; });
    marca(ev.rows, 'eventos'); marca(hi.rows, 'actividad'); marca(pv.rows, 'vencimientos');
    res.json({ mes, dia_pago: col.rows[0] ? col.rows[0].dia_pago_mensual || 5 : 5, dias });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Detalle de un día
router.get('/dia', async (req, res) => {
  try {
    const f = req.query.fecha;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f || '')) return res.status(400).json({ error: 'Fecha inválida' });
    const c = req.colegioId;
    const [ev, hi, pv, pg] = await Promise.all([
      pool.query('SELECT id, titulo, tipo, descripcion FROM eventos WHERE colegio_id=$1 AND fecha=$2 ORDER BY id', [c, f]),
      pool.query(`SELECT h.tipo, h.descripcion, h.fecha, a.id alumno_id, a.nombre_completo FROM alumno_historial h
                  JOIN alumnos a ON a.id=h.alumno_id WHERE a.colegio_id=$1 AND h.fecha::date=$2 ORDER BY h.fecha DESC LIMIT 100`, [c, f]),
      pool.query(`SELECT a.id alumno_id, a.nombre_completo, p.monto, p.recargo, p.pagado FROM pagos p JOIN alumnos a ON a.id=p.alumno_id
                  WHERE a.colegio_id=$1 AND p.fecha_vencimiento=$2 ORDER BY a.nombre_completo LIMIT 200`, [c, f]),
      pool.query(`SELECT a.id alumno_id, a.nombre_completo, p.monto, p.metodo_pago FROM pagos p JOIN alumnos a ON a.id=p.alumno_id
                  WHERE a.colegio_id=$1 AND p.fecha_pago=$2 ORDER BY a.nombre_completo LIMIT 200`, [c, f])
    ]);
    res.json({ eventos: ev.rows, actividad: hi.rows, vencimientos: pv.rows, pagados: pg.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { fecha, titulo, tipo, descripcion } = req.body;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '') || !(titulo || '').trim()) return res.status(400).json({ error: 'Fecha y título requeridos' });
    const t = ['evento', 'recordatorio', 'cobro'].includes(tipo) ? tipo : 'evento';
    const r = await pool.query('INSERT INTO eventos (colegio_id, fecha, titulo, tipo, descripcion) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.colegioId, fecha, titulo.trim(), t, descripcion || null]);
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    await pool.query('DELETE FROM eventos WHERE id=$1 AND colegio_id=$2', [req.params.id, req.colegioId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../db');

// Búsqueda global: alumnos, profesores y boletos del colegio de quien pregunta
router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (q.length < 2) return res.json({ alumnos: [], profesores: [], boletos: [] });
    const like = '%' + q.replace(/[%_\\]/g, '\\$&') + '%';
    const [al, pr, bo] = await Promise.all([
      pool.query(
        `SELECT id, nombre_completo, codigo, estado_pago, activo, nombre_encargado FROM alumnos
         WHERE colegio_id = $1 AND (nombre_completo ILIKE $2 OR codigo ILIKE $2 OR identidad ILIKE $2 OR nombre_encargado ILIKE $2 OR correo_encargado ILIKE $2)
         ORDER BY activo DESC, nombre_completo LIMIT 6`, [req.colegioId, like]),
      pool.query(
        `SELECT id, nombre_completo FROM profesores WHERE colegio_id = $1 AND nombre_completo ILIKE $2 ORDER BY nombre_completo LIMIT 4`, [req.colegioId, like]),
      pool.query(
        `SELECT b.id, b.codigo, b.comprador, b.estado, e.nombre AS evento, e.id AS evento_id FROM boletos b JOIN eventos_entrada e ON e.id = b.evento_id
         WHERE b.colegio_id = $1 AND b.estado <> 'anulado' AND (b.codigo ILIKE $2 OR b.comprador ILIKE $2 OR b.correo ILIKE $2) ORDER BY b.id DESC LIMIT 4`, [req.colegioId, like])
    ]);
    res.json({ alumnos: al.rows, profesores: pr.rows, boletos: bo.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

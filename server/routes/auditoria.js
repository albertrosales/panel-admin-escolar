const express = require('express');
const router = express.Router();
const pool = require('../db');
const { esProveedor } = require('../services/licencias');

router.get('/', async (req, res) => {
  try {
    if (!['admin', 'director', 'superadmin'].includes(req.usuario.rol)) return res.status(403).json({ error: 'Solo dirección o administración puede ver la auditoría' });
    const q = req.query; const v = []; const w = [];
    const prov = esProveedor(req.usuario);
    if (prov && q.colegio_id === 'todos') { /* sin filtro de colegio */ }
    else { v.push(prov && q.colegio_id ? Number(q.colegio_id) : req.colegioId); w.push(`colegio_id = $${v.length}`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.desde || '')) { v.push(q.desde); w.push(`creado_en >= $${v.length}::date`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.hasta || '')) { v.push(q.hasta); w.push(`creado_en < ($${v.length}::date + 1)`); }
    if (q.usuario) { v.push('%' + q.usuario + '%'); w.push(`usuario ILIKE $${v.length}`); }
    if (q.entidad) { v.push(q.entidad); w.push(`entidad = $${v.length}`); }
    if (q.q) { v.push('%' + q.q + '%'); w.push(`(accion ILIKE $${v.length} OR ruta ILIKE $${v.length} OR detalle::text ILIKE $${v.length})`); }
    const limite = Math.min(parseInt(q.limite, 10) || 100, 500);
    const off = Math.max(parseInt(q.offset, 10) || 0, 0);
    const { rows } = await pool.query(
      `SELECT id, colegio_id, usuario, rol, soporte, accion, metodo, ruta, entidad, entidad_id, detalle, ip, creado_en, COUNT(*) OVER()::int AS total
       FROM auditoria ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY creado_en DESC, id DESC LIMIT ${limite} OFFSET ${off}`, v);
    res.json({ total: rows[0] ? rows[0].total : 0, filas: rows.map(({ total, ...r }) => r) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

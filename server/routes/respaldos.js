const express = require('express');
const router = express.Router();
const pool = require('../db');
const R = require('../services/respaldo');
const { esProveedor } = require('../services/licencias');

const permitido = (u) => ['admin', 'director', 'superadmin'].includes(u.rol);

router.get('/', async (req, res) => {
  try {
    if (!permitido(req.usuario)) return res.status(403).json({ error: 'Sin permiso' });
    const prov = esProveedor(req.usuario);
    const { rows } = await pool.query(
      `SELECT r.id, r.colegio_id, r.tipo, r.bytes, r.estado, r.error, r.creado_en FROM respaldos r
       WHERE ($1::int IS NULL OR r.colegio_id = $1) ORDER BY r.creado_en DESC LIMIT 30`, [prov && req.query.todos ? null : req.colegioId]);
    res.json({ respaldos: rows, automatico: !!process.env.BACKUP_EMAIL });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Descarga la copia de seguridad. El proveedor puede pedir cualquier colegio o todos; los demás, solo el suyo.
router.get('/exportar', async (req, res) => {
  try {
    if (!permitido(req.usuario)) return res.status(403).json({ error: 'Solo dirección o administración puede descargar copias de seguridad' });
    const prov = esProveedor(req.usuario);
    let id = req.colegioId;
    if (prov && req.query.colegio_id === 'todos') id = null;
    else if (prov && req.query.colegio_id) id = Number(req.query.colegio_id);
    const { buffer, nombre } = await R.generar(id);
    await R.registrar(id, 'descarga', buffer.length, 'ok');
    res.set({ 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="${nombre}"`, 'Content-Length': buffer.length, 'Access-Control-Expose-Headers': 'Content-Disposition' }).send(buffer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

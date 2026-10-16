const express = require('express');
const router = express.Router();
const pool = require('../db');
const { procesar } = require('../services/comprobanteService');

function soloAlumno(req, res, next) {
  if (req.portal.tipo !== 'alumno') return res.status(403).json({ error: 'Solo para alumnos' });
  next();
}
router.use(soloAlumno);

// El alumno sube su captura: el sistema le pone su propio nombre automáticamente
router.post('/', async (req, res) => {
  try {
    const { rows: [a] } = await pool.query('SELECT id, nombre_completo, colegio_id FROM alumnos WHERE id = $1 AND activo = TRUE', [req.portal.id]);
    if (!a) return res.status(403).json({ error: 'Cuenta inactiva' });
    await procesar({ colegioId: a.colegio_id, alumnoId: a.id, codigo: req.body.codigo || null, dataUrl: req.body.imagen, subidoTipo: 'alumno', subidoPor: a.nombre_completo });
    res.status(201).json({ ok: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Confirmación de identidad: muestra a quién pertenece un código (nombre completo si es el propio, abreviado si es otro)
router.get('/codigo/:codigo', async (req, res) => {
  try {
    const { rows: [yo] } = await pool.query('SELECT colegio_id FROM alumnos WHERE id = $1', [req.portal.id]);
    const r = await pool.query('SELECT id, nombre_completo FROM alumnos WHERE colegio_id = $1 AND codigo = $2 AND activo = TRUE', [yo.colegio_id, String(req.params.codigo).trim()]);
    if (!r.rows[0]) return res.status(404).json({ error: 'No existe un alumno con ese código' });
    const partes = r.rows[0].nombre_completo.trim().split(/\s+/);
    const nombre = r.rows[0].id === req.portal.id ? r.rows[0].nombre_completo
      : partes[0] + (partes.length > 1 ? ' ' + partes.slice(1).map((x) => x[0].toUpperCase() + '.').join(' ') : '');
    res.json({ nombre, propio: r.rows[0].id === req.portal.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, monto, banco, referencia, fecha_transferencia, estado, nota, creado_en FROM comprobantes WHERE alumno_id = $1 ORDER BY creado_en DESC LIMIT 30`,
      [req.portal.id]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

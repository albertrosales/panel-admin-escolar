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
    await procesar({ colegioId: a.colegio_id, alumnoId: a.id, dataUrl: req.body.imagen, subidoTipo: 'alumno', subidoPor: a.nombre_completo });
    res.status(201).json({ ok: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
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

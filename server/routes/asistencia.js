const express = require('express');
const router = express.Router();
const pool = require('../db');
const notif = require('../services/correo/notificaciones');

async function gradoOk(id, colegioId) {
  if (!/^\d+$/.test(String(id))) return false;
  const r = await pool.query('SELECT 1 FROM grados WHERE id=$1 AND colegio_id=$2', [id, colegioId]);
  return r.rows.length > 0;
}

// Lista de alumnos de una clase con su estado en una fecha
router.get('/', async (req, res) => {
  try {
    const { grado_id, fecha } = req.query;
    if (!(await gradoOk(grado_id, req.colegioId)) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return res.status(400).json({ error: 'Clase o fecha inválida' });
    const r = await pool.query(
      `SELECT a.id, a.nombre_completo, s.estado FROM matriculas m JOIN alumnos a ON a.id=m.alumno_id
       LEFT JOIN asistencia s ON s.alumno_id=a.id AND s.grado_id=m.grado_id AND s.fecha=$2
       WHERE m.grado_id=$1 AND a.activo=TRUE ORDER BY a.nombre_completo`, [grado_id, fecha]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Guardar asistencia: { grado_id, fecha, registros: [{alumno_id, estado: P|A|T|J}] }
router.post('/', async (req, res) => {
  try {
    const { grado_id, fecha, registros } = req.body;
    if (!(await gradoOk(grado_id, req.colegioId)) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha || '') || !Array.isArray(registros)) return res.status(400).json({ error: 'Datos inválidos' });
    let n = 0;
    const guardados = [];
    for (const r of registros) {
      if (!['P', 'A', 'T', 'J'].includes(r.estado) || !/^\d+$/.test(String(r.alumno_id))) continue;
      const ok = await pool.query('SELECT 1 FROM alumnos WHERE id=$1 AND colegio_id=$2', [r.alumno_id, req.colegioId]);
      if (!ok.rows.length) continue;
      await pool.query(
        `INSERT INTO asistencia (colegio_id, alumno_id, grado_id, fecha, estado) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (alumno_id, grado_id, fecha) DO UPDATE SET estado = EXCLUDED.estado`,
        [req.colegioId, r.alumno_id, grado_id, fecha, r.estado]);
      n++;
      guardados.push({ alumno_id: Number(r.alumno_id), estado: r.estado });
    }
    notif.asistencia(req.colegioId, fecha, guardados);
    res.json({ guardados: n });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Resumen de un alumno
router.get('/alumno/:id', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const r = await pool.query(
      `SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE estado='P')::int presentes, COUNT(*) FILTER (WHERE estado='A')::int ausentes,
              COUNT(*) FILTER (WHERE estado='T')::int tardes, COUNT(*) FILTER (WHERE estado='J')::int justificadas
       FROM asistencia WHERE alumno_id=$1 AND colegio_id=$2`, [req.params.id, req.colegioId]);
    const x = r.rows[0];
    x.porcentaje = x.total ? Math.round(((x.presentes + x.tardes + x.justificadas) / x.total) * 100) : null;
    res.json(x);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

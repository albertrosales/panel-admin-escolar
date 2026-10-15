const express = require('express');
const router = express.Router();
const pool = require('../db');
const { buildClient } = require('../services/moodleService');
const { generarBoletin } = require('../services/boletinService');

// Nota (%) por clase desde Moodle
async function notasAlumno(alumnoId, colegioId) {
  const { rows: [a] } = await pool.query(
    'SELECT a.moodle_user_id, c.moodle_url, c.moodle_token FROM alumnos a JOIN colegios c ON c.id=a.colegio_id WHERE a.id=$1 AND a.colegio_id=$2',
    [alumnoId, colegioId]);
  if (!a) return null;
  const { rows: clases } = await pool.query(
    'SELECT g.nombre, g.moodle_category_id AS curso FROM matriculas m JOIN grados g ON g.id=m.grado_id WHERE m.alumno_id=$1 ORDER BY g.nombre', [alumnoId]);
  if (!a.moodle_user_id) return clases.map((c) => ({ clase: c.nombre, porcentaje: null }));
  const call = buildClient(a.moodle_url, a.moodle_token);
  const out = [];
  for (const c of clases) {
    let pct = null;
    if (c.curso) {
      try {
        const r = await call('gradereport_user_get_grade_items', { courseid: c.curso, userid: a.moodle_user_id });
        const items = (r.usergrades && r.usergrades[0] && r.usergrades[0].gradeitems) || [];
        const total = items.find((i) => i.itemtype === 'course');
        if (total) {
          if (total.graderaw != null && total.grademax) pct = (total.graderaw / total.grademax) * 100;
          else {
            const m = String(total.percentageformatted || '').replace(',', '.').match(/[\d.]+/);
            if (m) pct = parseFloat(m[0]);
          }
        }
      } catch (e) { pct = null; }
    }
    out.push({ clase: c.nombre, porcentaje: pct == null ? null : Math.round(pct * 10) / 10 });
  }
  return out;
}

router.get('/alumno/:id', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const n = await notasAlumno(req.params.id, req.colegioId);
    if (!n) return res.status(404).json({ error: 'Alumno no encontrado' });
    res.json(n);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/boletin/:id', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const n = await notasAlumno(req.params.id, req.colegioId);
    if (!n) return res.status(404).json({ error: 'Alumno no encontrado' });
    res.json(await generarBoletin(req.params.id, req.colegioId, n));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

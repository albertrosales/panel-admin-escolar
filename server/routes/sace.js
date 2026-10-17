const express = require('express');
const pool = require('../db');
const S = require('../services/sace');

// modo 'admin' (panel) o 'portal' (docente: solo sus clases)
module.exports = function (modo) {
  const router = express.Router();
  const colegioDe = (req) => (modo === 'portal' ? req.portal.colegio_id : req.colegioId);

  router.use((req, res, next) => {
    if (modo === 'portal' && req.portal.tipo !== 'profesor') return res.status(403).json({ error: 'Solo para docentes' });
    next();
  });

  async function claseOk(req, res, next) {
    if (!/^\d+$/.test(req.params.gradoId)) return res.status(400).json({ error: 'Clase inválida' });
    const args = [req.params.gradoId, colegioDe(req)];
    let q = 'SELECT 1 FROM grados WHERE id=$1 AND colegio_id=$2';
    if (modo === 'portal') { q += ' AND EXISTS (SELECT 1 FROM profesor_grado_materia WHERE grado_id=$1 AND profesor_id=$3)'; args.push(req.portal.id); }
    if (!(await pool.query(q, args)).rows.length) return res.status(404).json({ error: 'Clase no encontrada' });
    next();
  }
  const fallo = (res, e) => res.status(e.status || 500).json({ error: e.message });

  router.get('/clases', async (req, res) => {
    try {
      const args = [colegioDe(req)]; let filtro = '';
      if (modo === 'portal') { filtro = 'AND pgm.profesor_id=$2'; args.push(req.portal.id); }
      const { rows } = await pool.query(
        `SELECT g.id, g.nombre, g.seccion, pgm.materia, p.nombre_completo AS profesor,
           COALESCE((SELECT json_agg(json_build_object('parcial', s.parcial, 'inicio', s.inicio::text, 'fin', s.fin::text) ORDER BY s.parcial) FROM sace_parciales s WHERE s.grado_id=g.id), '[]') AS parciales
         FROM grados g LEFT JOIN profesor_grado_materia pgm ON pgm.grado_id=g.id LEFT JOIN profesores p ON p.id=pgm.profesor_id
         WHERE g.colegio_id=$1 ${filtro} ORDER BY g.seccion NULLS LAST, g.nombre`, args);
      res.json(rows);
    } catch (e) { fallo(res, e); }
  });

  // Fechas de cada parcial según el docente: [{parcial:1, inicio:'2026-02-01', fin:'2026-03-03'}]
  router.put('/:gradoId/parciales', claseOk, async (req, res) => {
    try {
      const lista = Array.isArray(req.body.parciales) ? req.body.parciales : [];
      const re = /^\d{4}-\d{2}-\d{2}$/;
      for (const p of lista) {
        if (![1, 2, 3, 4].includes(Number(p.parcial)) || !re.test(p.inicio || '') || !re.test(p.fin || '') || p.fin < p.inicio)
          return res.status(400).json({ error: `Fechas inválidas en el parcial ${p.parcial}` });
      }
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('DELETE FROM sace_parciales WHERE grado_id=$1', [req.params.gradoId]);
        for (const p of lista) await c.query('INSERT INTO sace_parciales (grado_id, parcial, inicio, fin) VALUES ($1,$2,$3,$4)', [req.params.gradoId, p.parcial, p.inicio, p.fin]);
        await c.query('COMMIT');
      } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
      res.json({ ok: true });
    } catch (e) { fallo(res, e); }
  });

  router.get('/:gradoId/datos', claseOk, async (req, res) => {
    try { res.json(await S.datosClase(colegioDe(req), req.params.gradoId, { justificadas: req.query.justificadas !== '0' })); } catch (e) { fallo(res, e); }
  });

  // Descarga el .xls con lo que el docente revisó/corrigió en pantalla
  router.post('/:gradoId/xls', claseOk, async (req, res) => {
    try {
      const d = req.body;
      if (!d || !d.encabezado || !Array.isArray(d.alumnos)) return res.status(400).json({ error: 'Datos incompletos' });
      if (d.encabezado.grado !== undefined) await pool.query('UPDATE grados SET sace_grado=$1 WHERE id=$2', [String(d.encabezado.grado).slice(0, 120) || null, req.params.gradoId]);
      const buf = S.generarXls(d);
      res.set({ 'Content-Type': 'application/vnd.ms-excel', 'Content-Disposition': `attachment; filename="SACE_${req.params.gradoId}.xls"`, 'Access-Control-Expose-Headers': 'Content-Disposition' }).send(buf);
    } catch (e) { fallo(res, e); }
  });

  if (modo === 'admin') {
    router.get('/config', async (req, res) => {
      const { rows: [c] } = await pool.query('SELECT sace_codigo, sace_centro, sace_modalidad, sace_jornada, nombre FROM colegios WHERE id=$1', [req.colegioId]);
      res.json(c);
    });
    router.put('/config', async (req, res) => {
      try {
        const b = req.body, v = (k, n) => String(b[k] || '').trim().slice(0, n) || null;
        await pool.query('UPDATE colegios SET sace_codigo=$1, sace_centro=$2, sace_modalidad=$3, sace_jornada=$4 WHERE id=$5',
          [v('sace_codigo', 40), v('sace_centro', 150), v('sace_modalidad', 150), v('sace_jornada', 60), req.colegioId]);
        require('../services/licencias').limpiarCache();
        res.json({ ok: true });
      } catch (e) { fallo(res, e); }
    });
  }
  return router;
};

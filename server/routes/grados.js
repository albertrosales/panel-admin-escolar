const express = require('express');
const router = express.Router();
const pool = require('../db');
const { getCategories, createCourse } = require('../services/moodleService');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM grados WHERE colegio_id = $1 ORDER BY nombre',
      [req.colegioId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Secciones (grado + letra) con el número de clases de cada una
router.get('/secciones', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT seccion, COUNT(*)::int AS clases FROM grados WHERE colegio_id = $1 AND seccion IS NOT NULL AND seccion <> '' GROUP BY seccion ORDER BY seccion`, [req.colegioId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const seccion = String(req.body.seccion || '').trim().slice(0, 80) || null;
    const { rows } = await pool.query('UPDATE grados SET seccion = $3 WHERE id = $1 AND colegio_id = $2 RETURNING *', [req.params.id, req.colegioId, seccion]);
    if (!rows[0]) return res.status(404).json({ error: 'Clase no encontrada' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/categorias-moodle', async (req, res) => {
  try {
    const colegioResult = await pool.query('SELECT * FROM colegios WHERE id = $1', [req.colegioId]);
    const colegio = colegioResult.rows[0];
    if (!colegio) return res.status(400).json({ error: 'Colegio no encontrado' });

    const categorias = await getCategories({ moodleUrl: colegio.moodle_url, token: colegio.moodle_token });
    res.json(categorias);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crea el curso en el Moodle del colegio. Sin categoría elegida usa la primera que exista (o la 1 de Moodle).
async function crearCursoMoodle(colegioId, nombre, categoriaElegida) {
  const { rows: [colegio] } = await pool.query('SELECT * FROM colegios WHERE id = $1', [colegioId]);
  if (!colegio || !colegio.moodle_url || !colegio.moodle_token) { const e = new Error('Este colegio no tiene Moodle configurado'); e.status = 400; throw e; }
  const base = { moodleUrl: colegio.moodle_url, token: colegio.moodle_token };
  let categoria = categoriaElegida;
  if (!categoria) {
    try { const cats = await getCategories(base); categoria = cats.length ? cats[0].id : 1; } catch (e) { categoria = 1; }
  }
  try {
    const curso = await createCourse({ ...base, fullname: nombre, categoryId: categoria });
    return curso.id;
  } catch (err) {
    const e = new Error('No se pudo crear el curso en Moodle: ' + err.message); e.status = 502; throw e;
  }
}

router.post('/', async (req, res) => {
  try {
    const nombre = String(req.body.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
    // Por defecto la clase se crea al instante en Moodle; solo se omite si se pide "solo panel"
    const soloPanel = req.body.categoria_moodle_id === 'none' || req.body.solo_panel === true;
    const moodleCourseId = soloPanel ? null : await crearCursoMoodle(req.colegioId, nombre, req.body.categoria_moodle_id);
    const result = await pool.query(
      'INSERT INTO grados (colegio_id, nombre, moodle_category_id, seccion) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.colegioId, nombre, moodleCourseId, String(req.body.seccion || '').trim().slice(0, 80) || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Conecta con Moodle una clase que se había creado solo en el panel
router.post('/:id/crear-en-moodle', async (req, res) => {
  try {
    const { rows: [g] } = await pool.query('SELECT * FROM grados WHERE id = $1 AND colegio_id = $2', [req.params.id, req.colegioId]);
    if (!g) return res.status(404).json({ error: 'Clase no encontrada' });
    if (g.moodle_category_id) return res.status(400).json({ error: 'Esta clase ya está conectada a Moodle' });
    const cursoId = await crearCursoMoodle(req.colegioId, g.nombre, req.body && req.body.categoria_moodle_id);
    const { rows: [r] } = await pool.query('UPDATE grados SET moodle_category_id = $2 WHERE id = $1 RETURNING *', [g.id, cursoId]);
    res.json(r);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

module.exports = router;

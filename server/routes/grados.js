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

router.post('/', async (req, res) => {
  try {
    const nombre = req.body.nombre;
    const categoriaMoodleId = req.body.categoria_moodle_id;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'nombre es requerido' });
    }

    let moodleCourseId = null;

    if (categoriaMoodleId) {
      const colegioResult = await pool.query('SELECT * FROM colegios WHERE id = $1', [req.colegioId]);
      const colegio = colegioResult.rows[0];
      if (!colegio) return res.status(400).json({ error: 'Colegio no encontrado' });

      try {
        const curso = await createCourse({
          moodleUrl: colegio.moodle_url,
          token: colegio.moodle_token,
          fullname: nombre.trim(),
          categoryId: categoriaMoodleId
        });
        moodleCourseId = curso.id;
      } catch (err) {
        return res.status(502).json({ error: 'Error creando el curso en Moodle: ' + err.message });
      }
    }

    const result = await pool.query(
      'INSERT INTO grados (colegio_id, nombre, moodle_category_id, seccion) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.colegioId, nombre.trim(), moodleCourseId, String(req.body.seccion || '').trim().slice(0, 80) || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

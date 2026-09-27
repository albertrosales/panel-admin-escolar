const express = require('express');
const router = express.Router();
const pool = require('../db');
const { getCategories, createCourse } = require('../services/moodleService');

router.get('/', async (req, res) => {
  try {
    const colegio_id = req.query.colegio_id;
    const result = await pool.query(
      'SELECT * FROM grados WHERE colegio_id = $1 ORDER BY nombre',
      [colegio_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/categorias-moodle', async (req, res) => {
  try {
    const colegio_id = req.query.colegio_id;
    const colegioResult = await pool.query('SELECT * FROM colegios WHERE id = $1', [colegio_id]);
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
    const colegio_id = req.body.colegio_id;
    const nombre = req.body.nombre;
    const categoriaModoleId = req.body.categoria_moodle_id;

    if (!colegio_id || !nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'colegio_id y nombre son requeridos' });
    }

    let moodleCourseId = null;

    if (categoriaModoleId) {
      const colegioResult = await pool.query('SELECT * FROM colegios WHERE id = $1', [colegio_id]);
      const colegio = colegioResult.rows[0];
      if (!colegio) return res.status(400).json({ error: 'Colegio no encontrado' });

      try {
        const curso = await createCourse({
          moodleUrl: colegio.moodle_url,
          token: colegio.moodle_token,
          fullname: nombre.trim(),
          categoryId: categoriaModoleId
        });
        moodleCourseId = curso.id;
      } catch (err) {
        return res.status(502).json({ error: 'Error creando el curso en Moodle: ' + err.message });
      }
    }

    const result = await pool.query(
      'INSERT INTO grados (colegio_id, nombre, moodle_category_id) VALUES ($1,$2,$3) RETURNING *',
      [colegio_id, nombre.trim(), moodleCourseId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  const { colegio_id } = req.query;
  const { rows } = await pool.query(
    'SELECT * FROM profesores WHERE colegio_id = $1 ORDER BY nombre_completo',
    [colegio_id]
  );
  res.json(rows);
});

// Detalle con antigüedad calculada, materias/grados y reseñas
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const { rows: [profesor] } = await pool.query('SELECT * FROM profesores WHERE id = $1', [id]);
  if (!profesor) return res.status(404).json({ error: 'Profesor no encontrado' });

  const { rows: asignaciones } = await pool.query(
    `SELECT pgm.*, g.nombre AS grado_nombre
     FROM profesor_grado_materia pgm
     JOIN grados g ON g.id = pgm.grado_id
     WHERE pgm.profesor_id = $1`,
    [id]
  );
  const { rows: resenas } = await pool.query(
    'SELECT * FROM profesor_resenas WHERE profesor_id = $1 ORDER BY fecha DESC', [id]
  );

  const antiguedadAnios = (
    (new Date() - new Date(profesor.fecha_ingreso)) / (1000 * 60 * 60 * 24 * 365.25)
  ).toFixed(1);

  res.json({ ...profesor, antiguedad_anios: Number(antiguedadAnios), asignaciones, resenas });
});

router.post('/', async (req, res) => {
  const { colegio_id, nombre_completo, correo, telefono, fecha_ingreso, materias, moodle_user_id } = req.body;
  const { rows: [profesor] } = await pool.query(
    `INSERT INTO profesores (colegio_id, nombre_completo, correo, telefono, fecha_ingreso, materias, moodle_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [colegio_id, nombre_completo, correo, telefono, fecha_ingreso, materias, moodle_user_id]
  );
  res.status(201).json(profesor);
});

// Agregar reseña/comentario sobre un profesor
router.post('/:id/resenas', async (req, res) => {
  const { id } = req.params;
  const { autor, comentario } = req.body;
  const { rows: [resena] } = await pool.query(
    `INSERT INTO profesor_resenas (profesor_id, autor, comentario) VALUES ($1,$2,$3) RETURNING *`,
    [id, autor, comentario]
  );
  res.status(201).json(resena);
});

module.exports = router;

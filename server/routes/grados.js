const express = require('express');
const router = express.Router();
const pool = require('../db');

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

// Crear una clase/grado nueva directamente desde el panel (sin depender de Moodle)
router.post('/', async (req, res) => {
  try {
    const colegio_id = req.body.colegio_id;
    const nombre = req.body.nombre;
    if (!colegio_id || !nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'colegio_id y nombre son requeridos' });
    }
    const result = await pool.query(
      'INSERT INTO grados (colegio_id, nombre) VALUES ($1,$2) RETURNING *',
      [colegio_id, nombre.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

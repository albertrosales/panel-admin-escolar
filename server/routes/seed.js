const express = require('express');
const router = express.Router();
const pool = require('../db');

/**
 * ENDPOINT TEMPORAL — usar una sola vez para crear el colegio piloto,
 * luego eliminar este archivo y su registro en server.js por seguridad.
 *
 * Visitar en el navegador: https://TU-BACKEND.onrender.com/api/seed/colegio
 */
router.get('/colegio', async (req, res) => {
  try {
    const { rows: existentes } = await pool.query('SELECT * FROM colegios');
    if (existentes.length > 0) {
      return res.json({ mensaje: 'Ya existe al menos un colegio, no se creó otro.', colegios: existentes });
    }

    const { rows: [colegio] } = await pool.query(
      `INSERT INTO colegios (nombre, moodle_url, moodle_token) VALUES ($1,$2,$3) RETURNING *`,
      ['Ulua Campus - Piloto', 'https://edu.uluamedia.com', process.env.MOODLE_TOKEN_PILOTO]
    );
    res.json({ mensaje: 'Colegio creado', colegio });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

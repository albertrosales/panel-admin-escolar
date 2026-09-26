const express = require('express');
const router = express.Router();
const pool = require('../db');

router.post('/migrar-campos-perfil', async (req, res) => {
  try {
    await pool.query(`
      ALTER TABLE alumnos
        ADD COLUMN IF NOT EXISTS telefono VARCHAR(30),
        ADD COLUMN IF NOT EXISTS direccion TEXT,
        ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE,
        ADD COLUMN IF NOT EXISTS identidad VARCHAR(30),
        ADD COLUMN IF NOT EXISTS foto_url VARCHAR(255),
        ADD COLUMN IF NOT EXISTS es_extranjero BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS fecha_baja DATE,
        ADD COLUMN IF NOT EXISTS motivo_baja TEXT;
    `);
    await pool.query(`
      ALTER TABLE profesores
        ADD COLUMN IF NOT EXISTS direccion TEXT,
        ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE,
        ADD COLUMN IF NOT EXISTS identidad VARCHAR(30),
        ADD COLUMN IF NOT EXISTS foto_url VARCHAR(255),
        ADD COLUMN IF NOT EXISTS es_extranjero BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS fecha_baja DATE,
        ADD COLUMN IF NOT EXISTS motivo_baja TEXT;
    `);
    res.json({ mensaje: 'Migración de campos de perfil completada.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

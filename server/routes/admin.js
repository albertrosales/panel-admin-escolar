const express = require('express');
const router = express.Router();
const pool = require('../db');
const { generarCobrosMensuales } = require('../services/estadoPagoService');

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

router.post('/migrar-cobros-mensuales', async (req, res) => {
  try {
    await pool.query(`ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS monto_mensualidad NUMERIC(10,2);`);
    await pool.query(`ALTER TABLE colegios ADD COLUMN IF NOT EXISTS dia_pago_mensual INT DEFAULT 5;`);
    res.json({ mensaje: 'Migración de cobros mensuales completada.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/configurar-dia-pago', async (req, res) => {
  try {
    const { colegio_id, dia_pago_mensual } = req.body;
    const dia = Number(dia_pago_mensual);
    if (!colegio_id || !dia || dia < 1 || dia > 28) {
      return res.status(400).json({ error: 'colegio_id y un día de pago entre 1 y 28 son requeridos' });
    }
    const result = await pool.query(
      'UPDATE colegios SET dia_pago_mensual = $1 WHERE id = $2 RETURNING *',
      [dia, colegio_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Colegio no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generar-cobros-mensuales', async (req, res) => {
  try {
    const generados = await generarCobrosMensuales();
    res.json({ mensaje: `${generados.length} cobro(s) generado(s).`, pagos: generados });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

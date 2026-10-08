const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { generarCobrosMensuales } = require('../services/estadoPagoService');
const { requireSuperAdmin } = require('../middleware/auth');

// ---------- Solo administrador general ----------

router.post('/migrar-campos-perfil', requireSuperAdmin, async (req, res) => {
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

router.post('/migrar-cobros-mensuales', requireSuperAdmin, async (req, res) => {
  try {
    await pool.query(`ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS monto_mensualidad NUMERIC(10,2);`);
    await pool.query(`ALTER TABLE colegios ADD COLUMN IF NOT EXISTS dia_pago_mensual INT DEFAULT 5;`);
    res.json({ mensaje: 'Migración de cobros mensuales completada.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/colegios', requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nombre, moodle_url, activo, dia_pago_mensual FROM colegios ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registra (o actualiza) un colegio con su Moodle. El token se lee de una variable de entorno de Render.
router.post('/registrar-colegio', requireSuperAdmin, async (req, res) => {
  try {
    const nombre = (req.body.nombre || '').trim();
    const moodleUrl = (req.body.moodle_url || '').trim().replace(/\/$/, '');
    const variable = req.body.variable_token || '';

    if (!nombre || !moodleUrl || !/^MOODLE_TOKEN_[A-Z0-9_]+$/.test(variable)) {
      return res.status(400).json({
        error: 'Se requieren nombre, moodle_url y variable_token (debe empezar con MOODLE_TOKEN_)'
      });
    }
    const token = process.env[variable];
    if (!token) {
      return res.status(400).json({ error: 'La variable ' + variable + ' no existe en Render todavía' });
    }

    const existente = await pool.query('SELECT id FROM colegios WHERE moodle_url = $1', [moodleUrl]);
    if (existente.rows[0]) {
      const r = await pool.query(
        'UPDATE colegios SET nombre = $1, moodle_token = $2 WHERE id = $3 RETURNING id, nombre, moodle_url',
        [nombre, token, existente.rows[0].id]
      );
      return res.json({ mensaje: 'Colegio actualizado', colegio: r.rows[0] });
    }

    const r = await pool.query(
      'INSERT INTO colegios (nombre, moodle_url, moodle_token) VALUES ($1,$2,$3) RETURNING id, nombre, moodle_url',
      [nombre, moodleUrl, token]
    );
    res.status(201).json({ mensaje: 'Colegio registrado', colegio: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crea un usuario administrativo para un colegio
router.post('/crear-usuario-admin', requireSuperAdmin, async (req, res) => {
  try {
    const colegioId = Number(req.body.colegio_id);
    const nombre = (req.body.nombre || '').trim();
    const correo = (req.body.correo || '').trim().toLowerCase();
    const password = req.body.password || '';
    const rol = req.body.rol || 'admin';

    if (!colegioId || !nombre || !correo || password.length < 8) {
      return res.status(400).json({ error: 'Se requieren colegio_id, nombre, correo y una contraseña de al menos 8 caracteres' });
    }
    if (['admin', 'director', 'secretaria'].indexOf(rol) === -1) {
      return res.status(400).json({ error: 'rol debe ser admin, director o secretaria' });
    }
    if (colegioId === 1 && rol === 'admin') {
      return res.status(400).json({ error: 'En el colegio 1 usa rol director o secretaria (admin es el administrador general)' });
    }

    const colegio = await pool.query('SELECT id FROM colegios WHERE id = $1', [colegioId]);
    if (!colegio.rows[0]) return res.status(400).json({ error: 'Colegio no encontrado' });

    const hash = await bcrypt.hash(password, 10);
    try {
      const r = await pool.query(
        'INSERT INTO usuarios_admin (colegio_id, nombre, correo, password_hash, rol) VALUES ($1,$2,$3,$4,$5) RETURNING id, colegio_id, nombre, correo, rol',
        [colegioId, nombre, correo, hash, rol]
      );
      res.status(201).json({ mensaje: 'Usuario creado', usuario: r.rows[0] });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un usuario con ese correo' });
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Cualquier administrador, solo sobre su propio colegio ----------

router.post('/configurar-dia-pago', async (req, res) => {
  try {
    const dia = Number(req.body.dia_pago_mensual);
    if (!dia || dia < 1 || dia > 28) {
      return res.status(400).json({ error: 'Un día de pago entre 1 y 28 es requerido' });
    }
    const result = await pool.query(
      'UPDATE colegios SET dia_pago_mensual = $1 WHERE id = $2 RETURNING id, nombre, dia_pago_mensual',
      [dia, req.colegioId]
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
    res.json({ mensaje: generados.length + ' cobro(s) generado(s).' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

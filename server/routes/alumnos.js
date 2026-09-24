const express = require('express');
const router = express.Router();
const pool = require('../db');
const { evaluarEstadoAlumno } = require('../services/estadoPagoService');

// Listar alumnos (con filtro opcional por estado_pago y grado)
router.get('/', async (req, res) => {
  const { colegio_id, estado_pago, grado_id } = req.query;
  const conditions = ['colegio_id = $1'];
  const params = [colegio_id];

  if (estado_pago) {
    params.push(estado_pago);
    conditions.push(`estado_pago = $${params.length}`);
  }
  if (grado_id) {
    params.push(grado_id);
    conditions.push(`grado_id = $${params.length}`);
  }

  const { rows } = await pool.query(
    `SELECT * FROM alumnos WHERE ${conditions.join(' AND ')} ORDER BY nombre_completo`,
    params
  );
  res.json(rows);
});

// Detalle de un alumno + historial
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const { rows: [alumno] } = await pool.query('SELECT * FROM alumnos WHERE id = $1', [id]);
  if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

  const { rows: historial } = await pool.query(
    'SELECT * FROM alumno_historial WHERE alumno_id = $1 ORDER BY fecha DESC', [id]
  );
  const { rows: pagos } = await pool.query(
    'SELECT * FROM pagos WHERE alumno_id = $1 ORDER BY fecha_vencimiento DESC', [id]
  );

  res.json({ ...alumno, historial, pagos });
});

// Crear alumno
router.post('/', async (req, res) => {
  const { colegio_id, grado_id, nombre_completo, nombre_encargado, telefono_encargado, correo_encargado, moodle_user_id } = req.body;
  const { rows: [alumno] } = await pool.query(
    `INSERT INTO alumnos (colegio_id, grado_id, nombre_completo, nombre_encargado, telefono_encargado, correo_encargado, moodle_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [colegio_id, grado_id, nombre_completo, nombre_encargado, telefono_encargado, correo_encargado, moodle_user_id]
  );

  await pool.query(
    `INSERT INTO alumno_historial (alumno_id, tipo, descripcion) VALUES ($1, 'matricula', 'Alumno matriculado')`,
    [alumno.id]
  );

  res.status(201).json(alumno);
});

// Forzar re-evaluación de estado de pago (y sincronizar con Moodle)
router.post('/:id/evaluar-estado', async (req, res) => {
  try {
    const resultado = await evaluarEstadoAlumno(req.params.id);
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

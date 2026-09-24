const express = require('express');
const router = express.Router();
const pool = require('../db');
const { evaluarEstadoAlumno } = require('../services/estadoPagoService');

// Registrar cobro de un periodo
router.post('/', async (req, res) => {
  const { alumno_id, periodo, monto, fecha_vencimiento } = req.body;
  const { rows: [pago] } = await pool.query(
    `INSERT INTO pagos (alumno_id, periodo, monto, fecha_vencimiento)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [alumno_id, periodo, monto, fecha_vencimiento]
  );
  res.status(201).json(pago);
});

// Marcar un pago como realizado
router.post('/:id/marcar-pagado', async (req, res) => {
  const { id } = req.params;
  const { metodo_pago } = req.body;

  const { rows: [pago] } = await pool.query(
    `UPDATE pagos SET pagado = TRUE, fecha_pago = CURRENT_DATE, metodo_pago = $1
     WHERE id = $2 RETURNING *`,
    [metodo_pago, id]
  );

  await pool.query(
    `INSERT INTO alumno_historial (alumno_id, tipo, descripcion, metadata)
     VALUES ($1, 'pago', $2, $3)`,
    [pago.alumno_id, `Pago de periodo ${pago.periodo} registrado`, JSON.stringify({ monto: pago.monto })]
  );

  const estado = await evaluarEstadoAlumno(pago.alumno_id);
  res.json({ pago, estado });
});

// Crear plan de pago para un alumno moroso
router.post('/planes', async (req, res) => {
  const { alumno_id, monto_total, num_cuotas, fecha_inicio } = req.body;
  const { rows: [plan] } = await pool.query(
    `INSERT INTO planes_pago (alumno_id, monto_total, num_cuotas, fecha_inicio)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [alumno_id, monto_total, num_cuotas, fecha_inicio]
  );

  const montoCuota = (monto_total / num_cuotas).toFixed(2);
  for (let i = 1; i <= num_cuotas; i++) {
    const vencimiento = new Date(fecha_inicio);
    vencimiento.setMonth(vencimiento.getMonth() + (i - 1));
    await pool.query(
      `INSERT INTO plan_pago_cuotas (plan_pago_id, numero_cuota, monto, fecha_vencimiento)
       VALUES ($1,$2,$3,$4)`,
      [plan.id, i, montoCuota, vencimiento]
    );
  }

  const estado = await evaluarEstadoAlumno(alumno_id);
  res.status(201).json({ plan, estado });
});

// Reporte: alumnos al día / plan de pago / morosos
router.get('/reporte-estado', async (req, res) => {
  const { colegio_id } = req.query;
  const { rows } = await pool.query(
    `SELECT estado_pago, COUNT(*) AS total
     FROM alumnos WHERE colegio_id = $1 AND activo = TRUE
     GROUP BY estado_pago`,
    [colegio_id]
  );
  res.json(rows);
});

module.exports = router;

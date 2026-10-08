const express = require('express');
const router = express.Router();
const pool = require('../db');
const { evaluarEstadoAlumno } = require('../services/estadoPagoService');

async function alumnoDelColegio(alumnoId, colegioId) {
  if (!/^\d+$/.test(String(alumnoId))) return false;
  const r = await pool.query('SELECT 1 FROM alumnos WHERE id = $1 AND colegio_id = $2', [alumnoId, colegioId]);
  return r.rows.length > 0;
}

// Toda ruta con :id verifica que el pago sea de un alumno del colegio de quien pide
router.param('id', async (req, res, next, id) => {
  try {
    if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'ID de pago inválido' });
    const r = await pool.query(
      'SELECT a.colegio_id FROM pagos p JOIN alumnos a ON a.id = p.alumno_id WHERE p.id = $1',
      [id]
    );
    if (!r.rows[0] || Number(r.rows[0].colegio_id) !== req.colegioId) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registrar cobro de un periodo
router.post('/', async (req, res) => {
  try {
    const { alumno_id, periodo, monto, fecha_vencimiento } = req.body;
    if (!(await alumnoDelColegio(alumno_id, req.colegioId))) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const { rows: [pago] } = await pool.query(
      `INSERT INTO pagos (alumno_id, periodo, monto, fecha_vencimiento)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [alumno_id, periodo, monto, fecha_vencimiento]
    );
    res.status(201).json(pago);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Marcar un pago como realizado
router.post('/:id/marcar-pagado', async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear plan de pago para un alumno moroso
router.post('/planes', async (req, res) => {
  try {
    const { alumno_id, monto_total, num_cuotas, fecha_inicio } = req.body;
    if (!(await alumnoDelColegio(alumno_id, req.colegioId))) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reporte: alumnos al día / plan de pago / morosos
router.get('/reporte-estado', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT estado_pago, COUNT(*) AS total
       FROM alumnos WHERE colegio_id = $1 AND activo = TRUE
       GROUP BY estado_pago`,
      [req.colegioId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

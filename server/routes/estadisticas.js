const express = require('express');
const router = express.Router();
const pool = require('../db');

// Ingresos por mes (últimos 12 meses) — solo pagos marcados como pagados
router.get('/ingresos-por-mes', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT to_char(date_trunc('month', p.fecha_pago), 'YYYY-MM') AS mes,
              SUM(p.monto) AS total
       FROM pagos p
       JOIN alumnos a ON a.id = p.alumno_id
       WHERE a.colegio_id = $1 AND p.pagado = true AND p.fecha_pago >= NOW() - INTERVAL '12 months'
       GROUP BY 1 ORDER BY 1`,
      [req.colegioId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Alumnos nuevos por mes (últimos 12 meses), según fecha_matricula
router.get('/alumnos-nuevos-por-mes', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT to_char(date_trunc('month', fecha_matricula), 'YYYY-MM') AS mes,
              COUNT(*) AS total
       FROM alumnos
       WHERE colegio_id = $1 AND fecha_matricula >= NOW() - INTERVAL '12 months'
       GROUP BY 1 ORDER BY 1`,
      [req.colegioId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bajas (desertados) por mes, según fecha_baja
router.get('/bajas-por-mes', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT to_char(date_trunc('month', fecha_baja), 'YYYY-MM') AS mes,
              COUNT(*) AS total
       FROM alumnos
       WHERE colegio_id = $1 AND fecha_baja IS NOT NULL AND fecha_baja >= NOW() - INTERVAL '12 months'
       GROUP BY 1 ORDER BY 1`,
      [req.colegioId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resumen general para las tarjetas del Dashboard
router.get('/resumen', async (req, res) => {
  try {
    const colegio_id = req.colegioId;

    const alumnosResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE activo = true) AS activos,
         COUNT(*) FILTER (WHERE activo = false) AS desertados,
         COUNT(*) FILTER (WHERE es_extranjero = true AND activo = true) AS extranjeros,
         COUNT(*) FILTER (WHERE estado_pago = 'moroso' AND activo = true) AS morosos,
         COUNT(*) FILTER (WHERE estado_pago = 'al_dia' AND activo = true) AS al_dia,
         COUNT(*) FILTER (WHERE estado_pago = 'plan_pago' AND activo = true) AS en_plan_pago
       FROM alumnos WHERE colegio_id = $1`,
      [colegio_id]
    );

    const profesoresResult = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE activo = true) AS activos
       FROM profesores WHERE colegio_id = $1`,
      [colegio_id]
    );

    const ingresosMesResult = await pool.query(
      `SELECT COALESCE(SUM(p.monto), 0) AS total
       FROM pagos p JOIN alumnos a ON a.id = p.alumno_id
       WHERE a.colegio_id = $1 AND p.pagado = true
         AND date_trunc('month', p.fecha_pago) = date_trunc('month', CURRENT_DATE)`,
      [colegio_id]
    );

    const pendienteResult = await pool.query(
      `SELECT COALESCE(SUM(p.monto), 0) AS total
       FROM pagos p JOIN alumnos a ON a.id = p.alumno_id
       WHERE a.colegio_id = $1 AND p.pagado = false`,
      [colegio_id]
    );

    res.json({
      alumnos: alumnosResult.rows[0],
      profesores: profesoresResult.rows[0],
      ingresos_mes_actual: Number(ingresosMesResult.rows[0].total),
      total_pendiente_cobro: Number(pendienteResult.rows[0].total)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

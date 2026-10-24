const express = require('express');
const router = express.Router();
const pool = require('../db');

router.use((req, res, next) => (['admin', 'director', 'superadmin'].includes(req.usuario.rol) ? next() : res.status(403).json({ error: 'Solo dirección y administración pueden ver las finanzas' })));

// Resumen unificado: pagos de alumnos + boletos de eventos + otros ingresos, menos gastos
router.get('/resumen', async (req, res) => {
  try {
    const q = req.query; const p = [req.colegioId]; let d = null, h = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.desde || '')) { p.push(q.desde); d = p.length; }
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.hasta || '')) { p.push(q.hasta); h = p.length; }
    const rango = (col) => (d ? ` AND ${col} >= $${d}` : '') + (h ? ` AND ${col} <= $${h}` : '');
    const wPagos = rango('p.fecha_pago'), wBol = rango("(b.pagado_en AT TIME ZONE 'America/Tegucigalpa')::date"), wIng = rango('fecha'), wGas = rango('fecha');
    const one = async (sql) => (await pool.query(sql, p)).rows;
    const [pagos] = await one(`SELECT COALESCE(SUM(p.monto),0)::float AS total, COUNT(*)::int AS cantidad FROM pagos p JOIN alumnos a ON a.id = p.alumno_id WHERE a.colegio_id = $1 AND p.pagado = TRUE${wPagos}`);
    const boletos = await one(`SELECT e.nombre AS evento, COALESCE(SUM(b.monto),0)::float AS total, COUNT(*)::int AS cantidad FROM boletos b JOIN eventos_entrada e ON e.id = b.evento_id
      WHERE b.colegio_id = $1 AND b.estado IN ('pagado','usado')${wBol} GROUP BY e.id, e.nombre ORDER BY total DESC`);
    const ingresos = await one(`SELECT categoria, SUM(monto)::float AS total, COUNT(*)::int AS cantidad FROM ingresos WHERE colegio_id = $1${wIng} GROUP BY categoria ORDER BY total DESC`);
    const gastos = await one(`SELECT categoria, SUM(monto)::float AS total, COUNT(*)::int AS cantidad FROM gastos WHERE colegio_id = $1${wGas} GROUP BY categoria ORDER BY total DESC`);
    const meses = await one(`SELECT mes, SUM(ing)::float AS ingresos, SUM(gas)::float AS gastos FROM (
        SELECT to_char(p.fecha_pago,'YYYY-MM') AS mes, p.monto AS ing, 0 AS gas FROM pagos p JOIN alumnos a ON a.id = p.alumno_id WHERE a.colegio_id = $1 AND p.pagado = TRUE${wPagos}
        UNION ALL SELECT to_char((b.pagado_en AT TIME ZONE 'America/Tegucigalpa')::date,'YYYY-MM'), b.monto, 0 FROM boletos b WHERE b.colegio_id = $1 AND b.estado IN ('pagado','usado')${wBol}
        UNION ALL SELECT to_char(fecha,'YYYY-MM'), monto, 0 FROM ingresos WHERE colegio_id = $1${wIng}
        UNION ALL SELECT to_char(fecha,'YYYY-MM'), 0, monto FROM gastos WHERE colegio_id = $1${wGas}
      ) t WHERE mes IS NOT NULL GROUP BY mes ORDER BY mes`);
    const sum = (a) => a.reduce((x, r) => x + r.total, 0);
    const tPagos = pagos.total, tEventos = sum(boletos), tOtros = sum(ingresos), tGastos = sum(gastos);
    res.json({
      ingresos: { pagos_alumnos: { total: tPagos, cantidad: pagos.cantidad }, eventos: { total: tEventos, detalle: boletos }, otros: { total: tOtros, detalle: ingresos }, total: tPagos + tEventos + tOtros },
      gastos: { total: tGastos, detalle: gastos }, balance: tPagos + tEventos + tOtros - tGastos, meses
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

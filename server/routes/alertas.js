const express = require('express');
const router = express.Router();
const pool = require('../db');
const licencias = require('../services/licencias');

// Cosas que necesitan atención hoy: cada una lleva a la pantalla donde se resuelve
router.get('/', async (req, res) => {
  try {
    const c = req.colegioId;
    const q = async (sql) => { try { return (await pool.query(sql, [c])).rows[0].n; } catch { return 0; } };
    const [vencidos, porVencer, comprobantes, matriculas, boletos, sinCorreo, fallidos] = await Promise.all([
      q(`SELECT COUNT(DISTINCT p.alumno_id)::int n FROM pagos p JOIN alumnos a ON a.id = p.alumno_id WHERE a.colegio_id = $1 AND a.activo AND NOT p.pagado AND p.fecha_vencimiento < CURRENT_DATE`),
      q(`SELECT COUNT(DISTINCT p.alumno_id)::int n FROM pagos p JOIN alumnos a ON a.id = p.alumno_id WHERE a.colegio_id = $1 AND a.activo AND NOT p.pagado AND p.fecha_vencimiento BETWEEN CURRENT_DATE AND CURRENT_DATE + 7`),
      q(`SELECT COUNT(*)::int n FROM comprobantes WHERE colegio_id = $1 AND estado IN ('por_verificar','requiere_alumno')`),
      q(`SELECT COUNT(*)::int n FROM solicitudes_matricula s WHERE s.colegio_id = $1 AND s.estado = 'pendiente'`),
      q(`SELECT COUNT(*)::int n FROM boletos b JOIN eventos_entrada e ON e.id = b.evento_id WHERE b.colegio_id = $1 AND b.estado = 'pendiente' AND e.activo`),
      q(`SELECT COUNT(*)::int n FROM alumnos WHERE colegio_id = $1 AND activo AND COALESCE(btrim(correo_encargado),'') = ''`),
      q(`SELECT COUNT(*)::int n FROM notificaciones_correo WHERE colegio_id = $1 AND estado = 'fallido' AND creado_en > NOW() - interval '7 days'`)
    ]);
    const L = [
      { clave: 'vencidos', n: vencidos, nivel: 'rojo', texto: (n) => `${n} alumno${n === 1 ? '' : 's'} con pagos vencidos`, ruta: '/cobros' },
      { clave: 'comprobantes', n: comprobantes, nivel: 'ambar', texto: (n) => `${n} comprobante${n === 1 ? '' : 's'} por revisar`, ruta: '/comprobantes' },
      { clave: 'por_vencer', n: porVencer, nivel: 'ambar', texto: (n) => `${n} alumno${n === 1 ? '' : 's'} con pago que vence en 7 días`, ruta: '/cobros' },
      { clave: 'matriculas', n: matriculas, nivel: 'azul', texto: (n) => `${n} solicitud${n === 1 ? '' : 'es'} de matrícula pendiente${n === 1 ? '' : 's'}`, ruta: '/matricula' },
      { clave: 'boletos', n: boletos, nivel: 'azul', texto: (n) => `${n} boleto${n === 1 ? '' : 's'} reservado${n === 1 ? '' : 's'} sin pagar`, ruta: '/eventos' },
      { clave: 'sin_correo', n: sinCorreo, nivel: 'gris', texto: (n) => `${n} alumno${n === 1 ? '' : 's'} sin correo del encargado`, ruta: '/alumnos' },
      { clave: 'fallidos', n: fallidos, nivel: 'gris', texto: (n) => `${n} correo${n === 1 ? '' : 's'} no se pudieron enviar (últimos 7 días)`, ruta: '/notificaciones' }
    ].filter((a) => a.n > 0).map((a) => ({ clave: a.clave, n: a.n, nivel: a.nivel, texto: a.texto(a.n), ruta: a.ruta }));
    res.json(L);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

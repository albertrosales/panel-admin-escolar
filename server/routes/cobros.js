const express = require('express');
const router = express.Router();
const pool = require('../db');
const N = require('../services/correo/notificaciones');

// Alumnos con pagos pendientes (para cobrar y mandar recordatorios en bloque)
router.get('/pendientes', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.nombre_completo, a.codigo, a.nombre_encargado, a.correo_encargado, a.telefono_encargado,
              COUNT(p.id)::int AS pagos, SUM(p.monto + COALESCE(p.recargo,0))::float AS total, MIN(p.fecha_vencimiento) AS mas_antiguo,
              BOOL_OR(p.fecha_vencimiento < CURRENT_DATE) AS vencido,
              EXISTS (SELECT 1 FROM comprobantes k WHERE k.alumno_id = a.id AND k.estado IN ('por_verificar','requiere_alumno')) AS en_validacion,
              (SELECT MAX(n.creado_en) FROM notificaciones_correo n WHERE n.alumno_id = a.id AND n.plantilla_clave IN ('mensualidad_vencida','recordatorio_vencimiento')) AS ultimo_aviso
       FROM alumnos a JOIN pagos p ON p.alumno_id = a.id
       WHERE a.colegio_id = $1 AND a.activo AND NOT p.pagado
       GROUP BY a.id ORDER BY BOOL_OR(p.fecha_vencimiento < CURRENT_DATE) DESC, MIN(p.fecha_vencimiento), a.nombre_completo`, [req.colegioId]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Envía el aviso de cobro a los alumnos seleccionados (una vista previa individual se hace desde Notificaciones)
router.post('/recordar', async (req, res) => {
  try {
    const alumno_ids = (req.body.alumno_ids || []).map(Number).filter(Boolean).slice(0, 500);
    if (!alumno_ids.length) return res.status(400).json({ error: 'Selecciona al menos un alumno' });
    const clave = req.body.plantilla === 'recordatorio_vencimiento' ? 'recordatorio_vencimiento' : 'mensualidad_vencida';
    const pl = await N.cargarPlantilla(req.colegioId, clave);
    const r = await N.enviarManual(req.colegioId, req.usuario.nombre || req.usuario.correo, { clave, asunto: pl.asunto, cuerpo: pl.cuerpo, audiencia: { tipo: 'alumnos', alumno_ids } });
    res.json(r);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

module.exports = router;

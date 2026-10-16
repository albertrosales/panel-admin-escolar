// Matrícula en línea desde el panel del alumno / familia
const express = require('express');
const router = express.Router();
const pool = require('../db');
const notif = require('../services/correo/notificaciones');
const { aplicarSolicitud } = require('./matriculas');

const HOY = "(NOW() AT TIME ZONE 'America/Tegucigalpa')::date";
const soloAlumno = (req, res, next) => (req.portal.tipo === 'alumno' ? next() : res.status(403).json({ error: 'Solo para alumnos' }));
router.use(soloAlumno);

async function periodoVigente(colegioId) {
  // Abierto hoy; si no hay, el próximo; si no, el más reciente (solo para informar)
  const { rows } = await pool.query(
    `SELECT *, fecha_inicio::text AS fi, fecha_fin::text AS ff, (fecha_inicio <= ${HOY} AND fecha_fin >= ${HOY}) AS abierta,
       CASE WHEN fecha_inicio > ${HOY} THEN 'proxima' WHEN fecha_fin < ${HOY} THEN 'cerrada' ELSE 'abierta' END AS ventana
     FROM periodos_matricula WHERE colegio_id = $1
     ORDER BY (fecha_inicio <= ${HOY} AND fecha_fin >= ${HOY}) DESC, (fecha_inicio > ${HOY}) DESC,
       CASE WHEN fecha_inicio > ${HOY} THEN fecha_inicio END ASC, fecha_fin DESC LIMIT 1`, [colegioId]);
  return rows[0] || null;
}

async function morosoInfo(alumnoId) {
  const { rows: [r] } = await pool.query(
    `SELECT COUNT(*)::int n FROM pagos WHERE alumno_id = $1 AND pagado = false AND fecha_vencimiento < ${HOY}`, [alumnoId]);
  return r.n;
}

router.get('/', async (req, res) => {
  try {
    const { id: alumnoId, colegio_id: colegioId } = req.portal;
    const periodo = await periodoVigente(colegioId);
    if (!periodo) return res.json({ periodo: null });
    const [sol, grados, al, vencidos] = await Promise.all([
      pool.query(`SELECT s.*, s.seccion AS grado_nombre FROM solicitudes_matricula s WHERE s.alumno_id = $1 AND s.periodo_id = $2`, [alumnoId, periodo.id]),
      pool.query(`SELECT seccion, COUNT(*)::int AS clases FROM grados WHERE colegio_id = $1 AND seccion IS NOT NULL AND seccion <> '' GROUP BY seccion ORDER BY seccion`, [colegioId]),
      pool.query('SELECT nombre_encargado, telefono_encargado, correo_encargado, telefono, direccion, grado_id FROM alumnos WHERE id = $1', [alumnoId]),
      morosoInfo(alumnoId)
    ]);
    res.json({
      periodo: { id: periodo.id, anio_escolar: periodo.anio_escolar, fecha_inicio: periodo.fi, fecha_fin: periodo.ff,
        monto: periodo.monto, instrucciones: periodo.instrucciones, ventana: periodo.ventana, abierta: periodo.abierta },
      bloqueado: periodo.bloquear_morosos && vencidos > 0 ? `Tienes ${vencidos} pago(s) vencido(s). Ponte al día o comunícate con administración para poder matricularte.` : null,
      solicitud: sol.rows[0] || null,
      secciones: grados.rows,
      datos: al.rows[0]
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const limpiar = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

router.post('/', async (req, res) => {
  try {
    const { id: alumnoId, colegio_id: colegioId } = req.portal;
    const periodo = await periodoVigente(colegioId);
    if (!periodo || !periodo.abierta) return res.status(400).json({ error: 'La matrícula no está abierta en este momento.' });
    if (periodo.bloquear_morosos && await morosoInfo(alumnoId)) return res.status(400).json({ error: 'Tienes pagos vencidos. Comunícate con administración.' });

    const b = req.body || {};
    const d = {
      nombre_encargado: limpiar(b.nombre_encargado, 150), telefono_encargado: limpiar(b.telefono_encargado, 30),
      correo_encargado: limpiar(b.correo_encargado, 150).toLowerCase(), telefono: limpiar(b.telefono, 30),
      direccion: limpiar(b.direccion, 250), observaciones: limpiar(b.observaciones, 500)
    };
    if (!d.nombre_encargado || !d.telefono_encargado) return res.status(400).json({ error: 'Indica el nombre y el teléfono del padre, madre o encargado' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo_encargado)) return res.status(400).json({ error: 'Escribe un correo válido del encargado' });
    if (!b.acepta) return res.status(400).json({ error: 'Debes confirmar que los datos son correctos' });
    const { rows: [g] } = await pool.query('SELECT seccion FROM grados WHERE seccion = $1 AND colegio_id = $2 LIMIT 1', [String(b.seccion || ''), colegioId]);
    if (!g) return res.status(400).json({ error: 'Selecciona el grado y sección al que te matricularás' });

    const { rows: [prev] } = await pool.query('SELECT id, estado FROM solicitudes_matricula WHERE alumno_id = $1 AND periodo_id = $2', [alumnoId, periodo.id]);
    if (prev && prev.estado === 'aprobada') return res.status(400).json({ error: 'Tu matrícula ya fue aprobada.' });
    if (prev && prev.estado === 'pendiente') return res.status(400).json({ error: 'Tu solicitud ya está en revisión.' });

    const auto = periodo.aprobacion_automatica;
    const vals = [colegioId, alumnoId, periodo.id, g.seccion, d.nombre_encargado, d.telefono_encargado, d.correo_encargado, d.telefono, d.direccion, d.observaciones, auto ? 'aprobada' : 'pendiente'];
    const { rows: [s] } = await pool.query(
      `INSERT INTO solicitudes_matricula (colegio_id, alumno_id, periodo_id, seccion, nombre_encargado, telefono_encargado, correo_encargado, telefono, direccion, observaciones, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (alumno_id, periodo_id) DO UPDATE SET seccion=EXCLUDED.seccion, nombre_encargado=EXCLUDED.nombre_encargado, telefono_encargado=EXCLUDED.telefono_encargado,
         correo_encargado=EXCLUDED.correo_encargado, telefono=EXCLUDED.telefono, direccion=EXCLUDED.direccion, observaciones=EXCLUDED.observaciones,
         estado=EXCLUDED.estado, motivo_rechazo=NULL, creado_en=NOW() RETURNING *`, vals);
    if (auto) { await aplicarSolicitud(s); notif.matricula(s.id, 'aprobada'); } else notif.matricula(s.id, 'recibida');
    res.status(201).json({ ok: true, estado: s.estado });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

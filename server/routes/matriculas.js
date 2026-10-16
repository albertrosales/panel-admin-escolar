// Administración de matrícula en línea: períodos (los abre el director) y solicitudes
const express = require('express');
const router = express.Router();
const pool = require('../db');
const notif = require('../services/correo/notificaciones');
const { enrolUser, unenrolUser, STUDENT_ROLE_ID } = require('../services/moodleService');

const HOY = "(NOW() AT TIME ZONE 'America/Tegucigalpa')::date";
const fechaOk = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

function leerPeriodo(b) {
  const anio = parseInt(b.anio_escolar, 10);
  if (!anio || anio < 2000 || anio > 2100) throw Object.assign(new Error('Año escolar inválido'), { status: 400 });
  if (!fechaOk(b.fecha_inicio) || !fechaOk(b.fecha_fin)) throw Object.assign(new Error('Indica fecha de inicio y de cierre'), { status: 400 });
  if (b.fecha_fin < b.fecha_inicio) throw Object.assign(new Error('La fecha de cierre no puede ser anterior al inicio'), { status: 400 });
  const monto = b.monto === '' || b.monto == null ? null : Number(b.monto);
  if (monto != null && (!isFinite(monto) || monto < 0)) throw Object.assign(new Error('Monto inválido'), { status: 400 });
  return [anio, b.fecha_inicio, b.fecha_fin, monto, (b.instrucciones || '').trim().slice(0, 1000) || null, !!b.aprobacion_automatica, b.bloquear_morosos !== false];
}
const err = (res, e) => res.status(e.status || 500).json({ error: e.code === '23505' ? 'Ya existe una matrícula para ese año escolar' : e.message });

router.get('/periodos', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, p.fecha_inicio::text AS fecha_inicio, p.fecha_fin::text AS fecha_fin, (p.fecha_inicio <= ${HOY} AND p.fecha_fin >= ${HOY}) AS abierta,
        (SELECT COUNT(*)::int FROM solicitudes_matricula s WHERE s.periodo_id = p.id) AS total,
        (SELECT COUNT(*)::int FROM solicitudes_matricula s WHERE s.periodo_id = p.id AND s.estado = 'pendiente') AS pendientes
       FROM periodos_matricula p WHERE p.colegio_id = $1 ORDER BY p.anio_escolar DESC`, [req.colegioId]);
    res.json(rows);
  } catch (e) { err(res, e); }
});

router.post('/periodos', async (req, res) => {
  try {
    const v = leerPeriodo(req.body);
    const { rows } = await pool.query(
      `INSERT INTO periodos_matricula (colegio_id, anio_escolar, fecha_inicio, fecha_fin, monto, instrucciones, aprobacion_automatica, bloquear_morosos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [req.colegioId, ...v]);
    res.status(201).json(rows[0]);
  } catch (e) { err(res, e); }
});

router.put('/periodos/:id', async (req, res) => {
  try {
    const v = leerPeriodo(req.body);
    const { rows } = await pool.query(
      `UPDATE periodos_matricula SET anio_escolar=$3, fecha_inicio=$4, fecha_fin=$5, monto=$6, instrucciones=$7, aprobacion_automatica=$8, bloquear_morosos=$9
       WHERE id=$1 AND colegio_id=$2 RETURNING *`, [req.params.id, req.colegioId, ...v]);
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (e) { err(res, e); }
});

router.delete('/periodos/:id', async (req, res) => {
  try {
    const { rows: [t] } = await pool.query(
      `SELECT COUNT(*)::int n FROM solicitudes_matricula s JOIN periodos_matricula p ON p.id = s.periodo_id WHERE p.id=$1 AND p.colegio_id=$2`, [req.params.id, req.colegioId]);
    if (t.n) return res.status(400).json({ error: 'Ya tiene solicitudes. Cambia las fechas para cerrarlo en lugar de eliminarlo.' });
    await pool.query('DELETE FROM periodos_matricula WHERE id=$1 AND colegio_id=$2', [req.params.id, req.colegioId]);
    res.json({ ok: true });
  } catch (e) { err(res, e); }
});

router.get('/solicitudes', async (req, res) => {
  try {
    const q = [req.colegioId]; let w = '';
    if (req.query.periodo_id) { q.push(req.query.periodo_id); w += ` AND s.periodo_id = $${q.length}`; }
    if (req.query.estado) { q.push(req.query.estado); w += ` AND s.estado = $${q.length}`; }
    const { rows } = await pool.query(
      `SELECT s.*, a.nombre_completo, a.codigo, ga.nombre AS grado_actual, s.seccion AS grado_destino, p.anio_escolar
       FROM solicitudes_matricula s JOIN alumnos a ON a.id = s.alumno_id JOIN periodos_matricula p ON p.id = s.periodo_id
       LEFT JOIN grados ga ON ga.id = a.grado_id
       WHERE s.colegio_id = $1 ${w} ORDER BY (s.estado='pendiente') DESC, s.creado_en DESC LIMIT 500`, q);
    res.json(rows);
  } catch (e) { err(res, e); }
});

router.post('/solicitudes/:id/aprobar', async (req, res) => {
  try {
    const { rows: [s] } = await pool.query(
      `UPDATE solicitudes_matricula SET estado='aprobada', motivo_rechazo=NULL, revisado_por=$3, revisado_en=NOW()
       WHERE id=$1 AND colegio_id=$2 AND estado <> 'aprobada' RETURNING *`, [req.params.id, req.colegioId, req.usuario.nombre || req.usuario.correo || 'admin']);
    if (!s) return res.status(404).json({ error: 'Solicitud no encontrada o ya aprobada' });
    const avisos = await aplicarSolicitud(s);
    notif.matricula(s.id, 'aprobada');
    res.json({ ...s, avisos });
  } catch (e) { err(res, e); }
});

router.post('/solicitudes/:id/rechazar', async (req, res) => {
  try {
    const motivo = String(req.body.motivo || '').trim().slice(0, 300);
    if (!motivo) return res.status(400).json({ error: 'Escribe el motivo del rechazo' });
    const { rows: [s] } = await pool.query(
      `UPDATE solicitudes_matricula SET estado='rechazada', motivo_rechazo=$3, revisado_por=$4, revisado_en=NOW()
       WHERE id=$1 AND colegio_id=$2 AND estado <> 'rechazada' RETURNING *`, [req.params.id, req.colegioId, motivo, req.usuario.nombre || req.usuario.correo || 'admin']);
    if (!s) return res.status(404).json({ error: 'Solicitud no encontrada o ya rechazada' });
    notif.matricula(s.id, 'rechazada');
    res.json(s);
  } catch (e) { err(res, e); }
});

/** Elimina al alumno de la matrícula del año. Si estaba aprobada, le quita las clases que esa aprobación le activó (panel y Moodle). */
router.delete('/solicitudes/:id', async (req, res) => {
  try {
    const { rows: [s] } = await pool.query(
      `SELECT s.*, p.anio_escolar FROM solicitudes_matricula s JOIN periodos_matricula p ON p.id = s.periodo_id WHERE s.id = $1 AND s.colegio_id = $2`, [req.params.id, req.colegioId]);
    if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
    const avisos = [];
    let quitadas = 0;
    if (s.estado === 'aprobada' && s.seccion) {
      if (s.clases_agregadas == null) avisos.push('Esta aprobación es anterior y no registró sus clases: revisa las clases del alumno a mano.');
      const ids = s.clases_agregadas || [];
      if (ids.length) {
        const [{ rows: clases }, { rows: [al] }, { rows: [col] }] = await Promise.all([
          pool.query('SELECT id, nombre, moodle_category_id FROM grados WHERE id = ANY($1::int[])', [ids]),
          pool.query('SELECT moodle_user_id FROM alumnos WHERE id = $1', [s.alumno_id]),
          pool.query('SELECT moodle_url, moodle_token FROM colegios WHERE id = $1', [s.colegio_id])
        ]);
        for (const c of clases) {
          await pool.query('DELETE FROM matriculas WHERE alumno_id = $1 AND grado_id = $2', [s.alumno_id, c.id]);
          quitadas++;
          if (!c.moodle_category_id || !al || !al.moodle_user_id) continue;
          try {
            await unenrolUser({ moodleUrl: col.moodle_url, token: col.moodle_token, userId: al.moodle_user_id, courseId: c.moodle_category_id, roleId: STUDENT_ROLE_ID });
          } catch (err) { avisos.push('Moodle no quitó ' + c.nombre + ': ' + err.message); }
        }
      }
    }
    await pool.query('DELETE FROM solicitudes_matricula WHERE id = $1', [s.id]);
    await pool.query("INSERT INTO alumno_historial (alumno_id, tipo, descripcion) VALUES ($1,'matricula',$2)",
      [s.alumno_id, `Eliminado de la matrícula ${s.anio_escolar}${quitadas ? ' (se quitaron ' + quitadas + ' clases)' : ''}`]);
    res.json({ ok: true, clases_quitadas: quitadas, avisos });
  } catch (e) { err(res, e); }
});

/** Al aprobar: actualiza contacto de la familia, matricula al alumno en TODAS las clases de la sección elegida
 *  (panel + Moodle) y deja constancia en el historial. Devuelve avisos si algo no pudo hacerse en Moodle. */
async function aplicarSolicitud(s) {
  await pool.query(
    `UPDATE alumnos SET nombre_encargado = COALESCE(NULLIF($2,''), nombre_encargado), telefono_encargado = COALESCE(NULLIF($3,''), telefono_encargado),
       correo_encargado = COALESCE(NULLIF($4,''), correo_encargado), telefono = COALESCE(NULLIF($5,''), telefono), direccion = COALESCE(NULLIF($6,''), direccion)
     WHERE id = $1`, [s.alumno_id, s.nombre_encargado, s.telefono_encargado, s.correo_encargado, s.telefono, s.direccion]);
  const avisos = [];
  const { rows: [i] } = await pool.query('SELECT anio_escolar FROM periodos_matricula WHERE id = $1', [s.periodo_id]);
  let n = 0;
  const nuevas = []; // clases que esta aprobación agregó (para poder deshacerla sin tocar otras)
  if (s.seccion) {
    const [{ rows: clases }, { rows: [al] }, { rows: [col] }] = await Promise.all([
      pool.query('SELECT id, nombre, moodle_category_id FROM grados WHERE colegio_id = $1 AND seccion = $2 ORDER BY nombre', [s.colegio_id, s.seccion]),
      pool.query('SELECT moodle_user_id FROM alumnos WHERE id = $1', [s.alumno_id]),
      pool.query('SELECT moodle_url, moodle_token FROM colegios WHERE id = $1', [s.colegio_id])
    ]);
    if (!clases.length) avisos.push('La sección ' + s.seccion + ' ya no tiene clases.');
    for (const c of clases) {
      const ins = await pool.query('INSERT INTO matriculas (alumno_id, grado_id) SELECT $1::int, $2::int WHERE NOT EXISTS (SELECT 1 FROM matriculas WHERE alumno_id = $1 AND grado_id = $2) RETURNING grado_id', [s.alumno_id, c.id]);
      if (ins.rowCount) nuevas.push(c.id);
      n++;
      if (!c.moodle_category_id) continue;
      if (!al || !al.moodle_user_id) { avisos.push('El alumno no tiene usuario en Moodle: no se activó ' + c.nombre); continue; }
      try {
        await enrolUser({ moodleUrl: col.moodle_url, token: col.moodle_token, userId: al.moodle_user_id, courseId: c.moodle_category_id, roleId: STUDENT_ROLE_ID });
      } catch (err) { avisos.push('Moodle no activó ' + c.nombre + ': ' + err.message); }
    }
  }
  await pool.query('UPDATE solicitudes_matricula SET clases_agregadas = $2 WHERE id = $1', [s.id, nuevas]);
  await pool.query("INSERT INTO alumno_historial (alumno_id, tipo, descripcion) VALUES ($1,'matricula',$2)",
    [s.alumno_id, `Matrícula ${i.anio_escolar} aprobada${s.seccion ? ' · ' + s.seccion + ' (' + n + ' clases)' : ''}`]);
  return avisos;
}

module.exports = router;
module.exports.aplicarSolicitud = aplicarSolicitud;

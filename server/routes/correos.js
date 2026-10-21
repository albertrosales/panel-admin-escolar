const express = require('express');
const router = express.Router();
const pool = require('../db');
const N = require('../services/correo/notificaciones');
const { PLANTILLAS, AUTO_VARS, MANUAL_VARS, porClave } = require('../services/correo/plantillasDefault');
const { disponible, enviar, remitenteDe } = require('../services/correo/mailer');

router.get('/estado', async (req, res) => {
  const r = await pool.query('SELECT correo_color, correo_logo_url, correo_pie FROM colegios WHERE id = $1', [req.colegioId]);
  res.json({ configurado: await disponible(req.colegioId), remitente: await remitenteDe(req.colegioId), ...(r.rows[0] || {}), variables_auto: AUTO_VARS, variables_manuales: MANUAL_VARS });
});

router.put('/estado', async (req, res) => {
  try {
    const color = /^#[0-9a-f]{6}$/i.test(req.body.correo_color || '') ? req.body.correo_color : '#2455e6';
    const logo = /^https:\/\/\S+$/.test(req.body.correo_logo_url || '') ? req.body.correo_logo_url.slice(0, 300) : null;
    await pool.query('UPDATE colegios SET correo_color=$1, correo_logo_url=$2, correo_pie=$3 WHERE id=$4', [color, logo, String(req.body.correo_pie || '').slice(0, 300) || null, req.colegioId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/plantillas', async (req, res) => {
  try { res.json(await Promise.all(PLANTILLAS.map((p) => N.cargarPlantilla(req.colegioId, p.clave)))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/plantillas/:clave', async (req, res) => {
  try {
    if (!porClave(req.params.clave)) return res.status(404).json({ error: 'Plantilla no encontrada' });
    const { asunto, cuerpo, activa, parametro } = req.body;
    if (!String(asunto || '').trim() || !String(cuerpo || '').trim()) return res.status(400).json({ error: 'El asunto y el mensaje son obligatorios' });
    const par = parametro === '' || parametro == null ? null : Math.max(1, parseInt(parametro, 10) || 1);
    await pool.query(
      `INSERT INTO plantillas_correo (colegio_id, clave, asunto, cuerpo, activa_auto, parametro) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (colegio_id, clave) DO UPDATE SET asunto = EXCLUDED.asunto, cuerpo = EXCLUDED.cuerpo, activa_auto = EXCLUDED.activa_auto, parametro = EXCLUDED.parametro`,
      [req.colegioId, req.params.clave, String(asunto).slice(0, 250), cuerpo, !!activa, par]);
    res.json(await N.cargarPlantilla(req.colegioId, req.params.clave));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Restaurar el texto original (conserva activada/desactivada)
router.post('/plantillas/:clave/restaurar', async (req, res) => {
  try {
    const def = porClave(req.params.clave);
    if (!def) return res.status(404).json({ error: 'Plantilla no encontrada' });
    const actual = await N.cargarPlantilla(req.colegioId, req.params.clave);
    await pool.query('DELETE FROM plantillas_correo WHERE colegio_id = $1 AND clave = $2', [req.colegioId, req.params.clave]);
    if (def.auto) await pool.query('INSERT INTO plantillas_correo (colegio_id, clave, asunto, cuerpo, activa_auto, parametro) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.colegioId, req.params.clave, def.asunto, def.cuerpo, actual.activa, actual.parametro]);
    res.json(await N.cargarPlantilla(req.colegioId, req.params.clave));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/vista-previa', async (req, res) => {
  try { res.json(await N.vistaPrevia(req.colegioId, req.body)); } catch (e) { res.status(500).json({ error: e.message }); }
});

// Prueba: se envía solo a la dirección indicada, con datos reales del primer alumno del grupo
router.post('/prueba', async (req, res) => {
  try {
    if (!(await disponible(req.colegioId))) return res.status(400).json({ error: 'Este colegio no tiene correo de envío configurado' });
    const para = String(req.body.para || '').trim();
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(para)) return res.status(400).json({ error: 'Escribe un correo válido para la prueba' });
    const v = await N.vistaPrevia(req.colegioId, req.body);
    if (!v.vista) return res.status(400).json({ error: 'No hay alumnos para generar la prueba' });
    const { rows: [c] } = await pool.query('SELECT nombre FROM colegios WHERE id = $1', [req.colegioId]);
    await enviar({ colegioId: req.colegioId, nombreRemitente: c.nombre, to: para, asunto: '[Prueba] ' + v.vista.asunto, html: v.vista.html, texto: v.vista.asunto });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/enviar', async (req, res) => {
  try { res.json(await N.enviarManual(req.colegioId, req.usuario.nombre, req.body)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.get('/historial', async (req, res) => {
  try {
    const params = [req.colegioId]; let where = 'n.colegio_id = $1';
    if (req.query.estado) { params.push(req.query.estado); where += ' AND n.estado = $' + params.length; }
    const r = await pool.query(
      `SELECT n.id, n.plantilla_clave, n.destinatario, n.asunto, n.estado, n.error, n.intentos, n.creado_en, n.enviado_en, n.enviado_por, a.nombre_completo AS alumno
       FROM notificaciones_correo n LEFT JOIN alumnos a ON a.id = n.alumno_id WHERE ${where} ORDER BY n.id DESC LIMIT 200`, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/reintentar', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    await pool.query(`UPDATE notificaciones_correo SET estado='pendiente', intentos=0, error=NULL WHERE id=$1 AND colegio_id=$2 AND estado='fallido' AND destinatario <> ''`, [req.params.id, req.colegioId]);
    setImmediate(() => N.procesarPendientes().catch(() => {}));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

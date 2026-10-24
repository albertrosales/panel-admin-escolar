const pool = require('../../db');
const { armar, cargarPlantilla } = require('./notificaciones');
const { htmlCorreo } = require('./render');
const { disponible, enviar } = require('./mailer');
const mdl = require('../moodleService');
const { marcaDe } = require('./firma');

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const urlSistema = () => String(process.env.FRONTEND_URL || 'https://sistema.uluamedia.com').replace(/\/+$/, '');
const urlMoodle = (u) => { u = String(u || '').trim().replace(/\/+$/, ''); return !u ? '' : (/^https?:\/\//i.test(u) ? u : 'https://' + u); };

/**
 * Envía el correo de bienvenida con las credenciales. Se envía directo (no pasa por la cola)
 * y la contraseña NO queda guardada en el historial: allí se registra enmascarada.
 */
async function enviarCredenciales({ colegioId, para, nombre, usuario, contrasena, alumnoId }) {
  if (!para || !EMAIL_RE.test(para)) return { enviado: false, motivo: 'No hay un correo válido a donde enviar' };
  if (!(await disponible(colegioId))) return { enviado: false, motivo: 'El colegio no tiene correo de envío configurado (Configuración → Correo de envío)' };
  const { rows: [c] } = await pool.query('SELECT nombre, moodle_url, correo_color, correo_logo_url, correo_pie, (logo_data IS NOT NULL) AS tiene_logo FROM colegios WHERE id = $1', [colegioId]);
  const pl = await cargarPlantilla(colegioId, 'credenciales');
  const marca = await marcaDe(colegioId);
  const vars = { nombre_institucion: c.nombre, nombre_destinatario: nombre, usuario, contrasena, enlace_moodle: urlMoodle(c.moodle_url), enlace_sistema: urlSistema() };
  const m = armar(pl, { vars, marca });
  let estado = 'enviado', error = null;
  try { await enviar({ colegioId, nombreRemitente: c.nombre, to: para, asunto: m.asunto, html: m.html, texto: m.texto }); }
  catch (e) { estado = 'fallido'; error = String(e.message).slice(0, 300); }
  const oculto = armar(pl, { vars: { ...vars, contrasena: '********' }, marca });
  await pool.query(
    `INSERT INTO notificaciones_correo (colegio_id, alumno_id, plantilla_clave, destinatario, asunto, cuerpo_texto, cuerpo_html, estado, error, enviado_en)
     VALUES ($1,$2,'credenciales',$3,$4,$5,$6,$7::varchar,$8, CASE WHEN $7::varchar='enviado' THEN NOW() END)`,
    [colegioId, alumnoId || null, para, oculto.asunto, oculto.texto, oculto.html, estado, error]);
  return estado === 'enviado' ? { enviado: true, para } : { enviado: false, motivo: error };
}

/** Genera una contraseña nueva en Moodle y la envía por correo */
async function reenviarCredenciales({ colegioId, moodleUserId, para, nombre, alumnoId }) {
  const { rows: [c] } = await pool.query('SELECT moodle_url, moodle_token FROM colegios WHERE id = $1', [colegioId]);
  if (!c || !c.moodle_url || !moodleUserId) throw new Error('Esta persona no tiene usuario de Moodle vinculado');
  const u = await mdl.getUserById({ moodleUrl: c.moodle_url, token: c.moodle_token, userId: moodleUserId });
  if (!u) throw new Error('No se encontró el usuario en Moodle');
  const contrasena = mdl.generarPasswordSegura();
  await mdl.updatePassword({ moodleUrl: c.moodle_url, token: c.moodle_token, userId: moodleUserId, password: contrasena });
  return enviarCredenciales({ colegioId, para: para || u.email, nombre, usuario: u.username, contrasena, alumnoId });
}

module.exports = { enviarCredenciales, reenviarCredenciales };

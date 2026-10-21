const axios = require('axios');

// Gmail API por HTTPS (Render gratis bloquea SMTP).
// Cada colegio puede conectar su propio Gmail (se guarda cifrado). Si no lo hace, se usa el correo general:
// GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_FROM
const pool = require('../../db');
const { descifrar } = require('../cripto');
const configurado = () => !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);
const remitente = () => process.env.GMAIL_FROM || 'uluahn.tv@gmail.com';

// Cuenta con la que se envía: la del colegio si la conectó, si no la general
async function cuenta(colegioId) {
  if (colegioId) {
    const { rows: [c] } = await pool.query('SELECT gmail_refresh_token, gmail_correo FROM colegios WHERE id = $1', [colegioId]);
    if (c && c.gmail_refresh_token && c.gmail_correo) { try { return { refresh: descifrar(c.gmail_refresh_token), from: c.gmail_correo, propia: true }; } catch (e) { /* sin acceso válido */ } }
  }
  return configurado() ? { refresh: process.env.GMAIL_REFRESH_TOKEN, from: remitente(), propia: false } : null;
}
const disponible = async (colegioId) => !!(await cuenta(colegioId));
const remitenteDe = async (colegioId) => { const c = await cuenta(colegioId); return c ? c.from : remitente(); };

const tokens = new Map();
async function accessToken(refresh) {
  const t = tokens.get(refresh);
  if (t && Date.now() < t.vence - 60000) return t.token;
  const r = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID, client_secret: process.env.GMAIL_CLIENT_SECRET,
    refresh_token: refresh, grant_type: 'refresh_token'
  }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 });
  tokens.set(refresh, { token: r.data.access_token, vence: Date.now() + (r.data.expires_in || 3000) * 1000 });
  return r.data.access_token;
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const wrap = (s) => s.replace(/(.{76})/g, '$1\r\n');
const encabezado = (s) => '=?UTF-8?B?' + b64(String(s).replace(/[\r\n]+/g, ' ')) + '?=';

function construirMensaje({ nombreRemitente, to, asunto, html, texto, adjuntos, de }) {
  const lim = 'b_' + Math.random().toString(36).slice(2);
  const limpio = (s) => String(s).replace(/[\r\n<>]/g, '');
  const alt = [
    `--${lim}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', wrap(b64(texto)),
    `--${lim}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', wrap(b64(html)),
    `--${lim}--`
  ].join('\r\n');
  const cab = [`From: ${encabezado(nombreRemitente || 'Notificaciones')} <${limpio(de || remitente())}>`, `To: ${limpio(to)}`, `Subject: ${encabezado(asunto)}`, 'MIME-Version: 1.0'];
  if (!adjuntos || !adjuntos.length) return [...cab, `Content-Type: multipart/alternative; boundary="${lim}"`, '', alt, ''].join('\r\n');
  const mix = 'm_' + Math.random().toString(36).slice(2);
  const partes = adjuntos.map((a) => [
    `--${mix}`, `Content-Type: ${a.tipo || 'application/octet-stream'}; name="${limpio(a.nombre)}"`, 'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${limpio(a.nombre)}"`, '', wrap(a.buffer.toString('base64'))
  ].join('\r\n'));
  return [...cab, `Content-Type: multipart/mixed; boundary="${mix}"`, '', `--${mix}`, `Content-Type: multipart/alternative; boundary="${lim}"`, '', alt, ...partes, `--${mix}--`, ''].join('\r\n');
}

async function enviar(msg) {
  const c = await cuenta(msg.colegioId);
  if (!c) throw new Error('El correo no está configurado');
  const raw = Buffer.from(construirMensaje({ ...msg, de: c.from })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  try {
    const r = await axios.post('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { raw },
      { headers: { Authorization: 'Bearer ' + (await accessToken(c.refresh)) }, timeout: 30000 });
    return r.data.id;
  } catch (e) {
    const d = e.response && e.response.data;
    if (e.response && e.response.status === 401) tokens.delete(c.refresh);
    throw new Error((d && (d.error_description || (d.error && (d.error.message || d.error)))) || e.message);
  }
}

module.exports = { configurado, disponible, remitenteDe, enviar, remitente, construirMensaje };

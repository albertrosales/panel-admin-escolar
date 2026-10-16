const axios = require('axios');

// Gmail API por HTTPS (Render gratis bloquea SMTP). Variables: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_FROM
const configurado = () => !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);
const remitente = () => process.env.GMAIL_FROM || 'uluahn.tv@gmail.com';

let token = null, vence = 0;
async function accessToken() {
  if (token && Date.now() < vence - 60000) return token;
  const r = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID, client_secret: process.env.GMAIL_CLIENT_SECRET,
    refresh_token: process.env.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token'
  }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 });
  token = r.data.access_token; vence = Date.now() + (r.data.expires_in || 3000) * 1000;
  return token;
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const wrap = (s) => s.replace(/(.{76})/g, '$1\r\n');
const encabezado = (s) => '=?UTF-8?B?' + b64(String(s).replace(/[\r\n]+/g, ' ')) + '?=';

function construirMensaje({ nombreRemitente, to, asunto, html, texto }) {
  const lim = 'b_' + Math.random().toString(36).slice(2);
  const limpio = (s) => String(s).replace(/[\r\n<>]/g, '');
  return [
    `From: ${encabezado(nombreRemitente || 'Notificaciones')} <${limpio(remitente())}>`,
    `To: ${limpio(to)}`,
    `Subject: ${encabezado(asunto)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${lim}"`, '',
    `--${lim}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', wrap(b64(texto)),
    `--${lim}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', wrap(b64(html)),
    `--${lim}--`, ''
  ].join('\r\n');
}

async function enviar(msg) {
  if (!configurado()) throw new Error('El correo no está configurado en el servidor');
  const raw = Buffer.from(construirMensaje(msg)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  try {
    const r = await axios.post('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { raw },
      { headers: { Authorization: 'Bearer ' + (await accessToken()) }, timeout: 30000 });
    return r.data.id;
  } catch (e) {
    const d = e.response && e.response.data;
    if (e.response && e.response.status === 401) token = null;
    throw new Error((d && (d.error_description || (d.error && (d.error.message || d.error)))) || e.message);
  }
}

module.exports = { configurado, enviar, remitente, construirMensaje };

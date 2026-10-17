// Llena la plantilla SACE alojada en Google Sheets: copia -> escribe datos -> exporta -> borra la copia.
// Requiere GOOGLE_SA_JSON (llave de cuenta de servicio) y SACE_PLANTILLA_ID (id de la hoja, compartida con esa cuenta).
const axios = require('axios');
const jwt = require('jsonwebtoken');

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
let cache = { token: null, exp: 0 };

function credenciales() {
  const raw = process.env.GOOGLE_SA_JSON;
  if (!raw) return null;
  for (const intento of [() => JSON.parse(raw), () => JSON.parse(raw.replace(/\r?\n/g, '\\n')), () => JSON.parse(Buffer.from(raw, 'base64').toString())]) {
    try { const c = intento(); if (c.client_email && c.private_key) return c; } catch { /* siguiente */ }
  }
  return null;
}
const configurado = () => !!(credenciales() && process.env.SACE_PLANTILLA_ID);

async function token() {
  if (cache.token && Date.now() < cache.exp) return cache.token;
  const c = credenciales();
  const ahora = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign({ iss: c.client_email, scope: 'https://www.googleapis.com/auth/drive', aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600 }, c.private_key, { algorithm: 'RS256' });
  const r = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  cache = { token: r.data.access_token, exp: Date.now() + (r.data.expires_in - 120) * 1000 };
  return cache.token;
}

async function g(method, url, data, extra) {
  try {
    const r = await axios({ method, url, data, headers: { Authorization: 'Bearer ' + (await token()) }, ...(extra || {}) });
    return r.data;
  } catch (e) {
    const d = e.response && e.response.data;
    const m = (d && d.error && (d.error.message || d.error)) || (Buffer.isBuffer(d) ? d.toString().slice(0, 200) : e.message);
    const err = new Error('Google: ' + (typeof m === 'string' ? m : JSON.stringify(m)));
    err.status = 502; throw err;
  }
}

const col = (n) => String.fromCharCode(65 + n);

async function llenar({ encabezado: e, alumnos }) {
  const ID = process.env.SACE_PLANTILLA_ID;
  const meta = await g('get', `https://www.googleapis.com/drive/v3/files/${ID}?fields=id,mimeType,name&supportsAllDrives=true`);
  if (meta.mimeType !== SHEET_MIME) { const er = new Error('La plantilla SACE debe ser una hoja de Google (en Drive: Abrir con → Hojas de cálculo de Google → Archivo → Guardar como hoja de Google).'); er.status = 400; throw er; }
  const copia = await g('post', `https://www.googleapis.com/drive/v3/files/${ID}/copy?supportsAllDrives=true`, { name: 'SACE temporal ' + Date.now() });
  try {
    const S = `https://sheets.googleapis.com/v4/spreadsheets/${copia.id}`;
    const info = await g('get', S + '?fields=sheets.properties');
    const hoja = info.sheets[0].properties; const nombre = hoja.title.replace(/'/g, "''");
    const leer = async () => (await g('get', `${S}/values/${encodeURIComponent("'" + nombre + "'!A1:M400")}`)).values || [];
    let vals = await leer();
    const celda = (r, c) => String((vals[r] && vals[r][c]) || '');
    const iInas = vals.findIndex((_, r) => celda(r, 3).toUpperCase().includes('INASISTENCIAS'));
    const iFin = vals.findIndex((_, r) => celda(r, 0).includes('Fin del documento'));
    if (iInas < 0 || iFin < 0 || iFin <= iInas + 1) { const er = new Error('No reconozco la plantilla: debe tener la fila de "INASISTENCIAS", al menos una fila de alumno y la línea "Fin del documento".'); er.status = 400; throw er; }
    const ini = iInas + 1, existentes = iFin - ini, n = alumnos.length;
    const reqs = [];
    if (n > existentes) reqs.push({ insertDimension: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: iFin, endIndex: iFin + (n - existentes) }, inheritFromBefore: true } });
    if (n < existentes && n >= 1) reqs.push({ deleteDimension: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: ini + n, endIndex: iFin } } });
    if (reqs.length) await g('post', S + ':batchUpdate', { requests: reqs });

    const q = (a) => `'${nombre}'!${a}`;
    const data = [
      { range: q('A1'), values: [[e.centro || '']] },
      { range: q('A2'), values: [['MODALIDAD: ' + (e.modalidad || '')]] },
      { range: q('A3'), values: [[e.grado || '']] },
      { range: q('A4'), values: [['JORNADA ' + (e.jornada || '')]] },
      { range: q('A5'), values: [['ASIGNATURA ' + (e.asignatura || '')]] }
    ];
    if (n) {
      const filas = alumnos.map((a) => {
        const f = [a.documento || 'HND', String(a.identidad || ''), a.nombre];
        for (let i = 0; i < 4; i++) { const p = (a.p || [])[i] || {}; f.push(p.inas === '' || p.inas == null ? '' : Number(p.inas), p.nota === '' || p.nota == null ? '' : Number(p.nota)); }
        f.push('', ''); // recuperación
        return f;
      });
      data.push({ range: q(`A${ini + 1}:${col(12)}${ini + n}`), values: filas });
    }
    // Identidad como texto para no perder el cero inicial
    if (n) await g('post', S + ':batchUpdate', { requests: [{ repeatCell: { range: { sheetId: hoja.sheetId, startRowIndex: ini, endRowIndex: ini + n, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } }, fields: 'userEnteredFormat.numberFormat' } }] });
    await g('post', `${S}/values:batchUpdate`, { valueInputOption: 'RAW', data });
    return await g('get', `https://www.googleapis.com/drive/v3/files/${copia.id}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`, null, { responseType: 'arraybuffer' }).then((b) => Buffer.from(b));
  } finally {
    await g('delete', `https://www.googleapis.com/drive/v3/files/${copia.id}?supportsAllDrives=true`).catch(() => {});
  }
}

module.exports = { configurado, llenar, XLSX_MIME };

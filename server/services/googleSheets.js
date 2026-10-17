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
  const assertion = jwt.sign({ iss: c.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly', aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600 }, c.private_key, { algorithm: 'RS256' });
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
  const ExcelJS = require('exceljs');
  const ID = process.env.SACE_PLANTILLA_ID;
  const meta = await g('get', `https://www.googleapis.com/drive/v3/files/${ID}?fields=id,mimeType&supportsAllDrives=true`);
  if (meta.mimeType !== SHEET_MIME) { const er = new Error('La plantilla SACE debe ser una hoja de Google (en Drive: Archivo → Guardar como hoja de Google).'); er.status = 400; throw er; }
  // Se descarga la plantilla (solo lectura) y se llena en el servidor: no se crea nada en Drive
  const bin = await g('get', `https://www.googleapis.com/drive/v3/files/${ID}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`, null, { responseType: 'arraybuffer' });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bin));
  const ws = wb.worksheets[0];
  const NC = 15;
  const texto = (r, c) => { const v = ws.getRow(r).getCell(c).value; return v == null ? '' : (typeof v === 'object' ? (v.richText ? v.richText.map((x) => x.text).join('') : String(v.result || v.text || '')) : String(v)); };
  let rInas = 0, rFin = 0;
  for (let r = 1; r <= ws.rowCount; r++) {
    if (!rInas && texto(r, 4).toUpperCase().includes('INASISTENCIAS')) rInas = r;
    if (!rFin && texto(r, 1).includes('Fin del documento')) rFin = r;
  }
  if (!rInas || !rFin || rFin <= rInas + 1) { const er = new Error('No reconozco la plantilla: debe tener la fila de "INASISTENCIAS", al menos una fila de alumno y la línea "Fin del documento".'); er.status = 400; throw er; }

  const ini = rInas + 1, ultimo = ws.rowCount, n = alumnos.length;
  const copiar = (r) => ({ h: ws.getRow(r).height, celdas: Array.from({ length: NC }, (_, i) => { const c = ws.getRow(r).getCell(i + 1); return { v: c.value, s: c.style ? JSON.parse(JSON.stringify(c.style)) : {} }; }) });
  const molde = copiar(ini);
  const cola = []; for (let r = rFin; r <= ultimo; r++) cola.push(copiar(r));
  for (let r = rFin; r <= ultimo; r++) { try { ws.unMergeCells(r, 1, r, NC); } catch { /* sin combinar */ } }
  const limite = Math.max(ultimo, ini + n + cola.length);
  for (let r = ini; r <= limite; r++) for (let c = 1; c <= NC; c++) { const cell = ws.getRow(r).getCell(c); cell.value = null; cell.style = {}; }

  const ponerFila = (r, mold, valores) => { const row = ws.getRow(r); if (mold.h) row.height = mold.h; mold.celdas.forEach((x, i) => { const c = row.getCell(i + 1); c.style = JSON.parse(JSON.stringify(x.s)); c.value = valores ? (valores[i] === undefined ? null : valores[i]) : x.v; }); row.commit && row.commit(); };
  alumnos.forEach((a, i) => {
    const f = [a.documento || 'HND', String(a.identidad || ''), a.nombre];
    for (let k = 0; k < 4; k++) { const p = (a.p || [])[k] || {}; f.push(p.inas === '' || p.inas == null ? null : Number(p.inas), p.nota === '' || p.nota == null ? null : Number(p.nota)); }
    ponerFila(ini + i, molde, f);
  });
  cola.forEach((m, i) => { const r = ini + n + i; ponerFila(r, m, null); ws.mergeCells(r, 1, r, NC); });

  const poner = (r, v) => { ws.getRow(r).getCell(1).value = v; };
  poner(1, e.centro || '');
  poner(2, 'MODALIDAD: ' + (e.modalidad || ''));
  poner(3, e.grado || '');
  poner(4, 'JORNADA ' + (e.jornada || ''));
  poner(5, 'ASIGNATURA ' + (e.asignatura || ''));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { configurado, llenar, XLSX_MIME };

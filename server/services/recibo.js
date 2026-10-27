const pool = require('../db');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesDe = (p) => { const m = /^(\d{4})-(\d{2})/.exec(p || ''); return m ? `${MESES[+m[2] - 1]} ${m[1]}` : p || ''; };
const fechaTxt = (v) => {
  if (!v) return '';
  const d = typeof v === 'string' ? new Date(v.slice(0, 10) + 'T12:00:00') : new Date(v);
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
};
const lempiras = (n) => 'L. ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numeroRecibo = (id) => 'R-' + String(id).padStart(6, '0');

// ---------- Monto en letras ("Son: mil doscientos lempiras con 50/100") ----------
const U = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const D = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
function menosDeMil(n) {
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100), r = n % 100; const p = [];
  if (c) p.push(C[c]);
  if (r) p.push(r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' y ' + U[r % 10] : ''));
  return p.join(' ');
}
function aLetras(n) {
  n = Math.floor(n);
  if (n === 0) return 'cero';
  const mill = Math.floor(n / 1e6), miles = Math.floor((n % 1e6) / 1000), r = n % 1000; const p = [];
  if (mill) p.push(mill === 1 ? 'un millón' : menosDeMil(mill) + ' millones');
  if (miles) p.push(miles === 1 ? 'mil' : menosDeMil(miles).replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un') + ' mil');
  if (r) p.push(menosDeMil(r));
  return p.join(' ');
}
function montoEnLetras(monto) {
  const m = Math.round(Number(monto || 0) * 100); const ent = Math.floor(m / 100), cen = m % 100;
  const t = aLetras(ent).replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un').replace(/^./, (x) => x.toUpperCase());
  return `${t} lempira${ent === 1 ? '' : 's'}` + (cen ? ` con ${String(cen).padStart(2, '0')}/100` : (ent === 1 ? ' exacto' : ' exactos'));
}

/** Datos listos para dibujar los recibos de los cobros pagados indicados (solo del colegio) */
async function datosRecibos(colegioId, ids) {
  ids = (ids || []).map(Number).filter(Boolean);
  if (!ids.length) return [];
  const { rows } = await pool.query(
    `SELECT p.id, p.periodo, p.monto::float AS monto, p.recargo::float AS recargo, p.descuento_aplicado::float AS descuento, p.fecha_pago, p.metodo_pago,
            a.id AS alumno_id, a.nombre_completo, a.codigo, a.nombre_encargado, a.correo_encargado,
            c.id AS colegio_id, c.nombre AS colegio, c.correo_color AS color, (c.logo_data IS NOT NULL) AS tiene_logo,
            c.firma_direccion AS direccion, c.firma_telefono AS telefono, c.firma_web AS web
     FROM pagos p JOIN alumnos a ON a.id = p.alumno_id JOIN colegios c ON c.id = a.colegio_id
     WHERE p.pagado AND a.colegio_id = $1 AND p.id = ANY($2) ORDER BY p.fecha_pago, p.id`, [colegioId, ids]);
  return rows.map((r) => ({
    id: r.id, numero: numeroRecibo(r.id), concepto: 'Mensualidad de ' + mesDe(r.periodo), periodo: r.periodo,
    monto: r.monto, recargo: r.recargo || 0, descuento: r.descuento || 0, en_letras: montoEnLetras(r.monto),
    fecha_pago: r.fecha_pago, fecha_texto: fechaTxt(r.fecha_pago), metodo: r.metodo_pago || 'Efectivo',
    alumno: { id: r.alumno_id, nombre: r.nombre_completo, codigo: r.codigo, encargado: r.nombre_encargado, correo: r.correo_encargado },
    colegio: { id: r.colegio_id, nombre: r.colegio, color: /^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : '#2455e6', tiene_logo: r.tiene_logo, direccion: r.direccion, telefono: r.telefono, web: r.web }
  }));
}

const hex = (h) => { const n = parseInt(h.slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const limpiar = (t) => String(t == null ? '' : t).replace(/[^\x20-\x7EÁÉÍÓÚÜÑáéíóúüñ¿¡°ºª·–—]/g, '').replace(/[–—]/g, '-');

/** Dibuja un recibo dentro de un cuadro de 612 x 396 pt (media carta) cuyo borde superior está en yTop */
async function dibujar(pdf, page, d, yTop, fuentes, logoImg) {
  const { reg, neg } = fuentes; const W = 612, H = 396, m = 26;
  const y0 = yTop - H; const col = hex(d.colegio.color);
  const t = (txt, x, y, o = {}) => page.drawText(limpiar(txt), { x, y: y0 + y, size: o.size || 10, font: o.bold ? neg : reg, color: o.color || rgb(.1, .12, .16), maxWidth: o.maxWidth });
  page.drawRectangle({ x: m - 6, y: y0 + 10, width: W - 2 * (m - 6), height: H - 20, borderColor: rgb(.8, .82, .86), borderWidth: 1 });
  // franja superior de color
  page.drawRectangle({ x: m - 6, y: y0 + H - 78, width: W - 2 * (m - 6), height: 68, color: col });
  let xt = m + 6;
  if (logoImg) {
    const esc = Math.min(48 / logoImg.height, 120 / logoImg.width);
    const w = logoImg.width * esc, h = logoImg.height * esc;
    page.drawRectangle({ x: xt - 4, y: y0 + H - 44 - 24 - 2, width: w + 8, height: h + 8 > 52 ? 52 : h + 8, color: rgb(1, 1, 1) });
    page.drawImage(logoImg, { x: xt, y: y0 + H - 44 - h / 2 - 2, width: w, height: h });
    xt += w + 18;
  }
  t(d.colegio.nombre, xt, H - 40, { size: 15, bold: true, color: rgb(1, 1, 1), maxWidth: 300 });
  const sub = [d.colegio.direccion, d.colegio.telefono].filter(Boolean).join('  ·  ');
  if (sub) t(sub, xt, H - 56, { size: 8.5, color: rgb(1, 1, 1), maxWidth: 300 });
  const wR = neg.widthOfTextAtSize('RECIBO DE PAGO', 12);
  t('RECIBO DE PAGO', W - m - 6 - wR, H - 38, { size: 12, bold: true, color: rgb(1, 1, 1) });
  const wN = neg.widthOfTextAtSize('N.º ' + d.numero, 13);
  t('N.º ' + d.numero, W - m - 6 - wN, H - 58, { size: 13, bold: true, color: rgb(1, 1, 1) });
  // datos
  const fila = (etq, val, y) => { t(etq, m + 6, y, { size: 8.5, color: rgb(.42, .45, .5) }); t(val, m + 100, y, { size: 11, bold: true, maxWidth: W - 2 * m - 110 }); };
  fila('Fecha de pago', d.fecha_texto, H - 108);
  fila('Recibimos de', d.alumno.encargado || d.alumno.nombre, H - 130);
  fila('Alumno', d.alumno.nombre + (d.alumno.codigo ? '   (Código ' + d.alumno.codigo + ')' : ''), H - 152);
  fila('Concepto', d.concepto, H - 174);
  fila('Forma de pago', d.metodo, H - 196);
  // monto
  page.drawRectangle({ x: m + 6, y: y0 + 82, width: W - 2 * (m + 6), height: 52, color: rgb(.96, .97, .98), borderColor: col, borderWidth: 1.2 });
  t('TOTAL PAGADO', m + 18, 112, { size: 8.5, color: rgb(.42, .45, .5) });
  const tx = lempiras(d.monto); const wM = neg.widthOfTextAtSize(tx, 22);
  t(tx, W - m - 18 - wM, 106, { size: 22, bold: true, color: col });
  t('Son: ' + d.en_letras, m + 18, 92, { size: 9, maxWidth: W - 2 * m - 190 });
  if (d.recargo > 0) t('Incluye recargo por mora de ' + lempiras(d.recargo), m + 18, 100, { size: 8, color: rgb(.42, .45, .5) });
  // firma
  page.drawLine({ start: { x: W - m - 190, y: y0 + 52 }, end: { x: W - m - 6, y: y0 + 52 }, thickness: .8, color: rgb(.5, .5, .55) });
  const wF = reg.widthOfTextAtSize('Firma y sello', 8.5);
  t('Firma y sello', W - m - 98 - wF / 2, 40, { size: 8.5, color: rgb(.42, .45, .5) });
  t('Gracias por su pago.', m + 6, 52, { size: 10, bold: true });
  t('Este documento es un comprobante de pago emitido por ' + d.colegio.nombre + '.', m + 6, 38, { size: 7.5, color: rgb(.5, .52, .56), maxWidth: 330 });
}

async function logoDe(pdf, colegioId) {
  try {
    const { rows: [c] } = await pool.query('SELECT logo_data, logo_tipo FROM colegios WHERE id = $1', [colegioId]);
    if (!c || !c.logo_data) return null;
    return c.logo_tipo === 'image/png' ? await pdf.embedPng(c.logo_data) : await pdf.embedJpg(c.logo_data);
  } catch { return null; }
}

/** PDF: una hoja carta con 2 recibos por página (o media carta si es uno solo y soloUno = true) */
async function pdfRecibos(datos, { soloUno } = {}) {
  const pdf = await PDFDocument.create();
  const fuentes = { reg: await pdf.embedFont(StandardFonts.Helvetica), neg: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const logos = {};
  for (const d of datos) if (!(d.colegio.id in logos)) logos[d.colegio.id] = await logoDe(pdf, d.colegio.id);
  if (soloUno && datos.length === 1) {
    const p = pdf.addPage([612, 396]);
    await dibujar(pdf, p, datos[0], 396, fuentes, logos[datos[0].colegio.id]);
  } else {
    for (let i = 0; i < datos.length; i += 2) {
      const p = pdf.addPage([612, 792]);
      await dibujar(pdf, p, datos[i], 792, fuentes, logos[datos[i].colegio.id]);
      if (datos[i + 1]) await dibujar(pdf, p, datos[i + 1], 396, fuentes, logos[datos[i + 1].colegio.id]);
      p.drawLine({ start: { x: 20, y: 396 }, end: { x: 592, y: 396 }, thickness: .6, color: rgb(.7, .7, .75), dashArray: [4, 4] });
    }
  }
  return Buffer.from(await pdf.save());
}

module.exports = { datosRecibos, pdfRecibos, numeroRecibo, montoEnLetras, mesDe, lempiras };

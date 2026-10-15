const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const pool = require('../db');

const OUT = path.join(__dirname, '..', '..', 'generated-pdfs');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

async function generarBoletin(alumnoId, colegioId, notas) {
  const { rows: [a] } = await pool.query(
    'SELECT a.nombre_completo, c.nombre AS colegio FROM alumnos a JOIN colegios c ON c.id=a.colegio_id WHERE a.id=$1', [alumnoId]);
  const { rows: [as] } = await pool.query(
    `SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE estado IN ('P','T','J'))::int ok FROM asistencia WHERE alumno_id=$1`, [alumnoId]);

  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const b = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.13, 0.16), dim = rgb(0.42, 0.44, 0.49), blue = rgb(0.14, 0.33, 0.9);
  const t = (s, x, y, size, font, color) => page.drawText(String(s), { x, y, size, font: font || f, color: color || ink });

  t(a.colegio, 60, 730, 18, b);
  t('BOLETÍN DE CALIFICACIONES', 60, 708, 11, b, dim);
  t('Alumno: ' + a.nombre_completo, 60, 670, 12, b);
  t('Fecha: ' + new Date().toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' }), 60, 652, 10, f, dim);

  let y = 610;
  t('Clase', 60, y, 10, b, dim); t('Nota', 380, y, 10, b, dim);
  page.drawLine({ start: { x: 60, y: y - 6 }, end: { x: 552, y: y - 6 }, thickness: 0.7, color: rgb(0.82, 0.83, 0.86) });
  y -= 26;
  for (const n of notas) {
    if (y < 120) break;
    t(n.clase, 60, y, 11);
    t(n.porcentaje == null ? 'Sin nota' : n.porcentaje + '%', 380, y, 11, b);
    if (n.porcentaje != null) {
      page.drawRectangle({ x: 430, y: y - 2, width: 120, height: 9, color: rgb(0.9, 0.92, 0.97) });
      page.drawRectangle({ x: 430, y: y - 2, width: Math.max(0, Math.min(100, n.porcentaje)) * 1.2, height: 9, color: blue });
    }
    y -= 24;
  }
  const vals = notas.filter((n) => n.porcentaje != null).map((n) => n.porcentaje);
  if (vals.length) {
    y -= 8;
    t('Promedio general: ' + (Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10) + '%', 60, y, 12, b);
    y -= 22;
  }
  t('Asistencia: ' + (as.total ? Math.round((as.ok / as.total) * 100) + '% (' + as.ok + ' de ' + as.total + ' registros)' : 'sin registros'), 60, y, 11);

  const filename = `boletin_${alumnoId}_${Date.now()}.pdf`;
  fs.writeFileSync(path.join(OUT, filename), await doc.save());
  const url = `/generated-pdfs/${filename}`;
  await pool.query(`INSERT INTO documentos_generados (colegio_id, alumno_id, tipo, archivo_url) VALUES ($1,$2,'boletin',$3)`, [colegioId, alumnoId, url]);
  await pool.query(`INSERT INTO alumno_historial (alumno_id, tipo, descripcion) VALUES ($1,'reporte_generado','Boletín de calificaciones generado')`, [alumnoId]);
  return { archivo_url: url };
}

module.exports = { generarBoletin };

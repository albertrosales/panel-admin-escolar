/**
 * Generación de PDFs: constancias de estudio, reportes de pago e informes docentes.
 * Usa pdf-lib (no requiere navegador headless, ligero y estable en Render).
 */
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const pool = require('../db');

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'generated-pdfs');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function baseDoc(titulo, colegioNombre) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // carta
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  page.drawText(colegioNombre, { x: 50, y: 740, size: 12, font: fontBold, color: rgb(0.1, 0.1, 0.3) });
  page.drawText(titulo, { x: 50, y: 710, size: 18, font: fontBold, color: rgb(0.1, 0.1, 0.3) });
  page.drawLine({ start: { x: 50, y: 700 }, end: { x: 562, y: 700 }, thickness: 1, color: rgb(0.7, 0.7, 0.7) });

  return { doc, page, font, fontBold };
}

async function generarConstanciaEstudio(alumnoId) {
  const { rows: [alumno] } = await pool.query(
    `SELECT a.*, g.nombre AS grado_nombre, c.nombre AS colegio_nombre
     FROM alumnos a
     JOIN grados g ON g.id = a.grado_id
     JOIN colegios c ON c.id = a.colegio_id
     WHERE a.id = $1`, [alumnoId]
  );
  if (!alumno) throw new Error('Alumno no encontrado');

  const { doc, page, font, fontBold } = await baseDoc('CONSTANCIA DE ESTUDIO', alumno.colegio_nombre);

  const texto = `Por medio de la presente se hace constar que el/la alumno(a) ${alumno.nombre_completo} se encuentra debidamente matriculado(a) en ${alumno.grado_nombre} durante el presente periodo académico.`;
  drawWrappedText(page, texto, 50, 660, font, 11, 460);

  page.drawText(`Fecha de emisión: ${new Date().toLocaleDateString('es-HN')}`, { x: 50, y: 560, size: 10, font });
  page.drawText('_______________________________', { x: 50, y: 480, size: 11, font });
  page.drawText('Firma y sello de dirección', { x: 50, y: 465, size: 9, font });

  return finalizarYGuardar(doc, alumnoId, 'constancia_estudio', alumno.colegio_id, alumnoId, null);
}

async function generarReportePago(alumnoId) {
  const { rows: [alumno] } = await pool.query(
    `SELECT a.*, c.nombre AS colegio_nombre FROM alumnos a JOIN colegios c ON c.id = a.colegio_id WHERE a.id = $1`,
    [alumnoId]
  );
  const { rows: pagos } = await pool.query(
    'SELECT * FROM pagos WHERE alumno_id = $1 ORDER BY fecha_vencimiento DESC', [alumnoId]
  );

  const { doc, page, font, fontBold } = await baseDoc('REPORTE DE PAGOS', alumno.colegio_nombre);

  page.drawText(`Alumno: ${alumno.nombre_completo}`, { x: 50, y: 665, size: 11, font: fontBold });
  page.drawText(`Estado actual: ${alumno.estado_pago}`, { x: 50, y: 648, size: 11, font });

  let y = 615;
  page.drawText('Periodo', { x: 50, y, size: 10, font: fontBold });
  page.drawText('Monto', { x: 180, y, size: 10, font: fontBold });
  page.drawText('Vencimiento', { x: 280, y, size: 10, font: fontBold });
  page.drawText('Estado', { x: 420, y, size: 10, font: fontBold });
  y -= 18;

  for (const p of pagos) {
    if (y < 60) break; // límite simple de una página
    page.drawText(p.periodo, { x: 50, y, size: 9, font });
    page.drawText(`L. ${p.monto}`, { x: 180, y, size: 9, font });
    page.drawText(new Date(p.fecha_vencimiento).toLocaleDateString('es-HN'), { x: 280, y, size: 9, font });
    page.drawText(p.pagado ? 'Pagado' : 'Pendiente', { x: 420, y, size: 9, font });
    y -= 16;
  }

  return finalizarYGuardar(doc, alumnoId, 'reporte_pago', alumno.colegio_id, alumnoId, null);
}

async function generarInformeDocente(profesorId) {
  const { rows: [profesor] } = await pool.query(
    `SELECT p.*, c.nombre AS colegio_nombre FROM profesores p JOIN colegios c ON c.id = p.colegio_id WHERE p.id = $1`,
    [profesorId]
  );
  const { rows: resenas } = await pool.query(
    'SELECT * FROM profesor_resenas WHERE profesor_id = $1 ORDER BY fecha DESC', [profesorId]
  );

  const { doc, page, font, fontBold } = await baseDoc('INFORME DOCENTE', profesor.colegio_nombre);

  const antiguedad = ((new Date() - new Date(profesor.fecha_ingreso)) / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1);
  page.drawText(`Docente: ${profesor.nombre_completo}`, { x: 50, y: 665, size: 11, font: fontBold });
  page.drawText(`Antigüedad: ${antiguedad} años`, { x: 50, y: 648, size: 10, font });
  page.drawText(`Materias: ${(profesor.materias || []).join(', ')}`, { x: 50, y: 631, size: 10, font });

  let y = 600;
  page.drawText('Observaciones registradas:', { x: 50, y, size: 11, font: fontBold });
  y -= 20;
  for (const r of resenas) {
    if (y < 60) break;
    const linea = `${new Date(r.fecha).toLocaleDateString('es-HN')} — ${r.autor || 'N/A'}: ${r.comentario}`;
    y = drawWrappedText(page, linea, 50, y, font, 9, 500);
    y -= 10;
  }

  return finalizarYGuardar(doc, profesorId, 'informe_docente', profesor.colegio_id, null, profesorId);
}

// Helper: texto con salto de línea simple por ancho aproximado
function drawWrappedText(page, texto, x, y, font, size, maxWidth) {
  const palabras = texto.split(' ');
  let linea = '';
  for (const palabra of palabras) {
    const pruebaLinea = linea ? `${linea} ${palabra}` : palabra;
    const ancho = font.widthOfTextAtSize(pruebaLinea, size);
    if (ancho > maxWidth) {
      page.drawText(linea, { x, y, size, font });
      y -= size + 4;
      linea = palabra;
    } else {
      linea = pruebaLinea;
    }
  }
  if (linea) {
    page.drawText(linea, { x, y, size, font });
    y -= size + 4;
  }
  return y;
}

async function finalizarYGuardar(doc, refId, tipo, colegioId, alumnoId, profesorId) {
  const bytes = await doc.save();
  const filename = `${tipo}_${refId}_${Date.now()}.pdf`;
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, bytes);

  const { rows: [registro] } = await pool.query(
    `INSERT INTO documentos_generados (colegio_id, alumno_id, profesor_id, tipo, archivo_url)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [colegioId, alumnoId, profesorId, tipo, `/generated-pdfs/${filename}`]
  );

  if (alumnoId) {
    await pool.query(
      `INSERT INTO alumno_historial (alumno_id, tipo, descripcion, metadata)
       VALUES ($1, 'reporte_generado', $2, $3)`,
      [alumnoId, `Documento generado: ${tipo}`, JSON.stringify({ archivo: registro.archivo_url })]
    );
  }

  return { ...registro, filepath };
}

module.exports = { generarConstanciaEstudio, generarReportePago, generarInformeDocente };

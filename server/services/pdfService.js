/**
 * Generación de PDFs: constancias de estudio, reportes de pago e informes docentes.
 * Usa pdf-lib. Constancia y reporte de pago dejan margen superior en blanco
 * para imprimirse sobre hoja membretada.
 */
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const pool = require('../db');

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'generated-pdfs');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 60;
const LETTERHEAD_TOP = 195; // espacio en blanco reservado para hoja membretada

const INK = rgb(0.12, 0.13, 0.16);
const INK_DIM = rgb(0.42, 0.44, 0.49);
const LINE = rgb(0.82, 0.83, 0.86);

function fechaLarga() {
  return new Date().toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function centerText(page, text, y, font, size, color) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (PAGE_WIDTH - width) / 2, y, size, font, color: color || INK });
}

// Texto justificado a la izquierda con salto de línea automático. Devuelve el nuevo y.
function drawParagraph(page, texto, x, y, font, size, maxWidth, lineHeight) {
  lineHeight = lineHeight || size * 1.6;
  const palabras = texto.split(' ');
  let linea = '';
  for (const palabra of palabras) {
    const prueba = linea ? linea + ' ' + palabra : palabra;
    if (font.widthOfTextAtSize(prueba, size) > maxWidth) {
      page.drawText(linea, { x, y, size, font, color: INK });
      y -= lineHeight;
      linea = palabra;
    } else {
      linea = prueba;
    }
  }
  if (linea) {
    page.drawText(linea, { x, y, size, font, color: INK });
    y -= lineHeight;
  }
  return y;
}

async function obtenerClasesAlumno(alumnoId, grado_id) {
  const result = await pool.query(
    `SELECT g.nombre FROM matriculas m JOIN grados g ON g.id = m.grado_id WHERE m.alumno_id = $1 ORDER BY g.nombre`,
    [alumnoId]
  );
  const nombres = result.rows.map((r) => r.nombre);
  if (nombres.length === 0) return null;
  if (nombres.length === 1) return nombres[0];
  return nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
}

// ------------------------------------------------------------
// CONSTANCIA DE ESTUDIO
// ------------------------------------------------------------
async function generarConstanciaEstudio(alumnoId) {
  const alumnoResult = await pool.query(
    `SELECT a.*, g.nombre AS grado_nombre, c.nombre AS colegio_nombre
     FROM alumnos a
     LEFT JOIN grados g ON g.id = a.grado_id
     JOIN colegios c ON c.id = a.colegio_id
     WHERE a.id = $1`,
    [alumnoId]
  );
  const alumno = alumnoResult.rows[0];
  if (!alumno) throw new Error('Alumno no encontrado');

  const programa = (await obtenerClasesAlumno(alumnoId)) || alumno.grado_nombre || 'su programa académico';

  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE_HEIGHT - LETTERHEAD_TOP;
  const maxWidth = PAGE_WIDTH - MARGIN_X * 2;

  centerText(page, 'CONSTANCIA DE ESTUDIO', y, fontBold, 15);
  y -= 34;

  page.drawText('A QUIEN CORRESPONDA:', { x: MARGIN_X, y, size: 11, font: fontBold, color: INK });
  y -= 26;

  const p1 = `Por medio de la presente, se hace constar que ${alumno.nombre_completo} se encuentra debidamente matriculado y activo en el programa académico ${programa}, correspondiente al presente período académico.`;
  y = drawParagraph(page, p1, MARGIN_X, y, font, 11, maxWidth);
  y -= 10;

  const p2 = `Se hace constar que ${alumno.nombre_completo} forma parte de la comunidad estudiantil y se encuentra realizando su proceso de formación académica de conformidad con el plan de estudios y los lineamientos establecidos para el programa.`;
  y = drawParagraph(page, p2, MARGIN_X, y, font, 11, maxWidth);
  y -= 10;

  const p3 = `La presente constancia se extiende a solicitud de la persona interesada, para ser presentada ante la institución, empresa, organización o autoridad que corresponda, y para los fines académicos, laborales, administrativos o personales que considere convenientes.`;
  y = drawParagraph(page, p3, MARGIN_X, y, font, 11, maxWidth);
  y -= 10;

  const p4 = `Y para los efectos legales y administrativos que correspondan, se extiende la presente CONSTANCIA DE ESTUDIO, haciendo constar que la información consignada en este documento corresponde a los registros académicos institucionales.`;
  y = drawParagraph(page, p4, MARGIN_X, y, font, 11, maxWidth);
  y -= 24;

  page.drawText(`Fecha de emisión: ${fechaLarga()}.`, { x: MARGIN_X, y, size: 11, font, color: INK });
  y -= 44;

  page.drawText('Atentamente,', { x: MARGIN_X, y, size: 11, font, color: INK });
  y -= 60;

  centerText(page, 'FIRMA Y SELLO DE DIRECCIÓN', y, fontBold, 10);
  y -= 34;

  const campos = ['Nombre:', 'Cargo:', 'Institución:', 'Teléfono:', 'Correo electrónico:'];
  for (const campo of campos) {
    page.drawText(campo, { x: MARGIN_X, y, size: 10, font, color: INK_DIM });
    page.drawLine({ start: { x: MARGIN_X + 95, y: y - 2 }, end: { x: PAGE_WIDTH - MARGIN_X, y: y - 2 }, thickness: 0.75, color: LINE });
    y -= 26;
  }

  return finalizarYGuardar(doc, alumnoId, 'constancia_estudio', alumno.colegio_id, alumnoId, null);
}

// ------------------------------------------------------------
// REPORTE DE PAGOS
// ------------------------------------------------------------
const ESTADO_LABEL = { al_dia: 'Al día', plan_pago: 'Plan de pago', moroso: 'Moroso' };
const ESTADO_COLOR = {
  al_dia: rgb(0.12, 0.57, 0.33),
  plan_pago: rgb(0.66, 0.44, 0.06),
  moroso: rgb(0.77, 0.19, 0.19)
};

async function generarReportePago(alumnoId) {
  const alumnoResult = await pool.query(
    `SELECT a.*, c.nombre AS colegio_nombre FROM alumnos a JOIN colegios c ON c.id = a.colegio_id WHERE a.id = $1`,
    [alumnoId]
  );
  const alumno = alumnoResult.rows[0];
  if (!alumno) throw new Error('Alumno no encontrado');

  const pagosResult = await pool.query(
    'SELECT * FROM pagos WHERE alumno_id = $1 ORDER BY fecha_vencimiento DESC', [alumnoId]
  );
  const pagos = pagosResult.rows;

  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE_HEIGHT - LETTERHEAD_TOP;
  const contentWidth = PAGE_WIDTH - MARGIN_X * 2;

  page.drawText('REPORTE DE ESTADO DE PAGOS', { x: MARGIN_X, y, size: 16, font: fontBold, color: INK });
  y -= 8;
  page.drawLine({ start: { x: MARGIN_X, y }, end: { x: PAGE_WIDTH - MARGIN_X, y }, thickness: 1.2, color: INK });
  y -= 28;

  // Caja resumen
  const boxTop = y;
  const boxHeight = 66;
  page.drawRectangle({ x: MARGIN_X, y: boxTop - boxHeight, width: contentWidth, height: boxHeight, borderColor: LINE, borderWidth: 1, color: rgb(0.97, 0.97, 0.98) });

  page.drawText('Alumno', { x: MARGIN_X + 16, y: boxTop - 20, size: 9, font, color: INK_DIM });
  page.drawText(alumno.nombre_completo, { x: MARGIN_X + 16, y: boxTop - 34, size: 12, font: fontBold, color: INK });

  page.drawText('Estado actual', { x: MARGIN_X + 300, y: boxTop - 20, size: 9, font, color: INK_DIM });
  page.drawText(ESTADO_LABEL[alumno.estado_pago] || alumno.estado_pago, {
    x: MARGIN_X + 300, y: boxTop - 34, size: 12, font: fontBold,
    color: ESTADO_COLOR[alumno.estado_pago] || INK
  });

  page.drawText('Fecha de emisión', { x: MARGIN_X + 16, y: boxTop - 54, size: 9, font, color: INK_DIM });
  page.drawText(fechaLarga(), { x: MARGIN_X + 110, y: boxTop - 54, size: 9, font, color: INK });

  y = boxTop - boxHeight - 30;

  // Tabla
  const colX = { periodo: MARGIN_X, monto: MARGIN_X + 130, venc: MARGIN_X + 260, estado: MARGIN_X + 400 };
  const rowHeight = 22;

  page.drawRectangle({ x: MARGIN_X, y: y - 6, width: contentWidth, height: rowHeight, color: rgb(0.93, 0.94, 0.97) });
  page.drawText('PERIODO', { x: colX.periodo + 8, y: y, size: 9, font: fontBold, color: INK_DIM });
  page.drawText('MONTO', { x: colX.monto, y: y, size: 9, font: fontBold, color: INK_DIM });
  page.drawText('VENCIMIENTO', { x: colX.venc, y: y, size: 9, font: fontBold, color: INK_DIM });
  page.drawText('ESTADO', { x: colX.estado, y: y, size: 9, font: fontBold, color: INK_DIM });
  y -= rowHeight;

  let totalPagado = 0, totalPendiente = 0;

  for (let i = 0; i < pagos.length; i++) {
    if (y < 100) break; // límite de una página
    const p = pagos[i];
    if (i % 2 === 1) {
      page.drawRectangle({ x: MARGIN_X, y: y - 6, width: contentWidth, height: rowHeight, color: rgb(0.98, 0.98, 0.99) });
    }
    page.drawText(p.periodo, { x: colX.periodo + 8, y, size: 10, font, color: INK });
    page.drawText('L. ' + Number(p.monto).toFixed(2), { x: colX.monto, y, size: 10, font, color: INK });
    page.drawText(new Date(p.fecha_vencimiento).toLocaleDateString('es-HN'), { x: colX.venc, y, size: 10, font, color: INK });
    page.drawText(p.pagado ? 'Pagado' : 'Pendiente', {
      x: colX.estado, y, size: 10, font: fontBold,
      color: p.pagado ? ESTADO_COLOR.al_dia : ESTADO_COLOR.moroso
    });

    if (p.pagado) totalPagado += Number(p.monto); else totalPendiente += Number(p.monto);
    y -= rowHeight;
    page.drawLine({ start: { x: MARGIN_X, y: y + rowHeight - 6 }, end: { x: PAGE_WIDTH - MARGIN_X, y: y + rowHeight - 6 }, thickness: 0.5, color: LINE });
  }

  y -= 16;
  page.drawLine({ start: { x: MARGIN_X, y: y + 10 }, end: { x: PAGE_WIDTH - MARGIN_X, y: y + 10 }, thickness: 1, color: INK });
  y -= 10;

  page.drawText('Total pagado:', { x: colX.venc - 60, y, size: 10, font, color: INK_DIM });
  page.drawText('L. ' + totalPagado.toFixed(2), { x: colX.estado, y, size: 10, font: fontBold, color: ESTADO_COLOR.al_dia });
  y -= 18;
  page.drawText('Total pendiente:', { x: colX.venc - 60, y, size: 10, font, color: INK_DIM });
  page.drawText('L. ' + totalPendiente.toFixed(2), { x: colX.estado, y, size: 10, font: fontBold, color: ESTADO_COLOR.moroso });

  return finalizarYGuardar(doc, alumnoId, 'reporte_pago', alumno.colegio_id, alumnoId, null);
}

// ------------------------------------------------------------
// INFORME DOCENTE
// ------------------------------------------------------------
async function generarInformeDocente(profesorId) {
  const profesorResult = await pool.query(
    `SELECT p.*, c.nombre AS colegio_nombre FROM profesores p JOIN colegios c ON c.id = p.colegio_id WHERE p.id = $1`,
    [profesorId]
  );
  const profesor = profesorResult.rows[0];
  if (!profesor) throw new Error('Profesor no encontrado');

  const resenasResult = await pool.query(
    'SELECT * FROM profesor_resenas WHERE profesor_id = $1 ORDER BY fecha DESC', [profesorId]
  );
  const resenas = resenasResult.rows;

  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE_HEIGHT - LETTERHEAD_TOP;
  const maxWidth = PAGE_WIDTH - MARGIN_X * 2;

  page.drawText('INFORME DOCENTE', { x: MARGIN_X, y, size: 16, font: fontBold, color: INK });
  y -= 8;
  page.drawLine({ start: { x: MARGIN_X, y }, end: { x: PAGE_WIDTH - MARGIN_X, y }, thickness: 1.2, color: INK });
  y -= 30;

  const antiguedad = ((new Date() - new Date(profesor.fecha_ingreso)) / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1);
  page.drawText(`Docente: ${profesor.nombre_completo}`, { x: MARGIN_X, y, size: 11, font: fontBold, color: INK });
  y -= 18;
  page.drawText(`Antigüedad: ${antiguedad} años`, { x: MARGIN_X, y, size: 10, font, color: INK_DIM });
  y -= 16;
  page.drawText(`Materias: ${(profesor.materias || []).join(', ')}`, { x: MARGIN_X, y, size: 10, font, color: INK_DIM });
  y -= 30;

  page.drawText('Observaciones registradas', { x: MARGIN_X, y, size: 11, font: fontBold, color: INK });
  y -= 20;

  for (const r of resenas) {
    if (y < 60) break;
    const linea = `${new Date(r.fecha).toLocaleDateString('es-HN')} — ${r.autor || 'N/A'}: ${r.comentario}`;
    y = drawParagraph(page, linea, MARGIN_X, y, font, 9.5, maxWidth, 14);
    y -= 8;
  }

  return finalizarYGuardar(doc, profesorId, 'informe_docente', profesor.colegio_id, null, profesorId);
}

async function finalizarYGuardar(doc, refId, tipo, colegioId, alumnoId, profesorId) {
  const bytes = await doc.save();
  const filename = `${tipo}_${refId}_${Date.now()}.pdf`;
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, bytes);

  const result = await pool.query(
    `INSERT INTO documentos_generados (colegio_id, alumno_id, profesor_id, tipo, archivo_url)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [colegioId, alumnoId, profesorId, tipo, `/generated-pdfs/${filename}`]
  );
  const registro = result.rows[0];

  if (alumnoId) {
    await pool.query(
      `INSERT INTO alumno_historial (alumno_id, tipo, descripcion, metadata)
       VALUES ($1, 'reporte_generado', $2, $3)`,
      [alumnoId, `Documento generado: ${tipo}`, JSON.stringify({ archivo: registro.archivo_url })]
    );
  }

  return Object.assign({}, registro, { filepath });
}

module.exports = { generarConstanciaEstudio, generarReportePago, generarInformeDocente };

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { datosRecibos, pdfRecibos, lempiras } = require('../services/recibo');
const { disponible, enviar } = require('../services/correo/mailer');
const { marcaDe } = require('../services/correo/firma');
const { htmlCorreo } = require('../services/correo/render');

const ids = (v) => String(v || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200);
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

// Pagos recibidos (con recibo): se pueden filtrar por fechas y por nombre o código del alumno
router.get('/', async (req, res) => {
  try {
    const p = [req.colegioId]; let w = 'a.colegio_id = $1 AND p.pagado';
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.desde || '')) { p.push(req.query.desde); w += ' AND p.fecha_pago >= $' + p.length; }
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.hasta || '')) { p.push(req.query.hasta); w += ' AND p.fecha_pago <= $' + p.length; }
    if (req.query.q) { p.push('%' + String(req.query.q).slice(0, 60) + '%'); w += ` AND (a.nombre_completo ILIKE $${p.length} OR a.codigo ILIKE $${p.length})`; }
    const { rows } = await pool.query(
      `SELECT p.id, p.periodo, p.monto::float AS monto, p.fecha_pago, p.metodo_pago, a.id AS alumno_id, a.nombre_completo, a.codigo, a.correo_encargado
       FROM pagos p JOIN alumnos a ON a.id = p.alumno_id WHERE ${w} ORDER BY p.fecha_pago DESC NULLS LAST, p.id DESC LIMIT 300`, p);
    res.json(rows.map((r) => ({ ...r, numero: 'R-' + String(r.id).padStart(6, '0') })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PDF para imprimir: 2 recibos por hoja carta
router.get('/pdf', async (req, res) => {
  try {
    const datos = await datosRecibos(req.colegioId, ids(req.query.ids));
    if (!datos.length) return res.status(404).json({ error: 'No hay recibos para esos pagos (¿ya están pagados?)' });
    res.type('application/pdf').set('Content-Disposition', 'inline; filename="recibos.pdf"').send(await pdfRecibos(datos));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Enviar el recibo (PDF adjunto) al correo del encargado
router.post('/enviar', async (req, res) => {
  try {
    if (!(await disponible(req.colegioId))) return res.status(400).json({ error: 'El colegio no tiene correo de envío conectado (Configuración → Correo de envío)' });
    const lista = await datosRecibos(req.colegioId, (req.body.ids || []).slice(0, 100));
    if (!lista.length) return res.status(400).json({ error: 'No hay pagos registrados para enviar' });
    const marca = await marcaDe(req.colegioId);
    let enviados = 0; const fallos = [];
    for (const d of lista) {
      const para = String(req.body.correo || d.alumno.correo || '').trim();
      if (!EMAIL_RE.test(para)) { fallos.push(`${d.alumno.nombre}: sin correo del encargado`); continue; }
      try {
        const texto = `Estimado(a) ${d.alumno.encargado || 'padre, madre o encargado'}:\n\nConfirmamos el pago de ${d.alumno.nombre}. Adjuntamos su recibo.\n\nRecibo N.º: ${d.numero}\nConcepto: ${d.concepto}\nMonto: ${lempiras(d.monto)}\nFecha de pago: ${d.fecha_texto}\n\nGracias por su pago.\n\n${d.colegio.nombre}`;
        await enviar({ colegioId: req.colegioId, nombreRemitente: d.colegio.nombre, to: para, asunto: `Recibo de pago ${d.numero} - ${d.colegio.nombre}`, texto, html: htmlCorreo(marca, texto),
          adjuntos: [{ nombre: `recibo-${d.numero}.pdf`, tipo: 'application/pdf', buffer: await pdfRecibos([d], { soloUno: true }) }] });
        enviados++;
      } catch (e) { fallos.push(`${d.alumno.nombre}: ${e.message}`); }
    }
    res.json({ enviados, fallos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const router = express.Router();
const pool = require('../db');
const { disponible, enviar } = require('../services/correo/mailer');
const { htmlCorreo, escapar } = require('../services/correo/render');
const { marcaDe } = require('../services/correo/firma');

const FINANZAS = ['admin', 'director', 'superadmin'];
const soloFinanzas = (req, res, next) => (FINANZAS.includes(req.usuario.rol) ? next() : res.status(403).json({ error: 'Solo dirección y administración pueden hacer esto' }));
const VENDEN = [...FINANZAS, 'secretaria'];
const puedeVender = (req, res, next) => (VENDEN.includes(req.usuario.rol) ? next() : res.status(403).json({ error: 'No tienes permiso para vender boletos' }));
const L = (n) => 'L. ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const limpio = (v, max) => { const t = String(v == null ? '' : v).trim(); return t ? t.slice(0, max) : null; };
const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin letras que se confunden (0/O, 1/I)
const nuevoCodigo = () => 'UC-' + [...crypto.randomBytes(10)].map((b) => ALFA[b % ALFA.length]).join('');

const SQL_EVENTO = `SELECT e.id, e.nombre, to_char(e.fecha,'YYYY-MM-DD') AS fecha, e.hora, e.lugar, e.descripcion, e.precio::float AS precio, e.capacidad, e.activo,
  COUNT(b.id) FILTER (WHERE b.estado <> 'anulado')::int AS vendidos,
  COUNT(b.id) FILTER (WHERE b.estado = 'usado')::int AS ingresaron,
  COUNT(b.id) FILTER (WHERE b.estado = 'pendiente')::int AS pendientes,
  COALESCE(SUM(b.monto) FILTER (WHERE b.estado IN ('pagado','usado')),0)::float AS recaudado
  FROM eventos_entrada e LEFT JOIN boletos b ON b.evento_id = e.id WHERE e.colegio_id = $1`;

router.get('/', async (req, res) => {
  try { res.json((await pool.query(SQL_EVENTO + ' GROUP BY e.id ORDER BY e.activo DESC, e.fecha DESC NULLS LAST, e.id DESC', [req.colegioId])).rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

function validarEvento(b) {
  const nombre = limpio(b.nombre, 150), precio = Number(b.precio || 0);
  if (!nombre) return { error: 'El nombre del evento es obligatorio' };
  if (!(precio >= 0)) return { error: 'El precio no es válido' };
  const cap = b.capacidad === '' || b.capacidad == null ? null : Math.max(1, parseInt(b.capacidad, 10) || 0) || null;
  return { v: { nombre, fecha: /^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '') ? b.fecha : null, hora: limpio(b.hora, 20), lugar: limpio(b.lugar, 150), descripcion: limpio(b.descripcion, 1000), precio: Math.round(precio * 100) / 100, capacidad: cap } };
}

router.post('/', soloFinanzas, async (req, res) => {
  try {
    const r = validarEvento(req.body); if (r.error) return res.status(400).json({ error: r.error }); const v = r.v;
    const { rows: [e] } = await pool.query('INSERT INTO eventos_entrada (colegio_id, nombre, fecha, hora, lugar, descripcion, precio, capacidad) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [req.colegioId, v.nombre, v.fecha, v.hora, v.lugar, v.descripcion, v.precio, v.capacidad]);
    res.status(201).json({ id: e.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', soloFinanzas, async (req, res) => {
  try {
    const r = validarEvento(req.body); if (r.error) return res.status(400).json({ error: r.error }); const v = r.v;
    const activo = req.body.activo === undefined ? true : !!req.body.activo;
    const u = await pool.query('UPDATE eventos_entrada SET nombre=$3, fecha=$4, hora=$5, lugar=$6, descripcion=$7, precio=$8, capacidad=$9, activo=$10 WHERE id=$1 AND colegio_id=$2',
      [req.params.id, req.colegioId, v.nombre, v.fecha, v.hora, v.lugar, v.descripcion, v.precio, v.capacidad, activo]);
    if (!u.rowCount) return res.status(404).json({ error: 'Evento no encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', soloFinanzas, async (req, res) => {
  try {
    const { rows: [n] } = await pool.query('SELECT COUNT(*)::int AS n FROM boletos WHERE evento_id = $1 AND colegio_id = $2', [req.params.id, req.colegioId]);
    if (n.n) return res.status(400).json({ error: 'Este evento ya tiene boletos. Ciérralo (desactívalo) en lugar de eliminarlo.' });
    await pool.query('DELETE FROM eventos_entrada WHERE id = $1 AND colegio_id = $2', [req.params.id, req.colegioId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/boletos', async (req, res) => {
  try {
    const p = [req.colegioId, req.params.id]; let w = 'colegio_id = $1 AND evento_id = $2';
    if (req.query.estado) { p.push(req.query.estado); w += ' AND estado = $' + p.length; }
    if (req.query.q) { p.push('%' + req.query.q + '%'); w += ` AND (comprador ILIKE $${p.length} OR codigo ILIKE $${p.length} OR correo ILIKE $${p.length})`; }
    const { rows } = await pool.query(`SELECT id, codigo, venta, comprador, correo, telefono, monto::float AS monto, metodo, estado, pagado_en, usado_en FROM boletos WHERE ${w} ORDER BY id DESC LIMIT 1000`, p);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function correoBoletos({ colegioId, evento, colegioNombre, comprador, para, boletos }) {
  const adj = [];
  for (const b of boletos) adj.push({ nombre: `boleto-${b.codigo}.png`, tipo: 'image/png', buffer: await QRCode.toBuffer(b.codigo, { width: 480, margin: 2 }) });
  const fecha = evento.fecha ? evento.fecha.split('-').reverse().join('/') : '';
  const texto = `Hola${comprador ? ' ' + comprador : ''}:\n\nAdjuntamos ${boletos.length === 1 ? 'tu boleto' : 'tus ' + boletos.length + ' boletos'} para "${evento.nombre}".\n\n` +
    `${fecha ? 'Fecha: ' + fecha + (evento.hora ? ', ' + evento.hora : '') + '\n' : ''}${evento.lugar ? 'Lugar: ' + evento.lugar + '\n' : ''}\n` +
    `Presenta el código QR de cada boleto (impreso o en tu teléfono) en la entrada. Cada código se puede usar una sola vez.\n\n` + boletos.map((b) => 'Boleto: ' + b.codigo).join('\n') + `\n\n${colegioNombre}`;
  const marca = await marcaDe(colegioId);
  await enviar({ colegioId, nombreRemitente: colegioNombre, to: para, asunto: 'Tu boleto para ' + evento.nombre, texto,
    html: htmlCorreo(marca, texto), adjuntos: adj });
}

// Venta de boletos: se pagan al momento (o quedan pendientes) y cada uno recibe su propio código QR
router.post('/:id/boletos', puedeVender, async (req, res) => {
  try {
    const { rows: [ev] } = await pool.query(`SELECT *, to_char(fecha,'YYYY-MM-DD') AS fecha_txt FROM eventos_entrada WHERE id = $1 AND colegio_id = $2`, [req.params.id, req.colegioId]);
    if (!ev) return res.status(404).json({ error: 'Evento no encontrado' });
    if (!ev.activo) return res.status(400).json({ error: 'El evento está cerrado' });
    const b = req.body;
    const cant = Math.min(100, Math.max(1, parseInt(b.cantidad, 10) || 1));
    if (ev.capacidad) {
      const { rows: [v] } = await pool.query("SELECT COUNT(*)::int AS n FROM boletos WHERE evento_id = $1 AND estado <> 'anulado'", [ev.id]);
      if (v.n + cant > ev.capacidad) return res.status(400).json({ error: `Solo quedan ${Math.max(0, ev.capacidad - v.n)} boleto(s) disponibles` });
    }
    const cortesia = !!b.cortesia;
    const estado = b.estado === 'pendiente' && !cortesia ? 'pendiente' : 'pagado';
    const monto = cortesia ? 0 : Number(ev.precio);
    const venta = 'V' + Date.now().toString(36).toUpperCase();
    const creados = [];
    for (let i = 0; i < cant; i++) {
      const { rows: [bo] } = await pool.query(
        `INSERT INTO boletos (colegio_id, evento_id, codigo, venta, comprador, correo, telefono, monto, metodo, estado, pagado_en, registrado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, CASE WHEN $10::varchar='pagado' THEN NOW() END, $11) RETURNING id, codigo, estado, monto::float AS monto`,
        [req.colegioId, ev.id, nuevoCodigo(), venta, limpio(b.comprador, 150), limpio(b.correo, 150), limpio(b.telefono, 40), monto, cortesia ? 'Cortesía' : limpio(b.metodo, 30) || 'Efectivo', estado, req.usuario.correo]);
      creados.push(bo);
    }
    let correo = null;
    const para = limpio(b.correo, 150);
    if (b.enviar_correo && para && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(para)) {
      if (!(await disponible(req.colegioId))) correo = { enviado: false, motivo: 'El colegio no tiene correo de envío configurado' };
      else {
        try {
          const { rows: [c] } = await pool.query('SELECT nombre FROM colegios WHERE id = $1', [req.colegioId]);
          await correoBoletos({ colegioId: req.colegioId, evento: { ...ev, fecha: ev.fecha_txt }, colegioNombre: c.nombre, comprador: limpio(b.comprador, 150), para, boletos: creados });
          correo = { enviado: true, para };
        } catch (e) { correo = { enviado: false, motivo: e.message }; }
      }
    }
    res.status(201).json({ venta, boletos: creados, total: monto * cant, correo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/boletos/:id/pagar', puedeVender, async (req, res) => {
  try {
    const u = await pool.query(`UPDATE boletos SET estado='pagado', pagado_en=NOW(), metodo=COALESCE($3, metodo) WHERE id=$1 AND colegio_id=$2 AND estado='pendiente'`, [req.params.id, req.colegioId, limpio(req.body.metodo, 30)]);
    if (!u.rowCount) return res.status(400).json({ error: 'El boleto no está pendiente de pago' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reenviar un boleto por correo (a otra dirección si hace falta)
router.post('/boletos/:id/enviar', puedeVender, async (req, res) => {
  try {
    const { rows: [b] } = await pool.query(`SELECT b.id, b.codigo, b.comprador, b.correo, b.estado, b.evento_id FROM boletos b WHERE b.id = $1 AND b.colegio_id = $2`, [req.params.id, req.colegioId]);
    if (!b) return res.status(404).json({ error: 'Boleto no encontrado' });
    if (b.estado === 'anulado') return res.status(400).json({ error: 'El boleto está anulado' });
    const para = limpio(req.body.correo, 150) || b.correo;
    if (!para || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(para)) return res.status(400).json({ error: 'Escribe un correo válido' });
    if (!(await disponible(req.colegioId))) return res.status(400).json({ error: 'El colegio no tiene correo de envío conectado (Configuración → Correo de envío)' });
    const { rows: [ev] } = await pool.query(`SELECT nombre, to_char(fecha,'YYYY-MM-DD') AS fecha, hora, lugar FROM eventos_entrada WHERE id = $1`, [b.evento_id]);
    const { rows: [c] } = await pool.query('SELECT nombre FROM colegios WHERE id = $1', [req.colegioId]);
    await correoBoletos({ colegioId: req.colegioId, evento: ev, colegioNombre: c.nombre, comprador: b.comprador, para, boletos: [b] });
    if (!b.correo) await pool.query('UPDATE boletos SET correo = $2 WHERE id = $1', [b.id, para]);
    res.json({ ok: true, para });
  } catch (e) { res.status(500).json({ error: 'No se pudo enviar: ' + e.message }); }
});

router.post('/boletos/:id/anular', soloFinanzas, async (req, res) => {
  try {
    const u = await pool.query(`UPDATE boletos SET estado='anulado' WHERE id=$1 AND colegio_id=$2 AND estado IN ('pendiente','pagado')`, [req.params.id, req.colegioId]);
    if (!u.rowCount) return res.status(400).json({ error: 'No se puede anular: el boleto ya fue usado o ya estaba anulado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Imagen QR de un boleto (para imprimir o descargar)
router.get('/boletos/:id/qr.png', async (req, res) => {
  try {
    const { rows: [b] } = await pool.query('SELECT codigo FROM boletos WHERE id = $1 AND colegio_id = $2', [req.params.id, req.colegioId]);
    if (!b) return res.status(404).end();
    res.type('png').send(await QRCode.toBuffer(b.codigo, { width: 480, margin: 2 }));
  } catch (e) { res.status(500).end(); }
});

// Escaneo en la entrada: aprueba y marca como usado, una sola vez (atómico, sin doble ingreso)
router.post('/escanear', async (req, res) => {
  try {
    const codigo = String(req.body.codigo || '').trim().toUpperCase();
    const eventoId = req.body.evento_id ? Number(req.body.evento_id) : null;
    if (!codigo) return res.status(400).json({ error: 'Escribe o escanea un código' });
    const info = async () => (await pool.query(
      `SELECT b.id, b.codigo, b.comprador, b.estado, b.monto::float AS monto, b.usado_en, b.evento_id, e.nombre AS evento FROM boletos b JOIN eventos_entrada e ON e.id = b.evento_id WHERE b.codigo = $1 AND b.colegio_id = $2`, [codigo, req.colegioId])).rows[0];
    const b0 = await info();
    if (!b0) return res.json({ resultado: 'no_existe', mensaje: 'Código no válido: este boleto no existe.' });
    if (eventoId && b0.evento_id !== eventoId) return res.json({ resultado: 'otro_evento', mensaje: 'Este boleto es de otro evento: ' + b0.evento, boleto: b0 });
    const u = await pool.query(`UPDATE boletos SET estado='usado', usado_en=NOW(), usado_por=$3 WHERE id=$1 AND colegio_id=$2 AND estado='pagado' RETURNING id`, [b0.id, req.colegioId, req.usuario.correo]);
    if (u.rowCount) return res.json({ resultado: 'aprobado', mensaje: 'Aprobado: puede ingresar.', boleto: { ...b0, estado: 'usado' } });
    const b = await info();
    if (b.estado === 'usado') return res.json({ resultado: 'ya_usado', mensaje: 'Este boleto ya fue usado.', boleto: b });
    if (b.estado === 'pendiente') return res.json({ resultado: 'pendiente', mensaje: 'Boleto sin pagar. Cobra y confírmalo para que pueda entrar.', boleto: b });
    res.json({ resultado: 'anulado', mensaje: 'Boleto anulado: no es válido.', boleto: b });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

// Centro de soporte: los colegios registran consultas y el proveedor responde
const express = require('express');
const router = express.Router();
const pool = require('../db');
const mailer = require('../services/correo/mailer');
const { htmlCorreo } = require('../services/correo/render');
const { esProveedor } = require('../services/licencias');

const CATEGORIAS = ['consulta', 'problema', 'solicitud'];
const ESTADOS = ['abierto', 'en_proceso', 'resuelto', 'cerrado'];

async function avisar(to, asunto, texto) {
  if (!to || !mailer.configurado()) return;
  try { await mailer.enviar({ nombreRemitente: 'Soporte Campus Virtual', to, asunto, texto, html: htmlCorreo({ institucion: 'Soporte Campus Virtual', color: '#2455e6' }, texto) }); }
  catch (e) { console.error('soporte correo:', e.message); }
}
const correoProveedor = () => process.env.SOPORTE_EMAIL || mailer.remitente();

async function cargar(req, res) {
  const { rows: [t] } = await pool.query(
    'SELECT t.*, c.nombre AS colegio FROM tickets_soporte t JOIN colegios c ON c.id = t.colegio_id WHERE t.id = $1', [req.params.id]);
  if (!t || (!esProveedor(req.usuario) && t.colegio_id !== req.colegioId)) { res.status(404).json({ error: 'Consulta no encontrada' }); return null; }
  return t;
}

router.get('/', async (req, res) => {
  try {
    const prov = esProveedor(req.usuario);
    const v = []; const w = [];
    if (!prov || req.query.mios) { v.push(req.colegioId); w.push(`t.colegio_id = $${v.length}`); }
    if (req.query.estado) { v.push(req.query.estado); w.push(`t.estado = $${v.length}`); }
    const { rows } = await pool.query(
      `SELECT t.*, c.nombre AS colegio, (SELECT COUNT(*)::int FROM tickets_mensajes m WHERE m.ticket_id = t.id) AS mensajes
       FROM tickets_soporte t JOIN colegios c ON c.id = t.colegio_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
       ORDER BY (t.estado IN ('abierto','en_proceso')) DESC, t.actualizado_en DESC LIMIT 200`, v);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const asunto = String(req.body.asunto || '').trim().slice(0, 200);
    const mensaje = String(req.body.mensaje || '').trim().slice(0, 5000);
    if (!asunto || !mensaje) return res.status(400).json({ error: 'Escribe el asunto y el mensaje' });
    const categoria = CATEGORIAS.includes(req.body.categoria) ? req.body.categoria : 'consulta';
    const prioridad = ['baja', 'normal', 'alta'].includes(req.body.prioridad) ? req.body.prioridad : 'normal';
    const { rows: [t] } = await pool.query(
      'INSERT INTO tickets_soporte (colegio_id, usuario, asunto, categoria, prioridad) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.colegioId, req.usuario.correo, asunto, categoria, prioridad]);
    await pool.query("INSERT INTO tickets_mensajes (ticket_id, autor_tipo, autor, mensaje) VALUES ($1,'colegio',$2,$3)", [t.id, req.usuario.correo, mensaje]);
    const { rows: [c] } = await pool.query('SELECT nombre FROM colegios WHERE id = $1', [req.colegioId]);
    avisar(correoProveedor(), `Soporte #${t.id} (${c.nombre}): ${asunto}`, `${c.nombre} · ${req.usuario.correo}\nCategoría: ${categoria} · Prioridad: ${prioridad}\n\n${mensaje}`);
    res.status(201).json(t);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const t = await cargar(req, res); if (!t) return;
    const { rows } = await pool.query('SELECT autor_tipo, autor, mensaje, creado_en FROM tickets_mensajes WHERE ticket_id = $1 ORDER BY id', [t.id]);
    res.json({ ...t, mensajes: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/mensajes', async (req, res) => {
  try {
    const t = await cargar(req, res); if (!t) return;
    const mensaje = String(req.body.mensaje || '').trim().slice(0, 5000);
    if (!mensaje) return res.status(400).json({ error: 'Escribe el mensaje' });
    const prov = esProveedor(req.usuario);
    await pool.query('INSERT INTO tickets_mensajes (ticket_id, autor_tipo, autor, mensaje) VALUES ($1,$2,$3,$4)', [t.id, prov ? 'proveedor' : 'colegio', req.usuario.correo, mensaje]);
    const estado = prov ? (t.estado === 'abierto' ? 'en_proceso' : t.estado) : (['resuelto', 'cerrado'].includes(t.estado) ? 'abierto' : t.estado);
    await pool.query('UPDATE tickets_soporte SET estado = $2, actualizado_en = NOW() WHERE id = $1', [t.id, estado]);
    if (prov) avisar(t.usuario, `Respuesta a tu consulta #${t.id}: ${t.asunto}`, `${mensaje}\n\n— Soporte Campus Virtual`);
    else avisar(correoProveedor(), `Soporte #${t.id} (${t.colegio}): nuevo mensaje`, `${t.colegio} · ${req.usuario.correo}\n\n${mensaje}`);
    res.status(201).json({ ok: true, estado });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const t = await cargar(req, res); if (!t) return;
    const estado = req.body.estado;
    if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
    if (!esProveedor(req.usuario) && estado !== 'cerrado') return res.status(403).json({ error: 'Solo puedes cerrar tus consultas' });
    await pool.query('UPDATE tickets_soporte SET estado = $2, actualizado_en = NOW() WHERE id = $1', [t.id, estado]);
    res.json({ ok: true, estado });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

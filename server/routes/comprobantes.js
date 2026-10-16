const express = require('express');
const router = express.Router();
const pool = require('../db');
const notif = require('../services/correo/notificaciones');
const { procesar, refrescarFlags, sincronizarAcceso, confirmarComprobante } = require('../services/comprobanteService');

const COLS = `c.id, c.alumno_id, c.pago_id, c.subido_tipo, c.subido_por, c.banco, c.monto, c.fecha_transferencia, c.hora, c.referencia,
  c.cuenta_origen, c.nombre_remitente, c.cuenta_destino, c.nombre_destinatario, c.estado_banco, c.flags, c.estado, c.alumno_origen,
  c.nota, c.texto_notas, c.deposito_probable, c.revisado_por, c.revisado_en, c.creado_en, a.nombre_completo AS alumno_nombre`;

router.param('id', async (req, res, next, id) => {
  try {
    if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'ID inválido' });
    const r = await pool.query('SELECT 1 FROM comprobantes WHERE id=$1 AND colegio_id=$2', [id, req.colegioId]);
    if (!r.rows.length) return res.status(404).json({ error: 'Comprobante no encontrado' });
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function uno(id) {
  const r = await pool.query(`SELECT ${COLS} FROM comprobantes c LEFT JOIN alumnos a ON a.id=c.alumno_id WHERE c.id=$1`, [id]);
  return r.rows[0];
}

router.get('/', async (req, res) => {
  try {
    const estados = req.query.estado ? [req.query.estado] : ['requiere_alumno', 'por_verificar'];
    const r = await pool.query(
      `SELECT ${COLS} FROM comprobantes c LEFT JOIN alumnos a ON a.id=c.alumno_id WHERE c.colegio_id=$1 AND c.estado = ANY($2) ORDER BY c.creado_en DESC LIMIT 200`,
      [req.colegioId, estados]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/imagen', async (req, res) => {
  const r = await pool.query('SELECT imagen, mime FROM comprobantes WHERE id=$1', [req.params.id]);
  res.set('Content-Type', r.rows[0].mime || 'image/jpeg').send(r.rows[0].imagen);
});

// Subida por la administración (alumno_id opcional)
router.post('/', async (req, res) => {
  try {
    let alumnoId = req.body.alumno_id || null;
    if (alumnoId) {
      const ok = await pool.query('SELECT 1 FROM alumnos WHERE id=$1 AND colegio_id=$2', [alumnoId, req.colegioId]);
      if (!ok.rows.length) return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const id = await procesar({ colegioId: req.colegioId, alumnoId, dataUrl: req.body.imagen, subidoTipo: 'admin', subidoPor: req.usuario.nombre });
    res.status(201).json(await uno(id));
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Corregir datos / asignar alumno
router.patch('/:id', async (req, res) => {
  try {
    const b = req.body;
    if (b.alumno_id) {
      const ok = await pool.query('SELECT 1 FROM alumnos WHERE id=$1 AND colegio_id=$2', [b.alumno_id, req.colegioId]);
      if (!ok.rows.length) return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    if (b.pago_id) {
      const ok = await pool.query('SELECT 1 FROM pagos p JOIN alumnos a ON a.id=p.alumno_id WHERE p.id=$1 AND a.colegio_id=$2', [b.pago_id, req.colegioId]);
      if (!ok.rows.length) return res.status(404).json({ error: 'Cobro no encontrado' });
    }
    const sets = [], params = [];
    const set = (col, val) => { params.push(val === '' ? null : val); sets.push(col + ' = $' + params.length); };
    if (b.alumno_id !== undefined) { set('alumno_id', b.alumno_id); set('alumno_origen', 'manual'); set('estado', b.alumno_id ? 'por_verificar' : 'requiere_alumno'); }
    for (const k of ['pago_id', 'monto', 'referencia', 'banco']) if (b[k] !== undefined) set(k, b[k]);
    if (sets.length) {
      params.push(req.params.id);
      await pool.query(`UPDATE comprobantes SET ${sets.join(', ')} WHERE id = $${params.length} AND estado IN ('requiere_alumno','por_verificar')`, params);
      await refrescarFlags(req.params.id);
      if (b.alumno_id) { await sincronizarAcceso(b.alumno_id); notif.comprobanteRecibido(req.params.id); }
    }
    res.json(await uno(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/aprobar', async (req, res) => {
  try {
    const { rows: [c] } = await pool.query('SELECT * FROM comprobantes WHERE id=$1', [req.params.id]);
    const estado = await confirmarComprobante(c, req.body.pago_id, req.usuario.nombre);
    const d = c.deposito_probable;
    if (d) { // el depósito del banco ya no puede usarse para otro comprobante
      const base = [req.colegioId, d.fecha, String(d.referencia || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^0+/, ''), Number(d.monto)].join('|');
      await pool.query('INSERT INTO movimientos_banco (colegio_id, fecha, referencia, monto, comprobante_id, hash) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
        [req.colegioId, d.fecha, d.referencia, d.monto, c.id, require('crypto').createHash('sha1').update(base + '|1').digest('hex')]);
    }
    res.json({ ok: true, estado });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.post('/:id/rechazar', async (req, res) => {
  try {
    const nota = String(req.body.nota || '').trim();
    if (!nota) return res.status(400).json({ error: 'Escribe el motivo del rechazo' });
    const r = await pool.query(`UPDATE comprobantes SET estado='rechazado', nota=$1, revisado_por=$2, revisado_en=NOW() WHERE id=$3 AND estado IN ('requiere_alumno','por_verificar') RETURNING alumno_id`,
      [nota, req.usuario.nombre, req.params.id]);
    if (r.rows[0] && r.rows[0].alumno_id) { await sincronizarAcceso(r.rows[0].alumno_id); notif.comprobanteRechazado(req.params.id); }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

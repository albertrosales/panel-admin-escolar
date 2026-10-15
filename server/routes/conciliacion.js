const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../db');
const { generarJSON } = require('../services/ia');
const { leerCSV } = require('../services/estadoCuentaParser');
const { confirmarComprobante } = require('../services/comprobanteService');

const PROMPT = `Esto es un estado de cuenta bancario de Honduras. Extrae SOLO los movimientos de ENTRADA de dinero (créditos, depósitos, abonos, transferencias recibidas). Ignora débitos, retiros, comisiones y saldos.
Responde solo JSON: {"movimientos":[{"fecha":"YYYY-MM-DD","referencia":string o null,"monto":número,"descripcion":string}]}`;

const normRef = (r) => String(r || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^0+/, '');

async function leerMovimientos(nombre, buffer, mime) {
  const n = (nombre || '').toLowerCase();
  if (n.endsWith('.pdf')) return (await generarJSON({ prompt: PROMPT, mime: 'application/pdf', buffer })).movimientos || [];
  let texto;
  if (/\.xlsx?$/.test(n)) {
    const XLSX = require('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    texto = wb.SheetNames.map((s) => XLSX.utils.sheet_to_csv(wb.Sheets[s])).join('\n');
  } else {
    texto = buffer.toString('utf8');
  }
  const directo = leerCSV(texto); // formato con encabezados reconocibles: sin IA
  if (directo) return directo;
  const lineas = texto.split(/\r?\n/).filter((l) => l.replace(/[,;\s]/g, '').length);
  const out = [];
  for (let i = 0; i < lineas.length; i += 250) {
    const r = await generarJSON({ prompt: PROMPT, texto: lineas.slice(i, i + 250).join('\n') });
    out.push(...(r.movimientos || []));
  }
  return out;
}

// Cruza comprobantes por verificar con depósitos del banco aún sin asignar
async function cruzar(colegioId, quien) {
  const { rows: movs } = await pool.query(
    `SELECT * FROM movimientos_banco WHERE colegio_id=$1 AND comprobante_id IS NULL AND (fecha IS NULL OR fecha > CURRENT_DATE - 90)`, [colegioId]);
  const { rows: comps } = await pool.query(
    `SELECT * FROM comprobantes WHERE colegio_id=$1 AND estado='por_verificar' AND alumno_id IS NOT NULL AND pago_id IS NOT NULL AND monto IS NOT NULL`, [colegioId]);
  const confirmados = [];
  const usados = new Set();
  const cerca = (a, b) => !a || !b || Math.abs(new Date(a) - new Date(b)) <= 4 * 86400000;
  for (const c of comps) {
    const libres = movs.filter((m) => !usados.has(m.id) && Math.abs(Number(m.monto) - Number(c.monto)) < 0.01);
    let m = null;
    const rc = normRef(c.referencia);
    if (rc) m = libres.find((x) => normRef(x.referencia) === rc) || null;
    if (!m) {
      // sin referencia coincidente: solo si el cruce es inequívoco (un depósito y un comprobante con ese monto y fecha)
      const cand = libres.filter((x) => cerca(x.fecha, c.fecha_transferencia));
      const hermanos = comps.filter((o) => o.id !== c.id && Math.abs(Number(o.monto) - Number(c.monto)) < 0.01 && cerca(c.fecha_transferencia, o.fecha_transferencia));
      if (cand.length === 1 && hermanos.length === 0) m = cand[0];
    }
    if (!m) continue;
    try {
      await confirmarComprobante(c, null, quien + ' (estado de cuenta)');
      usados.add(m.id);
      await pool.query('UPDATE movimientos_banco SET comprobante_id=$1 WHERE id=$2', [c.id, m.id]);
      confirmados.push({ comprobante_id: c.id, monto: c.monto, referencia: c.referencia });
    } catch (e) { /* queda para revisión manual */ }
  }
  const { rows: [r] } = await pool.query(`SELECT COUNT(*)::int n FROM comprobantes WHERE colegio_id=$1 AND estado='por_verificar'`, [colegioId]);
  return { confirmados, siguen_pendientes: r.n };
}

router.post('/', async (req, res) => {
  try {
    const m = /^data:([^;]*);base64,(.+)$/.exec(req.body.archivo || '');
    if (!m) return res.status(400).json({ error: 'Archivo inválido' });
    const buffer = Buffer.from(m[2], 'base64');
    const movs = await leerMovimientos(req.body.nombre, buffer, m[1]);
    let nuevos = 0, repetidos = 0;
    for (const x of movs) {
      const monto = Number(x.monto);
      if (!(monto > 0)) continue;
      const fecha = /^\d{4}-\d{2}-\d{2}$/.test(x.fecha || '') ? x.fecha : null;
      const hash = crypto.createHash('sha1').update([req.colegioId, fecha, normRef(x.referencia), monto, String(x.descripcion || '').slice(0, 80)].join('|')).digest('hex');
      const r = await pool.query(
        `INSERT INTO movimientos_banco (colegio_id, fecha, referencia, monto, descripcion, hash) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id`,
        [req.colegioId, fecha, x.referencia ? String(x.referencia).slice(0, 60) : null, monto, x.descripcion || null, hash]);
      r.rows.length ? nuevos++ : repetidos++;
    }
    const cruce = await cruzar(req.colegioId, req.usuario.nombre);
    res.json({ leidos: movs.length, nuevos, repetidos, ...cruce });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/cruzar', async (req, res) => {
  try { res.json(await cruzar(req.colegioId, req.usuario.nombre)); } catch (e) { res.status(500).json({ error: e.message }); }
});

// Depósitos del banco que no corresponden a ningún comprobante
router.get('/sin-asignar', async (req, res) => {
  try {
    const r = await pool.query(`SELECT id, fecha, referencia, monto, descripcion FROM movimientos_banco WHERE colegio_id=$1 AND comprobante_id IS NULL ORDER BY fecha DESC NULLS LAST, id DESC LIMIT 200`, [req.colegioId]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

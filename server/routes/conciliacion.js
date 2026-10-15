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
const digitos = (x) => String(x || '').replace(/\D/g, '');

async function leerMovimientos(nombre, buffer) {
  const n = (nombre || '').toLowerCase();
  if (n.endsWith('.pdf')) return (await generarJSON({ prompt: PROMPT, mime: 'application/pdf', buffer })).movimientos || [];
  let texto;
  if (/\.xlsx?$/.test(n)) {
    const XLSX = require('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    texto = wb.SheetNames.map((s) => XLSX.utils.sheet_to_csv(wb.Sheets[s])).join('\n');
  } else {
    texto = buffer.toString('utf8');
  }
  const directo = leerCSV(texto); // encabezados reconocibles: sin IA
  if (directo) return directo;
  const lineas = texto.split(/\r?\n/).filter((l) => l.replace(/[,;\s]/g, '').length);
  const out = [];
  for (let i = 0; i < lineas.length; i += 250) {
    const r = await generarJSON({ prompt: PROMPT, texto: lineas.slice(i, i + 250).join('\n') });
    out.push(...(r.movimientos || []));
  }
  return out;
}

/**
 * Cruza SOLO contra comprobantes pendientes; los demás movimientos (gastos personales, etc.) se descartan y no se guardan.
 *  - Misma referencia + mismo monto  => confirma.
 *  - Mismo monto y fecha cercana, único => confirma solo si el colegio activó ese modo (cuenta exclusiva);
 *    si no, deja el depósito como "probable" en el comprobante para que lo apruebes con un clic.
 */
async function cruzar(colegioId, movs, cuenta, quien) {
  const { rows: [col] } = await pool.query('SELECT conciliacion_monto_fecha FROM colegios WHERE id=$1', [colegioId]);
  const { rows: todos } = await pool.query(
    `SELECT * FROM comprobantes WHERE colegio_id=$1 AND estado='por_verificar' AND alumno_id IS NOT NULL AND pago_id IS NOT NULL AND monto IS NOT NULL`, [colegioId]);
  const cta = digitos(cuenta);
  const comps = todos.filter((c) => !cta || !digitos(c.cuenta_destino) || cta.endsWith(digitos(c.cuenta_destino)) || digitos(c.cuenta_destino).endsWith(cta));

  const vistos = {};
  movs = movs.map((m) => {
    const base = [colegioId, m.fecha, normRef(m.referencia), Number(m.monto)].join('|');
    vistos[base] = (vistos[base] || 0) + 1;
    return { ...m, monto: Number(m.monto), hash: crypto.createHash('sha1').update(base + '|' + vistos[base]).digest('hex') };
  });
  const { rows: ya } = await pool.query('SELECT hash FROM movimientos_banco WHERE colegio_id=$1 AND hash = ANY($2)', [colegioId, movs.map((m) => m.hash)]);
  const usados = new Set(ya.map((r) => r.hash));
  const cerca = (a, b) => !a || !b || Math.abs(new Date(a) - new Date(b)) <= 4 * 86400000;
  const igual = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01;

  let confirmados = 0, probables = 0;
  for (const c of comps) {
    const libres = movs.filter((m) => !usados.has(m.hash) && igual(m.monto, c.monto));
    const rc = normRef(c.referencia);
    let m = rc ? libres.find((x) => normRef(x.referencia) === rc) : null;
    let porRef = !!m;
    if (!m) {
      const cand = libres.filter((x) => cerca(x.fecha, c.fecha_transferencia));
      const rivales = comps.filter((o) => o.id !== c.id && igual(o.monto, c.monto) && cerca(c.fecha_transferencia, o.fecha_transferencia));
      if (cand.length === 1 && rivales.length === 0) m = cand[0];
    }
    if (!m) continue;
    if (porRef || col.conciliacion_monto_fecha) {
      try {
        await confirmarComprobante(c, null, quien + ' (estado de cuenta)');
        usados.add(m.hash);
        await pool.query('INSERT INTO movimientos_banco (colegio_id, fecha, referencia, monto, comprobante_id, hash) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
          [colegioId, m.fecha, m.referencia ? String(m.referencia).slice(0, 60) : null, m.monto, c.id, m.hash]);
        confirmados++;
      } catch (e) { /* queda para revisión manual */ }
    } else {
      await pool.query('UPDATE comprobantes SET deposito_probable = $1 WHERE id = $2',
        [JSON.stringify({ fecha: m.fecha, monto: m.monto, referencia: m.referencia || null, descripcion: String(m.descripcion || '').slice(0, 80) }), c.id]);
      probables++;
    }
  }
  const { rows: [p] } = await pool.query(`SELECT COUNT(*)::int n FROM comprobantes WHERE colegio_id=$1 AND estado='por_verificar'`, [colegioId]);
  return { leidos: movs.length, confirmados, probables, siguen_pendientes: p.n - 0 };
}

router.post('/', async (req, res) => {
  try {
    const m = /^data:([^;]*);base64,(.+)$/.exec(req.body.archivo || '');
    if (!m) return res.status(400).json({ error: 'Archivo inválido' });
    const movs = (await leerMovimientos(req.body.nombre, Buffer.from(m[2], 'base64')))
      .filter((x) => Number(x.monto) > 0)
      .map((x) => ({ ...x, fecha: /^\d{4}-\d{2}-\d{2}$/.test(x.fecha || '') ? x.fecha : null }));
    res.json(await cruzar(req.colegioId, movs, req.body.cuenta, req.usuario.nombre));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

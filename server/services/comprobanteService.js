const crypto = require('crypto');
const pool = require('../db');
const { generarJSON } = require('./ia');
const { evaluarEstadoAlumno } = require('./estadoPagoService');
const { setEnrolmentSuspension } = require('./moodleService');
const notif = require('./correo/notificaciones');

const PROMPT = `Lee este comprobante de transferencia o depósito bancario de Honduras (Banpaís, BAC, Ficohsa, Atlántida, Occidente, etc.).
Puede ser captura de app, correo de notificación, o FOTO de un recibo en papel de agente bancario (en ese caso suele no traer nombre de quien paga; el nombre que aparece junto a la cuenta es el del beneficiario).
Las cuentas pueden venir enmascaradas (ej. ****1968): copia lo que se vea. Si el año de la fecha está cortado o es de 2 dígitos, deduce el año completo solo si el texto (ej. día de la semana y mes) lo respalda; si no, null.
Responde SOLO con un JSON, sin texto extra, con estas llaves (null si no aparece):
{"es_comprobante": true/false, "banco": string, "monto": número sin símbolos, "fecha": "YYYY-MM-DD", "hora": "HH:MM" en 24h,
"referencia": string, "cuenta_origen": string, "nombre_remitente": string, "cuenta_destino": string, "nombre_destinatario": string,
"tipo": "transferencia" o "deposito_agente", "comentario": texto del campo comentario/detalle/concepto/nota/descripción que escribió quien pagó (null si está vacío o dice "sin detalle"), "estado_banco": texto literal del estado (ej. "exitosa", "enviada y siendo procesada")}.
No inventes datos: si algo no se ve claro, usa null. es_comprobante=false si la imagen no es un comprobante de transferencia o depósito.`;

const leerComprobante = (buffer, mime) => generarJSON({ prompt: PROMPT, mime, buffer });

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1);
// Los nombres coinciden si todas las palabras del más corto aparecen en el más largo (mínimo 2)
function mismoNombre(a, b) {
  const x = norm(a), y = norm(b);
  if (x.length < 2 || y.length < 2) return false;
  const [c, l] = x.length <= y.length ? [x, y] : [y, x];
  return c.every((t) => l.includes(t));
}

async function buscarAlumno(colegioId, remitente) {
  if (!remitente) return { alumno_id: null };
  const { rows } = await pool.query('SELECT id, nombre_completo, nombre_encargado FROM alumnos WHERE colegio_id = $1 AND activo = TRUE', [colegioId]);
  const propios = rows.filter((a) => mismoNombre(a.nombre_completo, remitente));
  if (propios.length === 1) return { alumno_id: propios[0].id, origen: 'ocr_alumno' };
  if (propios.length > 1) return { alumno_id: null };
  const encargados = rows.filter((a) => mismoNombre(a.nombre_encargado, remitente));
  if (encargados.length === 1) return { alumno_id: encargados[0].id, origen: 'ocr_encargado' };
  return { alumno_id: null };
}

async function pagoSugerido(alumnoId, monto) {
  if (!alumnoId) return null;
  const { rows } = await pool.query('SELECT id, monto, recargo FROM pagos WHERE alumno_id = $1 AND pagado = FALSE ORDER BY fecha_vencimiento', [alumnoId]);
  if (!rows.length) return null;
  const igual = monto != null ? rows.find((p) => Math.abs(Number(p.monto) + Number(p.recargo || 0) - Number(monto)) < 0.01) : null;
  return (igual || rows[0]).id;
}

// Calcula las alertas de un comprobante ya guardado
async function calcularFlags(c) {
  const flags = [];
  if (c.flags_ocr_fallo) flags.push('ocr_fallo');
  if (c.referencia) {
    const d = await pool.query(
      `SELECT 1 FROM comprobantes WHERE colegio_id=$1 AND id<>$2 AND estado<>'rechazado' AND referencia=$3 AND COALESCE(banco,'')=COALESCE($4,'') LIMIT 1`,
      [c.colegio_id, c.id, c.referencia, c.banco]);
    if (d.rows.length) flags.push('referencia_repetida');
  } else if (c.monto != null && c.fecha_transferencia && c.cuenta_origen) {
    const d = await pool.query(
      `SELECT 1 FROM comprobantes WHERE colegio_id=$1 AND id<>$2 AND estado<>'rechazado' AND monto=$3 AND fecha_transferencia=$4 AND COALESCE(hora,'')=COALESCE($5,'') AND cuenta_origen=$6 LIMIT 1`,
      [c.colegio_id, c.id, c.monto, c.fecha_transferencia, c.hora, c.cuenta_origen]);
    if (d.rows.length) flags.push('datos_repetidos');
  }
  if (!c.referencia) flags.push('sin_referencia');
  if (!c.nombre_remitente) flags.push('sin_nombre');
  if (/proces|pendiente|espera/i.test(c.estado_banco || '')) flags.push('banco_en_proceso');
  const { rows: [col] } = await pool.query('SELECT cuentas_destino FROM colegios WHERE id = $1', [c.colegio_id]);
  const cuentas = String((col && col.cuentas_destino) || '').split(/[\n,;]+/).map((x) => x.replace(/\D/g, '')).filter(Boolean);
  const dest = String(c.cuenta_destino || '').replace(/\D/g, '');
  if (cuentas.length && !(dest && cuentas.some((x) => x.endsWith(dest) || dest.endsWith(x)))) flags.push('destino_distinto');
  if (c.alumno_id && c.monto != null) {
    const { rows: pend } = await pool.query('SELECT monto, recargo FROM pagos WHERE alumno_id = $1 AND pagado = FALSE', [c.alumno_id]);
    if (pend.length && !pend.some((p) => Math.abs(Number(p.monto) + Number(p.recargo || 0) - Number(c.monto)) < 0.01)) flags.push('monto_distinto');
  }
  if (c.fecha_transferencia) {
    const dias = (Date.now() - new Date(c.fecha_transferencia).getTime()) / 86400000;
    if (dias > 20) flags.push('fecha_antigua');
    if (dias < -1) flags.push('fecha_futura');
  }
  return flags;
}

async function refrescarFlags(id) {
  const { rows: [c] } = await pool.query('SELECT * FROM comprobantes WHERE id = $1', [id]);
  const flags = await calcularFlags(c);
  await pool.query('UPDATE comprobantes SET flags = $1 WHERE id = $2', [JSON.stringify(flags), id]);
  return flags;
}

/**
 * Acceso provisional: un alumno moroso con comprobante pendiente de validación recupera el acceso a Moodle
 * hasta que el colegio valide. Si se rechaza (o ya no hay pendientes y sigue debiendo) se vuelve a suspender.
 * No aplica si tuvo un comprobante rechazado en los últimos 30 días.
 */
async function sincronizarAcceso(alumnoId) {
  const { rows: [a] } = await pool.query(
    'SELECT a.estado_pago, a.moodle_user_id, a.acceso_provisional, c.moodle_url, c.moodle_token FROM alumnos a JOIN colegios c ON c.id = a.colegio_id WHERE a.id = $1', [alumnoId]);
  if (!a || !a.moodle_user_id) return;
  const { rows: [q] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE estado IN ('por_verificar','requiere_alumno'))::int pend,
            COUNT(*) FILTER (WHERE estado = 'rechazado' AND revisado_en > NOW() - interval '30 days')::int rech
     FROM comprobantes WHERE alumno_id = $1`, [alumnoId]);
  const deseado = a.estado_pago === 'moroso' && q.pend > 0 && q.rech === 0;
  const opts = { moodleUrl: a.moodle_url, token: a.moodle_token, moodleUserId: a.moodle_user_id };
  const log = (t, d) => pool.query(`INSERT INTO alumno_historial (alumno_id, tipo, descripcion) VALUES ($1,$2,$3)`, [alumnoId, t, d]);
  if (deseado && !a.acceso_provisional) {
    await setEnrolmentSuspension({ ...opts, suspend: false });
    await pool.query('UPDATE alumnos SET acceso_provisional = TRUE WHERE id = $1', [alumnoId]);
    await log('activacion_moodle', 'Acceso habilitado provisionalmente: comprobante de pago pendiente de validación');
  } else if (!deseado && a.acceso_provisional) {
    if (a.estado_pago === 'moroso') {
      await setEnrolmentSuspension({ ...opts, suspend: true });
      await log('suspension_moodle', 'Acceso provisional retirado: el pago no fue validado');
    }
    await pool.query('UPDATE alumnos SET acceso_provisional = FALSE WHERE id = $1', [alumnoId]);
  }
}

/** Marca el cobro como pagado por transferencia y confirma el comprobante */
async function confirmarComprobante(c, pagoId, quien) {
  if (!['por_verificar', 'requiere_alumno'].includes(c.estado)) { const e = new Error('Este comprobante ya fue procesado'); e.status = 400; throw e; }
  if (!c.alumno_id) { const e = new Error('Falta indicar a qué alumno pertenece'); e.status = 400; throw e; }
  pagoId = pagoId || c.pago_id;
  if (!pagoId) { const e = new Error('Selecciona el cobro que se está pagando'); e.status = 400; throw e; }
  const { rows: [pago] } = await pool.query(
    `UPDATE pagos SET pagado = TRUE, fecha_pago = CURRENT_DATE, metodo_pago = 'transferencia', monto = monto + COALESCE(recargo,0),
       notas = COALESCE(notas || ' · ', '') || $3
     WHERE id = $1 AND alumno_id = $2 AND pagado = FALSE RETURNING *`,
    [pagoId, c.alumno_id, 'Comprobante #' + c.id + (c.referencia ? ' ref ' + c.referencia : '')]);
  if (!pago) { const e = new Error('Ese cobro no existe o ya está pagado'); e.status = 400; throw e; }
  await pool.query(`UPDATE comprobantes SET estado='confirmado', pago_id=$1, revisado_por=$2, revisado_en=NOW() WHERE id=$3`, [pago.id, quien, c.id]);
  await pool.query(
    `INSERT INTO alumno_historial (alumno_id, tipo, descripcion, metadata) VALUES ($1,'pago',$2,$3)`,
    [c.alumno_id, `Pago de ${pago.periodo} confirmado por transferencia`, JSON.stringify({ monto: pago.monto, comprobante_id: c.id, referencia: c.referencia })]);
  const estado = await evaluarEstadoAlumno(c.alumno_id);
  await sincronizarAcceso(c.alumno_id);
  notif.pagoConfirmado(pago.id);
  return estado;
}

/** Recibe la imagen (dataURL), la lee y la deja en la cola de revisión */
async function procesar({ colegioId, alumnoId, codigo, dataUrl, subidoTipo, subidoPor }) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl || '');
  if (!m) { const e = new Error('Imagen inválida (usa JPG, PNG o WEBP)'); e.status = 400; throw e; }
  const mime = m[1];
  const buffer = Buffer.from(m[2], 'base64');
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');

  const dup = await pool.query(`SELECT id FROM comprobantes WHERE colegio_id=$1 AND hash=$2 AND estado<>'rechazado' LIMIT 1`, [colegioId, hash]);
  if (dup.rows.length) { const e = new Error('Esta captura ya fue subida anteriormente'); e.status = 409; throw e; }

  let d = {}, fallo = false;
  try { d = await leerComprobante(buffer, mime); } catch (err) { fallo = true; console.error('OCR comprobante:', err.message); }

  const monto = d.monto != null && !isNaN(Number(d.monto)) ? Number(d.monto) : null;
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '') ? d.fecha : null;
  const notas = d.comentario ? String(d.comentario).slice(0, 300) : null;
  // códigos de alumno escritos en el comentario (ej. 202601 o 2026-01)
  const candidatos = [...String(notas || '').matchAll(/(?<!\d)(20\d{2})[\s\-]?(\d{2,4})(?!\d)/g)].map((x) => x[1] + x[2]);
  let delComentario = null;
  if (candidatos.length) {
    const r = await pool.query('SELECT id FROM alumnos WHERE colegio_id = $1 AND codigo = ANY($2)', [colegioId, candidatos]);
    if (r.rows.length === 1) delComentario = r.rows[0].id;
  }

  let origen = alumnoId ? (subidoTipo === 'alumno' ? 'portal' : 'manual') : null;
  if (codigo) {
    const r = await pool.query('SELECT id FROM alumnos WHERE colegio_id = $1 AND codigo = $2', [colegioId, String(codigo).trim()]);
    if (!r.rows.length) { const e = new Error('No existe un alumno con ese código'); e.status = 400; throw e; }
    alumnoId = r.rows[0].id; origen = 'codigo_escrito';
  } else if (!alumnoId || subidoTipo === 'admin') {
    if (delComentario && !alumnoId) { alumnoId = delComentario; origen = 'codigo_nota'; }
  }
  if (!alumnoId) {
    const b = await buscarAlumno(colegioId, d.nombre_remitente);
    alumnoId = b.alumno_id; origen = b.origen || null;
  }
  const pagoId = await pagoSugerido(alumnoId, monto);

  const { rows: [c] } = await pool.query(
    `INSERT INTO comprobantes (colegio_id, alumno_id, pago_id, subido_tipo, subido_por, imagen, mime, hash, banco, monto, fecha_transferencia, hora,
       referencia, cuenta_origen, nombre_remitente, cuenta_destino, nombre_destinatario, estado_banco, estado, alumno_origen, texto_notas)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
    [colegioId, alumnoId, pagoId, subidoTipo, subidoPor, buffer, mime, hash, d.banco || null, monto, fecha, d.hora || null,
      d.referencia ? String(d.referencia) : null, d.cuenta_origen ? String(d.cuenta_origen) : null, d.nombre_remitente || null,
      d.cuenta_destino ? String(d.cuenta_destino) : null, d.nombre_destinatario || null, d.estado_banco || null,
      alumnoId ? 'por_verificar' : 'requiere_alumno', origen, notas]);

  const extra = [];
  if (d.es_comprobante === false) extra.push('no_es_comprobante');
  if (delComentario && alumnoId && delComentario !== alumnoId) extra.push('codigo_nota_distinto');
  const flags = await refrescarFlags(c.id);
  if (extra.length || fallo) {
    const todas = [...new Set([...(fallo ? ['ocr_fallo'] : []), ...extra, ...flags])];
    await pool.query('UPDATE comprobantes SET flags = $1 WHERE id = $2', [JSON.stringify(todas), c.id]);
  }
  if (alumnoId) notif.comprobanteRecibido(c.id);
  if (alumnoId) await sincronizarAcceso(alumnoId).catch((e) => console.error('acceso provisional:', e.message));
  return c.id;
}

module.exports = { procesar, refrescarFlags, sincronizarAcceso, confirmarComprobante };

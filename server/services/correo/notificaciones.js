const pool = require('../../db');
const { render, renderAsunto, htmlCorreo } = require('./render');
const { configurado, enviar } = require('./mailer');
const { PLANTILLAS, MANUAL_VARS, porClave } = require('./plantillasDefault');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ESTADOS_ASIS = { P: 'Presente', A: 'Ausente', T: 'Tarde', J: 'Justificada' };

function aFecha(v) {
  if (!v) return null;
  if (typeof v === 'string') { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  return v;
}
const fechaLarga = (v) => { const d = aFecha(v); return d ? `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}` : ''; };
const mesDe = (periodo) => { const m = /^(\d{4})-(\d{2})/.exec(periodo || ''); return m ? `${MESES[+m[2] - 1]} ${m[1]}` : ''; };
const lempiras = (n) => (n == null || isNaN(Number(n)) ? '' : 'L. ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** Plantilla efectiva del colegio: la editada o la predeterminada */
async function cargarPlantilla(colegioId, clave) {
  const def = porClave(clave);
  if (!def) return null;
  const { rows: [r] } = await pool.query('SELECT * FROM plantillas_correo WHERE colegio_id = $1 AND clave = $2', [colegioId, clave]);
  return {
    clave, nombre: def.nombre, grupo: def.grupo, auto: def.auto, editada: !!r,
    asunto: r ? r.asunto : def.asunto, cuerpo: r ? r.cuerpo : def.cuerpo,
    activa: r && r.activa_auto != null ? r.activa_auto : !!(def.auto && def.auto.activa),
    parametro: r && r.parametro != null ? r.parametro : (def.auto && def.auto.parametro ? def.auto.parametro.valor : null)
  };
}

/** Datos reales del alumno, su colegio y su situación de pagos/asistencia */
async function variablesAlumno(alumnoId, { pagoId } = {}) {
  const { rows: [a] } = await pool.query(
    `SELECT a.*, c.nombre AS institucion, c.correo_color, c.correo_logo_url, c.correo_pie FROM alumnos a JOIN colegios c ON c.id = a.colegio_id WHERE a.id = $1`, [alumnoId]);
  if (!a) return null;
  const pago = pagoId
    ? (await pool.query('SELECT * FROM pagos WHERE id = $1 AND alumno_id = $2', [pagoId, alumnoId])).rows[0]
    : (await pool.query('SELECT * FROM pagos WHERE alumno_id = $1 AND pagado = FALSE ORDER BY fecha_vencimiento LIMIT 1', [alumnoId])).rows[0];
  const { rows: [ult] } = await pool.query('SELECT fecha_pago FROM pagos WHERE alumno_id = $1 AND pagado = TRUE ORDER BY fecha_pago DESC NULLS LAST LIMIT 1', [alumnoId]);
  const { rows: [as] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE estado = 'A' AND fecha > CURRENT_DATE - 30)::int AS aus,
            (SELECT estado FROM asistencia WHERE alumno_id = $1 ORDER BY fecha DESC LIMIT 1) AS ultimo
     FROM asistencia WHERE alumno_id = $1`, [alumnoId]);
  const vars = {
    nombre_institucion: a.institucion, nombre_alumno: a.nombre_completo, codigo_alumno: a.codigo,
    nombre_destinatario: a.nombre_encargado || 'padre, madre o encargado',
    mes: pago ? mesDe(pago.periodo) : '', fecha_vencimiento: pago ? fechaLarga(pago.fecha_vencimiento) : '',
    monto: pago ? lempiras(pago.pagado ? pago.monto : Number(pago.monto) + Number(pago.recargo || 0)) : '',
    concepto: pago ? 'Mensualidad de ' + mesDe(pago.periodo) : '',
    fecha_pago: pago && pago.pagado ? fechaLarga(pago.fecha_pago) : (ult ? fechaLarga(ult.fecha_pago) : ''),
    cantidad_ausencias: as && as.aus ? String(as.aus) : '', estado_asistencia: as && as.ultimo ? ESTADOS_ASIS[as.ultimo.trim()] : '',
    periodo_academico: String(new Date().getFullYear())
  };
  return { alumno: a, vars, marca: { institucion: a.institucion, color: a.correo_color, logo: a.correo_logo_url, pie: a.correo_pie } };
}

function armar(plantilla, ctx, extras) {
  const vars = { ...ctx.vars };
  for (const [k, v] of Object.entries(extras || {})) if (v != null && String(v).trim() !== '') vars[k] = v;
  const { texto, faltantes } = render(plantilla.cuerpo, vars);
  const asunto = renderAsunto(plantilla.asunto, vars) || plantilla.nombre;
  return { asunto, texto, html: htmlCorreo(ctx.marca, texto), faltantes };
}

async function yaEnviado(colegioId, clave, referencia) {
  const r = await pool.query(
    `SELECT 1 FROM notificaciones_correo WHERE colegio_id=$1 AND plantilla_clave=$2 AND referencia=$3 AND estado IN ('pendiente','enviando','enviado','entregado') LIMIT 1`,
    [colegioId, clave, referencia]);
  return r.rows.length > 0;
}

async function insertar({ colegioId, alumnoId, clave, para, m, referencia, lote, usuario }) {
  const { rows: [r] } = await pool.query(
    `INSERT INTO notificaciones_correo (colegio_id, alumno_id, plantilla_clave, destinatario, asunto, cuerpo_texto, cuerpo_html, referencia, lote, enviado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [colegioId, alumnoId, clave, para, m.asunto, m.texto, m.html, referencia || null, lote || null, usuario || null]);
  return r.id;
}

/** Envío automático por evento. Solo si el correo está configurado y la plantilla está activa. */
async function auto(clave, alumnoId, referencia, { pagoId, extras } = {}) {
  if (!configurado()) return null;
  const ctx = await variablesAlumno(alumnoId, { pagoId });
  if (!ctx || !ctx.alumno.activo || !ctx.alumno.correo_encargado) return null;
  const pl = await cargarPlantilla(ctx.alumno.colegio_id, clave);
  if (!pl || !pl.activa) return null;
  if (referencia && await yaEnviado(ctx.alumno.colegio_id, clave, referencia)) return null;
  const m = armar(pl, ctx, extras);
  const id = await insertar({ colegioId: ctx.alumno.colegio_id, alumnoId, clave, para: ctx.alumno.correo_encargado, m, referencia });
  setImmediate(() => procesarPendientes().catch((e) => console.error('correos:', e.message)));
  return id;
}

const seguro = (p) => p.catch((e) => console.error('notificación:', e.message));

const comprobanteRecibido = (id) => seguro((async () => {
  const { rows: [c] } = await pool.query('SELECT alumno_id, monto FROM comprobantes WHERE id = $1', [id]);
  if (c && c.alumno_id) await auto('comprobante_recibido', c.alumno_id, 'comp:' + id, { extras: { monto: lempiras(c.monto) } });
})());

const pagoConfirmado = (pagoId) => seguro((async () => {
  const { rows: [p] } = await pool.query('SELECT alumno_id FROM pagos WHERE id = $1', [pagoId]);
  if (p) await auto('pago_confirmado', p.alumno_id, 'pago:' + pagoId, { pagoId });
})());

const comprobanteRechazado = (id) => seguro((async () => {
  const { rows: [c] } = await pool.query('SELECT alumno_id, monto, nota FROM comprobantes WHERE id = $1', [id]);
  if (c && c.alumno_id) await auto('comprobante_rechazado', c.alumno_id, 'comp:' + id, { extras: { monto: lempiras(c.monto), motivo_rechazo: c.nota } });
})());

/** Asistencia registrada: ausencia, ausencias consecutivas y registro general (solo fechas recientes) */
const asistencia = (colegioId, fecha, registros) => seguro((async () => {
  if (!configurado()) return;
  const d = aFecha(fecha);
  if (!d || (Date.now() - d.getTime()) / 86400000 > 3) return; // no avisar por asistencias antiguas
  const cons = await cargarPlantilla(colegioId, 'ausencias_consecutivas');
  for (const r of registros) {
    const extras = { fecha: fechaLarga(fecha) };
    if (r.estado === 'A') {
      await auto('ausencia', r.alumno_id, `aus:${r.alumno_id}:${fecha}`, { extras });
      if (cons && cons.activa) {
        const { rows } = await pool.query(
          `SELECT bool_and(estado = 'A') AS todas FROM asistencia WHERE alumno_id = $1 GROUP BY fecha ORDER BY fecha DESC LIMIT 30`, [r.alumno_id]);
        let n = 0; for (const x of rows) { if (x.todas) n++; else break; }
        const umbral = Number(cons.parametro) || 3;
        if (n >= umbral && n % umbral === 0) await auto('ausencias_consecutivas', r.alumno_id, `cons:${r.alumno_id}:${fecha}`, { extras: { cantidad_ausencias: String(n) } });
      }
    }
    await auto('asistencia_registrada', r.alumno_id, `asr:${r.alumno_id}:${fecha}`, { extras: { ...extras, estado_asistencia: ESTADOS_ASIS[r.estado] || '' } });
  }
})());

/** Recordatorios y avisos de mora (diario). No avisa si ya hay un comprobante en revisión para ese cobro. */
async function notificarCobros() {
  if (!configurado()) return;
  const { rows: colegios } = await pool.query('SELECT id FROM colegios WHERE activo = TRUE');
  for (const c of colegios) {
    const rec = await cargarPlantilla(c.id, 'recordatorio_vencimiento');
    if (rec && rec.activa) {
      const dias = Number(rec.parametro) || 3;
      const { rows } = await pool.query(
        `SELECT p.id, p.alumno_id FROM pagos p JOIN alumnos a ON a.id = p.alumno_id
         WHERE a.colegio_id = $1 AND a.activo AND NOT p.pagado AND p.fecha_vencimiento >= CURRENT_DATE AND p.fecha_vencimiento <= CURRENT_DATE + $2::int
           AND NOT EXISTS (SELECT 1 FROM comprobantes k WHERE k.pago_id = p.id AND k.estado IN ('por_verificar','requiere_alumno'))`, [c.id, dias]);
      for (const p of rows) await seguro(auto('recordatorio_vencimiento', p.alumno_id, 'pago:' + p.id, { pagoId: p.id }));
    }
    const ven = await cargarPlantilla(c.id, 'mensualidad_vencida');
    if (ven && ven.activa) {
      const { rows } = await pool.query(
        `SELECT p.id, p.alumno_id FROM pagos p JOIN alumnos a ON a.id = p.alumno_id
         WHERE a.colegio_id = $1 AND a.activo AND NOT p.pagado AND p.fecha_vencimiento < CURRENT_DATE
           AND NOT EXISTS (SELECT 1 FROM comprobantes k WHERE k.pago_id = p.id AND k.estado IN ('por_verificar','requiere_alumno'))`, [c.id]);
      for (const p of rows) await seguro(auto('mensualidad_vencida', p.alumno_id, 'pago:' + p.id, { pagoId: p.id }));
    }
  }
}

// ---------- Envío manual (director): individual, selección, clase o toda la institución ----------
async function destinatarios(colegioId, aud) {
  const t = (aud && aud.tipo) || 'todos';
  if (t === 'grado') {
    return (await pool.query(`SELECT DISTINCT a.id, a.nombre_completo, a.correo_encargado FROM alumnos a JOIN matriculas m ON m.alumno_id = a.id
      WHERE a.colegio_id = $1 AND a.activo AND m.grado_id = $2 ORDER BY a.nombre_completo`, [colegioId, aud.grado_id])).rows;
  }
  if (t === 'alumnos' || t === 'alumno') {
    const ids = (t === 'alumno' ? [aud.alumno_id] : aud.alumno_ids || []).map(Number).filter(Boolean);
    return (await pool.query('SELECT id, nombre_completo, correo_encargado FROM alumnos WHERE colegio_id = $1 AND id = ANY($2) ORDER BY nombre_completo', [colegioId, ids])).rows;
  }
  return (await pool.query('SELECT id, nombre_completo, correo_encargado FROM alumnos WHERE colegio_id = $1 AND activo ORDER BY nombre_completo', [colegioId])).rows;
}

function variablesManualesFaltantes(asunto, cuerpo, extras) {
  const usadas = new Set([...(String(asunto) + '\n' + String(cuerpo)).matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) => m[1].toLowerCase()));
  return Object.keys(MANUAL_VARS).filter((k) => usadas.has(k) && !['periodo_academico', 'nombre_director'].includes(k) && !(extras && String(extras[k] || '').trim()));
}

async function vistaPrevia(colegioId, { asunto, cuerpo, extras, audiencia, alumno_id }) {
  const lista = await destinatarios(colegioId, audiencia || { tipo: 'todos' });
  const id = alumno_id || (lista[0] && lista[0].id);
  if (!id) return { destinatarios: 0, sin_correo: 0, vista: null };
  const ctx = await variablesAlumno(id);
  const m = armar({ nombre: 'Correo', asunto, cuerpo }, ctx, extras);
  return { destinatarios: lista.length, sin_correo: lista.filter((a) => !a.correo_encargado).length, vista: { asunto: m.asunto, html: m.html, alumno: ctx.alumno.nombre_completo } };
}

async function enviarManual(colegioId, usuario, { clave, asunto, cuerpo, extras, audiencia }) {
  if (!configurado()) { const e = new Error('El correo no está configurado en el servidor'); e.status = 400; throw e; }
  const falta = variablesManualesFaltantes(asunto, cuerpo, extras);
  if (falta.length) { const e = new Error('Completa: ' + falta.map((k) => MANUAL_VARS[k]).join(', ')); e.status = 400; throw e; }
  const ex = { nombre_director: usuario, ...(extras || {}) };
  const lista = await destinatarios(colegioId, audiencia);
  const porAlumno = /\{\{\s*(nombre_alumno|codigo_alumno|mes|monto|fecha_vencimiento|concepto|cantidad_ausencias|estado_asistencia|fecha_pago)\s*\}\}/i.test(asunto + cuerpo);
  const lote = 'L' + Date.now();
  const vistos = new Set();
  let enCola = 0, sinCorreo = 0, repetidos = 0;
  for (const a of lista) {
    const ctx = await variablesAlumno(a.id);
    if (!a.correo_encargado) {
      sinCorreo++;
      await pool.query(`INSERT INTO notificaciones_correo (colegio_id, alumno_id, plantilla_clave, destinatario, asunto, estado, error, lote, enviado_por) VALUES ($1,$2,$3,'',$4,'fallido','Sin correo del encargado registrado',$5,$6)`,
        [colegioId, a.id, clave || 'manual', renderAsunto(asunto, ctx.vars) || 'Sin asunto', lote, usuario]);
      continue;
    }
    const clavePar = a.correo_encargado.toLowerCase();
    if (!porAlumno && vistos.has(clavePar)) { repetidos++; continue; } // evita duplicar el mismo comunicado a un mismo correo
    vistos.add(clavePar);
    const m = armar({ nombre: 'Correo', asunto, cuerpo }, ctx, ex);
    await insertar({ colegioId, alumnoId: a.id, clave: clave || 'manual', para: a.correo_encargado, m, lote, usuario });
    enCola++;
  }
  setImmediate(() => procesarPendientes().catch((e) => console.error('correos:', e.message)));
  return { en_cola: enCola, sin_correo: sinCorreo, repetidos, lote };
}

// ---------- Cola de envío: un correo por destinatario (nadie ve las direcciones de otros) ----------
let procesando = false;
async function procesarPendientes() {
  if (procesando || !configurado()) return;
  procesando = true;
  try {
    await pool.query(`UPDATE notificaciones_correo SET estado='pendiente' WHERE estado='enviando' AND creado_en < NOW() - interval '10 minutes'`);
    for (;;) {
      const { rows } = await pool.query(
        `UPDATE notificaciones_correo SET estado='enviando' WHERE id IN (
           SELECT id FROM notificaciones_correo WHERE estado='pendiente' AND intentos < 3 ORDER BY id LIMIT 20 FOR UPDATE SKIP LOCKED)
         RETURNING id, colegio_id, destinatario, asunto, cuerpo_texto, cuerpo_html`);
      if (!rows.length) break;
      for (const n of rows) {
        try {
          const { rows: [c] } = await pool.query('SELECT nombre FROM colegios WHERE id = $1', [n.colegio_id]);
          await enviar({ nombreRemitente: c && c.nombre, to: n.destinatario, asunto: n.asunto, html: n.cuerpo_html, texto: n.cuerpo_texto });
          await pool.query(`UPDATE notificaciones_correo SET estado='enviado', enviado_en=NOW(), error=NULL WHERE id=$1`, [n.id]);
        } catch (e) {
          await pool.query(`UPDATE notificaciones_correo SET intentos = intentos + 1, error = $2, estado = CASE WHEN intentos + 1 >= 3 THEN 'fallido' ELSE 'pendiente' END WHERE id = $1`, [n.id, String(e.message).slice(0, 300)]);
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  } finally { procesando = false; }
}

module.exports = {
  PLANTILLAS, cargarPlantilla, variablesAlumno, vistaPrevia, enviarManual, procesarPendientes, notificarCobros,
  comprobanteRecibido, pagoConfirmado, comprobanteRechazado, asistencia, armar
};

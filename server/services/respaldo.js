// Copias de seguridad por institución: archivo JSON comprimido con todos sus datos (sin fotos/imágenes pesadas ni el token de Moodle)
const zlib = require('zlib');
const pool = require('../db');
const mailer = require('./correo/mailer');

const ALU = 'SELECT id FROM alumnos WHERE colegio_id = $1';
const PRO = 'SELECT id FROM profesores WHERE colegio_id = $1';
// Orden pensado para poder restaurar respetando las relaciones entre tablas
const TABLAS = [
  ['colegios', 'id = $1', ['moodle_token', 'gmail_refresh_token']],
  ['grados', 'colegio_id = $1'], ['alumnos', 'colegio_id = $1'], ['profesores', 'colegio_id = $1'], ['usuarios_admin', 'colegio_id = $1'],
  ['matriculas', `alumno_id IN (${ALU})`], ['pagos', `alumno_id IN (${ALU})`], ['planes_pago', `alumno_id IN (${ALU})`],
  ['plan_pago_cuotas', `plan_pago_id IN (SELECT id FROM planes_pago WHERE alumno_id IN (${ALU}))`],
  ['alumno_historial', `alumno_id IN (${ALU})`], ['asistencia', 'colegio_id = $1'], ['eventos', 'colegio_id = $1'],
  ['profesor_grado_materia', `profesor_id IN (${PRO})`], ['profesor_resenas', `profesor_id IN (${PRO})`],
  ['documentos_generados', 'colegio_id = $1'], ['comprobantes', 'colegio_id = $1'], ['movimientos_banco', 'colegio_id = $1'],
  ['plantillas_correo', 'colegio_id = $1'], ['notificaciones_correo', 'colegio_id = $1'],
  ['periodos_matricula', 'colegio_id = $1'], ['solicitudes_matricula', 'colegio_id = $1'],
  ['tickets_soporte', 'colegio_id = $1'], ['tickets_mensajes', 'ticket_id IN (SELECT id FROM tickets_soporte WHERE colegio_id = $1)'],
  ['auditoria', "colegio_id = $1 AND creado_en > NOW() - interval '180 days'"]
];

async function columnas(tabla, excluir = []) {
  const { rows } = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND data_type <> 'bytea' ORDER BY ordinal_position", [tabla]);
  return rows.map((r) => r.column_name).filter((c) => !excluir.includes(c));
}

async function datosColegio(colegioId) {
  const tablas = {}; const omitidas = [];
  for (const [t, where, excluir] of TABLAS) {
    try {
      const cols = await columnas(t, excluir);
      if (!cols.length) { omitidas.push(t); continue; }
      tablas[t] = (await pool.query(`SELECT ${cols.map((c) => '"' + c + '"').join(', ')} FROM "${t}" WHERE ${where}`, [colegioId])).rows;
    } catch (e) { omitidas.push(t); }
  }
  return { colegio_id: colegioId, tablas, omitidas };
}

/** Devuelve { buffer, nombre } con el respaldo comprimido de un colegio o de todos (colegioId = null) */
async function generar(colegioId) {
  const ids = colegioId ? [Number(colegioId)] : (await pool.query('SELECT id FROM colegios ORDER BY id')).rows.map((r) => r.id);
  const colegios = [];
  for (const id of ids) colegios.push(await datosColegio(id));
  const buffer = zlib.gzipSync(Buffer.from(JSON.stringify({ version: 1, generado: new Date().toISOString(), colegios })));
  let nombre = 'todos';
  if (colegioId) {
    const { rows: [c] } = await pool.query('SELECT nombre FROM colegios WHERE id = $1', [colegioId]);
    nombre = ((c && c.nombre) || 'colegio' + colegioId).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  return { buffer, nombre: `respaldo-${nombre}-${new Date().toISOString().slice(0, 10)}.json.gz` };
}

const registrar = (colegioId, tipo, bytes, estado, error) =>
  pool.query('INSERT INTO respaldos (colegio_id, tipo, bytes, estado, error) VALUES ($1,$2,$3,$4,$5)', [colegioId || null, tipo, bytes || null, estado, error ? String(error).slice(0, 300) : null]).catch(() => {});

/** Envía por correo (Gmail) el respaldo de cada colegio a BACKUP_EMAIL */
async function respaldoPorCorreo() {
  const para = process.env.BACKUP_EMAIL;
  if (!para || !mailer.configurado()) return { omitido: true };
  const { rows } = await pool.query('SELECT id, nombre FROM colegios WHERE activo = true ORDER BY id');
  let enviados = 0;
  for (const c of rows) {
    try {
      const { buffer, nombre } = await generar(c.id);
      if (buffer.length > 18 * 1024 * 1024) throw new Error('El respaldo pesa más de 18 MB y no cabe en un correo');
      await mailer.enviar({
        nombreRemitente: 'Respaldos Campus Virtual', to: para, asunto: 'Respaldo semanal · ' + c.nombre,
        texto: `Copia de seguridad de ${c.nombre}. Guarda este archivo en un lugar seguro: contiene datos personales.`,
        html: `<p>Copia de seguridad de <b>${c.nombre.replace(/[<>&]/g, '')}</b>.</p><p>Guarda este archivo en un lugar seguro: contiene datos personales.</p>`,
        adjuntos: [{ nombre, tipo: 'application/gzip', buffer }]
      });
      await registrar(c.id, 'correo', buffer.length, 'ok');
      enviados++;
    } catch (e) { await registrar(c.id, 'correo', null, 'error', e.message); }
  }
  return { enviados };
}

/** Al despertar el servidor (Render gratis duerme): si pasó más de una semana sin respaldo por correo, lo hace */
async function respaldoSiToca() {
  if (!process.env.BACKUP_EMAIL || !mailer.configurado()) return;
  const { rows: [u] } = await pool.query("SELECT MAX(creado_en) AS f FROM respaldos WHERE tipo = 'correo' AND estado = 'ok'");
  if (!u.f || Date.now() - new Date(u.f).getTime() > 7 * 86400000) await respaldoPorCorreo();
}

module.exports = { TABLAS, generar, registrar, respaldoPorCorreo, respaldoSiToca };

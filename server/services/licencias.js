// Licencias, planes, módulos y límites por institución
const jwt = require('jsonwebtoken');
const pool = require('../db');

const MODULOS = {
  comprobantes: 'Comprobantes de pago',
  conciliacion: 'Estado de cuenta bancario',
  asistencia: 'Asistencia',
  notificaciones: 'Notificaciones por correo',
  matricula: 'Matrícula en línea',
  importacion: 'Importación desde Excel'
};

const hoy = () => new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10); // Honduras (UTC-6)
const esProveedor = (u) => !!u && (u.rol === 'superadmin' || (u.rol === 'admin' && Number(u.colegio_id) === 1));

const cache = new Map();
const TTL = 30000;
const limpiarCache = (id) => (id ? cache.delete(Number(id)) : cache.clear());

async function cargarColegio(id) {
  id = Number(id);
  const c = cache.get(id);
  if (c && Date.now() - c.t < TTL) return c.d;
  const { rows: [d] } = await pool.query(
    `SELECT c.id, c.nombre, c.activo, c.plan_id, c.licencia_estado, c.licencia_inicio::text AS inicio, c.licencia_vence::text AS vence,
            c.modulos, c.limite_alumnos, c.limite_usuarios, p.nombre AS plan_nombre, p.modulos AS plan_modulos,
            p.max_alumnos AS plan_max_alumnos, p.max_usuarios AS plan_max_usuarios
     FROM colegios c LEFT JOIN planes p ON p.id = c.plan_id WHERE c.id = $1`, [id]);
  cache.set(id, { t: Date.now(), d: d || null });
  return d || null;
}

function estadoLicencia(c) {
  const h = hoy();
  let estado;
  if (!c.activo || c.licencia_estado === 'suspendida') estado = 'suspendida';
  else if (c.vence && c.vence < h) estado = 'vencida';
  else estado = c.licencia_estado === 'prueba' ? 'prueba' : 'activa';
  const dias = c.vence ? Math.round((Date.parse(c.vence) - Date.parse(h)) / 86400000) : null;
  return { estado, es_prueba: c.licencia_estado === 'prueba', vence: c.vence || null, dias_restantes: dias };
}

function modulosEfectivos(c) {
  const out = {};
  for (const k of Object.keys(MODULOS)) {
    let v = c.plan_id ? !!(c.plan_modulos || {})[k] : true; // sin plan asignado = todo habilitado (instalaciones anteriores)
    if (typeof (c.modulos || {})[k] === 'boolean') v = c.modulos[k];
    if (Number(c.id) === 1) v = true; // la institución propietaria no se restringe
    out[k] = v;
  }
  return out;
}

const limites = (c) => (Number(c.id) === 1
  ? { alumnos: null, usuarios: null }
  : { alumnos: c.limite_alumnos ?? c.plan_max_alumnos ?? null, usuarios: c.limite_usuarios ?? c.plan_max_usuarios ?? null });

// Rutas que siguen disponibles aunque la licencia esté vencida o suspendida
const EXENTO = /^\/(auth|colegio|marca|soporte|proveedor)(\/|$)/;

/** Bloquea según la licencia: suspendida = todo; vencida = solo consulta. El proveedor y el modo soporte no se bloquean. */
async function guard(req, res, next) {
  try {
    const h = req.headers.authorization;
    if (!h || h.indexOf('Bearer ') !== 0) return next();
    let p;
    try { p = jwt.verify(h.slice(7), process.env.JWT_SECRET); } catch (e) { return next(); }
    const cid = Number(p.colegio_id);
    if (!cid || p.soporte || esProveedor(p) || EXENTO.test(req.path)) return next();
    const c = await cargarColegio(cid);
    if (!c) return next();
    const e = estadoLicencia(c);
    if (e.estado === 'suspendida') return res.status(403).json({ error: 'La suscripción de su institución está suspendida. Comuníquese con el proveedor.', codigo: 'licencia_suspendida' });
    if (e.estado === 'vencida' && !p.tipo && req.method !== 'GET') {
      return res.status(403).json({ error: 'La licencia de su institución venció. Solo puede consultar información hasta renovarla.', codigo: 'licencia_vencida' });
    }
    next();
  } catch (err) { next(err); }
}

/** Exige que el módulo esté habilitado para la institución */
const requireModulo = (clave) => async (req, res, next) => {
  try {
    const cid = req.colegioId || (req.portal && req.portal.colegio_id) || (req.usuario && req.usuario.colegio_id);
    const c = cid && await cargarColegio(cid);
    if (c && !modulosEfectivos(c)[clave]) {
      return res.status(403).json({ error: 'El módulo "' + MODULOS[clave] + '" no está incluido en el plan de su institución.', codigo: 'modulo_no_incluido' });
    }
    next();
  } catch (err) { next(err); }
};

async function moduloActivo(colegioId, clave) {
  const c = await cargarColegio(colegioId);
  return !c || modulosEfectivos(c)[clave];
}

async function uso(colegioId) {
  const { rows: [r] } = await pool.query(
    `SELECT (SELECT COUNT(*)::int FROM alumnos WHERE colegio_id = $1 AND activo = true) AS alumnos,
            (SELECT COUNT(*)::int FROM usuarios_admin WHERE colegio_id = $1 AND activo = true) AS usuarios`, [colegioId]);
  return r;
}

async function verificarCupo(colegioId, que, nuevos = 1) {
  const c = await cargarColegio(colegioId);
  if (!c) return;
  const lim = limites(c)[que];
  if (lim == null) return;
  const u = (await uso(colegioId))[que];
  if (u + nuevos > lim) {
    const e = new Error(`Se alcanzó el límite de ${lim} ${que === 'alumnos' ? 'alumnos' : 'usuarios'} del plan (en uso: ${u}). Comuníquese con el proveedor para ampliar el plan.`);
    e.status = 402; throw e;
  }
}

module.exports = { MODULOS, hoy, esProveedor, cargarColegio, estadoLicencia, modulosEfectivos, limites, guard, requireModulo, moduloActivo, uso, verificarCupo, limpiarCache };

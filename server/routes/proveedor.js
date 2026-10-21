// Panel del proveedor (solo administrador general): colegios, planes, licencias, módulos y soporte técnico
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const L = require('../services/licencias');
const { requireSuperAdmin } = require('../middleware/auth');

router.use(requireSuperAdmin);
const fail = (res, e) => res.status(e.status || 500).json({ error: e.code === '23505' ? 'Ya existe un registro con esos datos' : e.message });
const sumarDias = (desde, d) => new Date(Date.parse(desde) + d * 86400000).toISOString().slice(0, 10);

router.get('/resumen', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id FROM colegios');
    const r = { colegios: rows.length, activos: 0, prueba: 0, por_vencer: 0, vencidos: 0, suspendidos: 0, alumnos: 0 };
    for (const { id } of rows) {
      const c = await L.cargarColegio(id); const e = L.estadoLicencia(c);
      if (e.estado === 'suspendida') r.suspendidos++; else if (e.estado === 'vencida') r.vencidos++;
      else { r.activos++; if (e.estado === 'prueba') r.prueba++; if (e.dias_restantes != null && e.dias_restantes <= 15) r.por_vencer++; }
    }
    r.alumnos = (await pool.query('SELECT COUNT(*)::int n FROM alumnos WHERE activo = true')).rows[0].n;
    res.json(r);
  } catch (e) { fail(res, e); }
});

router.get('/colegios', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.nombre, c.moodle_url, c.activo, c.plan_id, c.licencia_estado, c.licencia_inicio::text AS licencia_inicio, c.licencia_vence::text AS licencia_vence,
              c.modulos, c.limite_alumnos, c.limite_usuarios, c.notas_proveedor, p.nombre AS plan_nombre, p.modulos AS plan_modulos,
              p.max_alumnos AS plan_max_alumnos, p.max_usuarios AS plan_max_usuarios,
              (SELECT COUNT(*)::int FROM alumnos a WHERE a.colegio_id = c.id AND a.activo = true) AS alumnos,
              (SELECT COUNT(*)::int FROM usuarios_admin u WHERE u.colegio_id = c.id AND u.activo = true) AS usuarios
       FROM colegios c LEFT JOIN planes p ON p.id = c.plan_id ORDER BY c.id`);
    res.json(rows.map((c) => {
      const base = { id: c.id, nombre: c.nombre, plan_id: c.plan_id, licencia_estado: c.licencia_estado, licencia_vence: c.licencia_vence, modulos: c.modulos, plan_modulos: c.plan_modulos, activo: c.activo };
      const lic = L.estadoLicencia({ ...base, vence: c.licencia_vence });
      return { ...c, licencia: lic, modulos_efectivos: L.modulosEfectivos({ ...base }), limites: L.limites({ id: c.id, limite_alumnos: c.limite_alumnos, limite_usuarios: c.limite_usuarios, plan_max_alumnos: c.plan_max_alumnos, plan_max_usuarios: c.plan_max_usuarios }) };
    }));
  } catch (e) { fail(res, e); }
});

// Alta de un colegio nuevo (el token de Moodle se lee de una variable de entorno de Render)
const urlMoodle = (u) => { let x = String(u || '').trim().replace(/\/+$/, ''); if (x && !/^https?:\/\//i.test(x)) x = 'https://' + x; return x; };

router.post('/colegios', async (req, res) => {
  try {
    const b = req.body || {};
    const nombre = String(b.nombre || '').trim();
    const moodleUrl = urlMoodle(b.moodle_url);
    const variable = String(b.variable_token || '');
    if (!nombre || !moodleUrl || !/^MOODLE_TOKEN_[A-Z0-9_]+$/.test(variable)) return res.status(400).json({ error: 'Indica nombre, dirección de Moodle y la variable del token (MOODLE_TOKEN_...)' });
    if (!process.env[variable]) return res.status(400).json({ error: 'La variable ' + variable + ' todavía no existe en Render' });
    const a = b.admin || {};
    if (!a.nombre || !a.correo || String(a.password || '').length < 8) return res.status(400).json({ error: 'Indica nombre, correo y contraseña (mínimo 8) del administrador del colegio' });
    const { rows: [plan] } = await pool.query('SELECT * FROM planes WHERE id = $1', [b.plan_id]);
    if (!plan) return res.status(400).json({ error: 'Elige un plan' });

    const prueba = !!b.prueba;
    const h = L.hoy();
    const vence = prueba ? sumarDias(h, parseInt(b.dias, 10) || plan.dias_prueba || 30) : (b.vence || null);
    const { rows: [c] } = await pool.query(
      `INSERT INTO colegios (nombre, moodle_url, moodle_token, plan_id, licencia_estado, licencia_inicio, licencia_vence)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, nombre`, [nombre, moodleUrl, process.env[variable], plan.id, prueba ? 'prueba' : 'activa', h, vence]);
    try {
      await pool.query('INSERT INTO usuarios_admin (colegio_id, nombre, correo, password_hash, rol) VALUES ($1,$2,$3,$4,$5)',
        [c.id, String(a.nombre).trim(), String(a.correo).trim().toLowerCase(), await bcrypt.hash(a.password, 10), 'admin']);
    } catch (err) {
      await pool.query('DELETE FROM colegios WHERE id = $1', [c.id]);
      if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un usuario con ese correo' });
      throw err;
    }
    res.status(201).json(c);
  } catch (e) { fail(res, e); }
});

// Usuarios de un colegio: ver y corregir correo, nombre, contraseña o estado
router.get('/colegios/:id/usuarios', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, nombre, correo, rol, activo FROM usuarios_admin WHERE colegio_id = $1 ORDER BY id', [req.params.id]);
    res.json(rows);
  } catch (e) { fail(res, e); }
});

router.put('/colegios/:id/usuarios/:uid', async (req, res) => {
  try {
    const b = req.body || {};
    const sets = []; const v = [req.params.uid, req.params.id];
    const add = (col, val) => { v.push(val); sets.push(`${col} = $${v.length}`); };
    if (b.nombre != null) { const n = String(b.nombre).trim(); if (!n) return res.status(400).json({ error: 'Nombre vacío' }); add('nombre', n); }
    if (b.correo != null) { const c = String(b.correo).trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(c)) return res.status(400).json({ error: 'Correo inválido' }); add('correo', c); }
    if (b.password) { if (String(b.password).length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' }); add('password_hash', await bcrypt.hash(String(b.password), 10)); }
    if (typeof b.activo === 'boolean') add('activo', b.activo);
    if (!sets.length) return res.status(400).json({ error: 'Nada que guardar' });
    const { rowCount } = await pool.query(`UPDATE usuarios_admin SET ${sets.join(', ')} WHERE id = $1 AND colegio_id = $2`, v);
    if (!rowCount) return res.status(404).json({ error: 'Usuario no encontrado en ese colegio' });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Ya existe un usuario con ese correo' });
    fail(res, e);
  }
});

router.put('/colegios/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const sets = []; const v = [req.params.id];
    const add = (col, val) => { v.push(val); sets.push(`${col} = $${v.length}`); };
    if (b.nombre != null) { const n = String(b.nombre).trim(); if (!n) return res.status(400).json({ error: 'Nombre vacío' }); add('nombre', n); }
    if (b.moodle_url != null) { const u = urlMoodle(b.moodle_url); if (!/^https?:\/\/[^\s/]+\.[^\s/]+/.test(u)) return res.status(400).json({ error: 'Dirección de Moodle inválida (ej. https://campus.colegio.com)' }); add('moodle_url', u); }
    if ('plan_id' in b) add('plan_id', b.plan_id || null);
    if (b.licencia_estado != null) { if (!['prueba', 'activa', 'suspendida'].includes(b.licencia_estado)) return res.status(400).json({ error: 'Estado inválido' }); add('licencia_estado', b.licencia_estado); }
    if ('licencia_vence' in b) add('licencia_vence', b.licencia_vence || null);
    if (b.modulos != null) add('modulos', JSON.stringify(Object.fromEntries(Object.entries(b.modulos).filter(([k, x]) => k in L.MODULOS && typeof x === 'boolean'))));
    for (const k of ['limite_alumnos', 'limite_usuarios']) if (k in b) add(k, b[k] === '' || b[k] == null ? null : Math.max(0, parseInt(b[k], 10) || 0));
    if ('notas_proveedor' in b) add('notas_proveedor', String(b.notas_proveedor || '').slice(0, 2000) || null);
    if (!sets.length) return res.status(400).json({ error: 'Nada que guardar' });
    const { rowCount } = await pool.query(`UPDATE colegios SET ${sets.join(', ')} WHERE id = $1`, v);
    if (!rowCount) return res.status(404).json({ error: 'Colegio no encontrado' });
    L.limpiarCache(req.params.id);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

// Renueva la licencia sumando días a partir de hoy o de la fecha de vencimiento actual (lo que sea más tarde)
router.post('/colegios/:id/extender', async (req, res) => {
  try {
    const dias = parseInt(req.body.dias, 10);
    if (!dias || dias < 1 || dias > 3650) return res.status(400).json({ error: 'Indica los días a sumar' });
    const { rows: [c] } = await pool.query('SELECT licencia_vence::text AS vence FROM colegios WHERE id = $1', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Colegio no encontrado' });
    const h = L.hoy();
    const base = c.vence && c.vence > h ? c.vence : h;
    const nueva = sumarDias(base, dias);
    await pool.query(`UPDATE colegios SET licencia_vence = $2, licencia_estado = CASE WHEN licencia_estado = 'suspendida' THEN 'activa' ELSE licencia_estado END WHERE id = $1`, [req.params.id, nueva]);
    L.limpiarCache(req.params.id);
    res.json({ licencia_vence: nueva });
  } catch (e) { fail(res, e); }
});

// Modo soporte: entra al panel del colegio con una sesión corta que queda marcada
router.post('/colegios/:id/entrar', async (req, res) => {
  try {
    const { rows: [c] } = await pool.query('SELECT id, nombre FROM colegios WHERE id = $1', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Colegio no encontrado' });
    const token = jwt.sign({ id: req.usuario.id, colegio_id: c.id, correo: req.usuario.correo, rol: 'admin', soporte: true, soporte_por: req.usuario.correo }, process.env.JWT_SECRET, { expiresIn: '2h' });
    res.json({ token, colegio: c.nombre });
  } catch (e) { fail(res, e); }
});

router.get('/planes', async (req, res) => {
  try { res.json((await pool.query('SELECT * FROM planes ORDER BY orden, id')).rows); } catch (e) { fail(res, e); }
});

function leerPlan(b) {
  const nombre = String(b.nombre || '').trim();
  if (!nombre) throw Object.assign(new Error('El plan necesita un nombre'), { status: 400 });
  const num = (x) => (x === '' || x == null ? null : Math.max(0, Number(x)));
  const modulos = Object.fromEntries(Object.keys(L.MODULOS).map((k) => [k, !!(b.modulos || {})[k]]));
  return [nombre, num(b.precio_mensual), num(b.max_alumnos), num(b.max_usuarios), num(b.dias_prueba), JSON.stringify(modulos), b.activo !== false];
}
router.post('/planes', async (req, res) => {
  try {
    const clave = String(req.body.clave || req.body.nombre || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'plan';
    const v = leerPlan(req.body);
    const { rows: [p] } = await pool.query('INSERT INTO planes (clave, nombre, precio_mensual, max_alumnos, max_usuarios, dias_prueba, modulos, activo, orden) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,(SELECT COALESCE(MAX(orden),0)+1 FROM planes)) RETURNING *', [clave, ...v]);
    res.status(201).json(p);
  } catch (e) { fail(res, e); }
});
router.put('/planes/:id', async (req, res) => {
  try {
    const v = leerPlan(req.body);
    const { rows: [p] } = await pool.query('UPDATE planes SET nombre=$2, precio_mensual=$3, max_alumnos=$4, max_usuarios=$5, dias_prueba=$6, modulos=$7, activo=$8 WHERE id=$1 RETURNING *', [req.params.id, ...v]);
    if (!p) return res.status(404).json({ error: 'Plan no encontrado' });
    L.limpiarCache();
    res.json(p);
  } catch (e) { fail(res, e); }
});

module.exports = router;

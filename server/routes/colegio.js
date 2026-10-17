// Datos de la propia institución: contexto (plan, licencia, módulos), marca y logo
const express = require('express');
const router = express.Router();
const pool = require('../db');
const L = require('../services/licencias');

router.get('/contexto', async (req, res) => {
  try {
    const c = await L.cargarColegio(req.colegioId);
    const { rows: [m] } = await pool.query('SELECT nombre, correo_color, correo_pie, (logo_data IS NOT NULL) AS tiene_logo FROM colegios WHERE id = $1', [req.colegioId]);
    res.json({
      colegio: { id: c.id, nombre: m.nombre, color: m.correo_color || '#2455e6', pie: m.correo_pie, tiene_logo: m.tiene_logo },
      licencia: L.estadoLicencia(c),
      plan: { nombre: c.plan_nombre || null, limites: L.limites(c) },
      uso: await L.uso(req.colegioId),
      modulos: L.modulosEfectivos(c),
      nombres_modulos: L.MODULOS,
      es_proveedor: L.esProveedor(req.usuario),
      soporte: req.usuario.soporte ? { por: req.usuario.soporte_por } : null
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/marca', async (req, res) => {
  try {
    if (!['admin', 'director', 'superadmin'].includes(req.usuario.rol)) return res.status(403).json({ error: 'Solo dirección o administración puede cambiar la marca' });
    const b = req.body || {};
    const sets = []; const v = [req.colegioId];
    const add = (col, val) => { v.push(val); sets.push(`${col} = $${v.length}`); };
    if (b.nombre != null) { const n = String(b.nombre).trim().slice(0, 150); if (!n) return res.status(400).json({ error: 'El nombre no puede estar vacío' }); add('nombre', n); }
    if (b.color != null) { if (!/^#[0-9a-f]{6}$/i.test(b.color)) return res.status(400).json({ error: 'Color inválido' }); add('correo_color', b.color); }
    if (b.pie != null) add('correo_pie', String(b.pie).slice(0, 300) || null);
    if (b.quitar_logo) { add('logo_data', null); add('logo_tipo', null); }
    if (b.logo) {
      const m = /^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/.exec(b.logo);
      if (!m) return res.status(400).json({ error: 'El logo debe ser PNG o JPG' });
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 1024 * 1024) return res.status(400).json({ error: 'El logo pesa más de 1 MB' });
      add('logo_data', buf); add('logo_tipo', m[1] === 'image/png' ? 'image/png' : 'image/jpeg');
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada que guardar' });
    await pool.query(`UPDATE colegios SET ${sets.join(', ')} WHERE id = $1`, v);
    L.limpiarCache(req.colegioId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Público: el logo se usa en correos y pantallas
async function logoPublico(req, res) {
  try {
    const { rows: [c] } = await pool.query('SELECT logo_data, logo_tipo FROM colegios WHERE id = $1', [parseInt(req.params.id, 10) || 0]);
    if (!c || !c.logo_data) return res.status(404).end();
    res.set({ 'Content-Type': c.logo_tipo || 'image/png', 'Cache-Control': 'public, max-age=300' }).send(c.logo_data);
  } catch (e) { res.status(500).end(); }
}

module.exports = router;
module.exports.logoPublico = logoPublico;

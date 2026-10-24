// Datos de la propia institución: contexto (plan, licencia, módulos), marca y logo
const express = require('express');
const router = express.Router();
const pool = require('../db');
const L = require('../services/licencias');
const { marcaDe, CAMPOS } = require('../services/correo/firma');
const { htmlCorreo } = require('../services/correo/render');

router.get('/contexto', async (req, res) => {
  try {
    const c = await L.cargarColegio(req.colegioId);
    const { rows: [m] } = await pool.query('SELECT nombre, correo_color, correo_pie, (logo_data IS NOT NULL) AS tiene_logo, substr(md5(logo_data), 1, 10) AS logo_v, firma_nombre, firma_cargo, firma_direccion, firma_telefono, firma_web, firma_facebook, firma_instagram, firma_x, firma_linkedin, firma_youtube FROM colegios WHERE id = $1', [req.colegioId]);
    res.json({
      colegio: { id: c.id, nombre: m.nombre, color: m.correo_color || '#2455e6', pie: m.correo_pie, tiene_logo: m.tiene_logo, logo_v: m.logo_v, firma: Object.fromEntries(CAMPOS.map((k) => [k, m['firma_' + k] || ''])) },
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
    if (b.firma && typeof b.firma === 'object') for (const k of CAMPOS) if (b.firma[k] !== undefined) add('firma_' + k, String(b.firma[k]).trim().slice(0, k === 'nombre' || k === 'cargo' ? 120 : 200) || null);
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

// Vista previa de cómo se ve un correo con la firma actual del colegio
router.get('/firma-vista', async (req, res) => {
  try {
    const marca = await marcaDe(req.colegioId);
    const texto = 'Estimado padre, madre o encargado:\n\nEste es un ejemplo de cómo se ven los correos de su institución, con su logo, colores e información de contacto.\n\nGracias por su atención.';
    res.json({ html: htmlCorreo(marca, texto), usa_ulua: marca.firma.nombre === 'Ulúa Media' && marca.institucion !== 'Ulúa Media' });
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

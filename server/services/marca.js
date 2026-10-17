// Marca de la institución para documentos (PDF): nombre, color y logo
const { rgb } = require('pdf-lib');
const pool = require('../db');

async function marcaColegio(colegioId) {
  const { rows: [c] } = await pool.query('SELECT nombre, correo_color, logo_data, logo_tipo FROM colegios WHERE id = $1', [colegioId]);
  if (!c) return { nombre: '', color: rgb(0.14, 0.33, 0.9), logo: null };
  const hex = /^#[0-9a-f]{6}$/i.test(c.correo_color || '') ? c.correo_color : '#2455e6';
  const n = parseInt(hex.slice(1), 16);
  return { nombre: c.nombre, color: rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255), logo: c.logo_data ? { bytes: c.logo_data, tipo: c.logo_tipo } : null };
}

/** Dibuja el logo (alto máximo h) en (x, y). Devuelve el ancho usado, 0 si no hay logo. */
async function dibujarLogo(doc, page, marca, x, y, h) {
  if (!marca.logo) return 0;
  try {
    const img = /png/i.test(marca.logo.tipo || '') ? await doc.embedPng(marca.logo.bytes) : await doc.embedJpg(marca.logo.bytes);
    const w = (img.width / img.height) * h;
    page.drawImage(img, { x, y, width: w, height: h });
    return w;
  } catch (e) { return 0; }
}

module.exports = { marcaColegio, dibujarLogo };

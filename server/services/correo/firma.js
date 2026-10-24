const pool = require('../../db');
const { escapar } = require('./render');

const front = () => String(process.env.FRONTEND_URL || 'https://sistema.uluamedia.com').replace(/\/+$/, '');
const apiUrl = () => String(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'https://panel-admin-escolar.onrender.com').replace(/\/+$/, '');
const CAMPOS = ['nombre', 'cargo', 'direccion', 'telefono', 'web', 'facebook', 'instagram', 'x', 'linkedin', 'youtube'];
const REDES = ['facebook', 'instagram', 'x', 'linkedin', 'youtube'];

// Datos de Ulúa Media: se usan cuando el colegio no completó su información de contacto
const ulua = () => ({ nombre: 'Ulúa Media', cargo: 'Soluciones digitales y audiovisuales', direccion: 'Tocoa, Colón, Honduras', telefono: '+504 8901-2215', web: 'uluamedia.com',
  logo: front() + '/logo-ulua-media.png', redes: {}, color: '#0066ff' });

const url = (v) => { const t = String(v || '').trim(); return !t ? '' : (/^https?:\/\//i.test(t) ? t : 'https://' + t); };

/** Marca completa del colegio para correos: encabezado + tarjeta de firma (con respaldo de Ulúa Media) */
async function marcaDe(colegioId) {
  const { rows: [c] } = await pool.query(
    `SELECT nombre, correo_color, correo_logo_url, correo_pie, (logo_data IS NOT NULL) AS tiene_logo,
            firma_nombre, firma_cargo, firma_direccion, firma_telefono, firma_web, firma_facebook, firma_instagram, firma_x, firma_linkedin, firma_youtube
     FROM colegios WHERE id = $1`, [colegioId]);
  if (!c) return { institucion: 'Ulúa Campus', color: '#0066ff', firma: ulua() };
  const logo = c.tiene_logo ? apiUrl() + '/api/marca/' + colegioId + '/logo' : (c.correo_logo_url || '');
  const color = /^#[0-9a-f]{6}$/i.test(c.correo_color || '') ? c.correo_color : '#2455e6';
  const redes = {}; REDES.forEach((r) => { if (c['firma_' + r]) redes[r] = url(c['firma_' + r]); });
  const tieneInfo = !!(c.firma_direccion || c.firma_telefono || c.firma_web || Object.keys(redes).length);
  const firma = tieneInfo
    ? { institucion: c.nombre, nombre: c.firma_nombre || c.nombre, cargo: c.firma_cargo || '', direccion: c.firma_direccion || '', telefono: c.firma_telefono || '', web: c.firma_web || '', logo, redes, color }
    : ulua();
  return { institucion: c.nombre, color, logo, pie: c.correo_pie, firma };
}

const ICONO = (n) => front() + '/iconos/' + n + '.png';
const ETIQUETA = { facebook: 'Facebook', instagram: 'Instagram', x: 'X', linkedin: 'LinkedIn', youtube: 'YouTube' };

/** Fila de íconos de redes en gris (fuera de la tarjeta) */
function htmlRedes(redes) {
  return REDES.filter((r) => redes && redes[r]).map((r) =>
    `<td style="padding:0 5px"><a href="${escapar(redes[r])}" title="${ETIQUETA[r]}" style="text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="30" height="30" align="center" valign="middle" style="width:30px;height:30px;background:#9ca3af;border-radius:15px"><img src="${ICONO(r)}" width="16" height="16" alt="${ETIQUETA[r]}" style="display:block;border:0"></td></tr></table></a></td>`).join('');
}

/** Tarjeta de firma: logo, nombre y cargo, redes y barra de color con ubicación, teléfono y web */
function htmlFirma(f) {
  const c = f.color;
  const logo = f.logo && /^https:\/\//.test(f.logo)
    ? `<img src="${escapar(f.logo)}" alt="${escapar(f.nombre)}" width="92" style="display:block;max-width:92px;max-height:70px;height:auto;margin:0 auto">`
    : `<span style="font-size:15px;font-weight:700;color:${c}">${escapar(f.institucion || f.nombre)}</span>`;
  const redes = REDES.filter((r) => f.redes && f.redes[r]).map((r) =>
    `<td style="padding-left:6px"><a href="${escapar(f.redes[r])}" title="${ETIQUETA[r]}" style="text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="26" height="26" align="center" valign="middle" style="width:26px;height:26px;background:${c};border-radius:13px"><img src="${ICONO(r)}" width="14" height="14" alt="${ETIQUETA[r]}" style="display:block;border:0"></td></tr></table></a></td>`).join('');
  const dato = (ic, txt, href) => {
    const t = href ? `<a href="${escapar(href)}" style="color:#ffffff;text-decoration:none">${escapar(txt)}</a>` : escapar(txt);
    return `<td style="padding:0 14px;border-left:1px solid rgba(255,255,255,.35);white-space:nowrap;font-size:12px;color:#ffffff"><img src="${ICONO(ic)}" width="13" height="13" alt="" style="vertical-align:middle;border:0;margin-right:6px">${t}</td>`;
  };
  const datos = [
    f.direccion && dato('ubicacion', f.direccion),
    f.telefono && dato('telefono', f.telefono, 'tel:' + String(f.telefono).replace(/[^\d+]/g, '')),
    f.web && dato('web', String(f.web).replace(/^https?:\/\//i, '').replace(/\/$/, ''), url(f.web))
  ].filter(Boolean);
  if (datos.length) datos[0] = datos[0].replace('border-left:1px solid rgba(255,255,255,.35);', '');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;background:#ffffff">
<tr><td style="padding:16px 18px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="110" valign="middle" align="center" style="padding-right:14px;border-right:1px solid #cfd4dc">${logo}</td>
<td valign="middle" style="padding-left:16px"><div style="font-size:17px;font-weight:700;color:#1f2937;line-height:1.25">${escapar(f.nombre)}</div>${f.cargo ? `<div style="font-size:13px;color:#4b5563;margin-top:3px">${escapar(f.cargo)}</div>` : ''}</td>
${redes ? `<td valign="top" align="right"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${redes}</tr></table></td>` : ''}
</tr></table></td></tr>
${datos.length ? `<tr><td style="background:${c};padding:10px 6px"><table role="presentation" cellpadding="0" cellspacing="0" align="left"><tr>${datos.join('')}</tr></table></td></tr>` : ''}
</table>`;
}

module.exports = { marcaDe, htmlFirma, htmlRedes, ulua, CAMPOS, REDES, url };

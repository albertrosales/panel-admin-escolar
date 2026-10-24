const escapar = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const RE = /\{\{\s*([a-z_]+)\s*\}\}/gi;

/** Reemplaza variables. Una línea cuya variable no tenga dato se elimina: nunca se muestra "{{...}}". */
function render(texto, vars) {
  const faltantes = new Set();
  const lineas = String(texto || '').split('\n').map((l) => {
    let falta = false;
    const r = l.replace(RE, (_, k) => {
      const v = vars[k.toLowerCase()];
      if (v == null || String(v).trim() === '') { falta = true; faltantes.add(k.toLowerCase()); return ''; }
      return String(v);
    });
    return falta ? null : r;
  }).filter((l) => l !== null);
  return { texto: lineas.join('\n').replace(/\n{3,}/g, '\n\n').trim(), faltantes: [...faltantes] };
}

function renderAsunto(asunto, vars) {
  return String(asunto || '').replace(RE, (_, k) => String(vars[k.toLowerCase()] || '')).replace(/\s+/g, ' ').replace(/[\r\n]/g, ' ').trim();
}

const aclarar = (hex, a) => { const n = parseInt(hex.slice(1), 16); const m = (v) => Math.round(v + (255 - v) * (1 - a)); return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => m(v).toString(16).padStart(2, '0')).join(''); };
const LINEA_DATO = /^([^:\n]{1,32}):\s+(\S.*)$/;
const ES_URL = /^https?:\/\/\S+$/i;

/** Convierte el texto plano en bloques de diseño: título, cajas destacadas, botones y párrafos */
function bloques(texto, c) {
  const parrafos = texto.split(/\n{2,}/);
  const out = [];
  parrafos.forEach((p, i) => {
    const lineas = p.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lineas.length) return;
    const datos = lineas.map((l) => LINEA_DATO.exec(l));
    if (datos.every(Boolean) && datos.every((d) => ES_URL.test(d[2].trim()))) {
      out.push(`<div style="text-align:center;margin:6px 0 18px">${datos.map((d) => `<a href="${escapar(d[2].trim())}" style="display:inline-block;margin:0 4px 10px;background:${c};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:999px">${escapar(d[1])}</a>`).join('')}</div>`);
    } else if (datos.every(Boolean) && lineas.length <= 8) {
      out.push(`<div style="background:${aclarar(c, 0.1)};border:2px solid ${c};border-radius:16px;padding:16px 20px;margin:0 0 20px">${datos.map((d, k) =>
        `<div style="font-size:15px;line-height:1.5;${k ? 'margin-top:6px' : ''}"><span style="color:#4b5563">${escapar(d[1])}:</span> <strong style="color:#111827;font-size:${lineas.length <= 3 ? 17 : 15}px;word-break:break-word">${escapar(d[2])}</strong></div>`).join('')}</div>`);
    } else if (i === 0 && lineas.length === 1 && lineas[0].length <= 70 && !/[:,]$/.test(lineas[0]) && !/^(hola|estimad)/i.test(lineas[0]) && parrafos.length > 2) {
      out.push(`<h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;color:#111827;font-weight:800">${escapar(lineas[0])}</h1>`);
    } else {
      out.push(`<p style="margin:0 0 16px;line-height:1.6">${escapar(lineas.join('\n')).replace(/\n/g, '<br>')}</p>`);
    }
  });
  return out.join('');
}

/** Plantilla HTML adaptable a móvil: tarjeta redondeada con franja de color y logo, cajas destacadas, botones, firma y redes */
function htmlCorreo({ institucion, color, logo, pie, firma }, texto) {
  const c = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#2455e6';
  const cab = logo && /^https:\/\//.test(logo)
    ? `<img src="${escapar(logo)}" alt="${escapar(institucion)}" style="max-height:46px;max-width:230px;display:block">`
    : `<span style="color:#fff;font-size:20px;font-weight:700">${escapar(institucion)}</span>`;
  const F = require('./firma');
  const redes = firma ? F.htmlRedes(firma.redes) : '';
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#e5e7eb;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e5e7eb"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:18px;overflow:hidden">
<tr><td style="background:${c};padding:20px 28px">${cab}</td></tr>
<tr><td style="padding:28px 28px 8px;font-size:15px">${bloques(texto, c)}</td></tr>
${firma ? `<tr><td style="padding:4px 28px 28px">${F.htmlFirma({ ...firma, redes: {} })}</td></tr>` : ''}
</table>
${redes ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px auto 0"><tr>${redes}</tr></table>` : ''}
<div style="max-width:560px;margin:14px auto 0;color:#6b7280;font-size:12px;line-height:1.5;text-align:center">${escapar(pie || 'Mensaje enviado por ' + institucion)}</div>
</td></tr></table></body></html>`;
}

module.exports = { render, renderAsunto, htmlCorreo, escapar };

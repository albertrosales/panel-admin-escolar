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

/** Plantilla HTML adaptable a móvil con la identidad (color, logo, pie) de la institución */
function htmlCorreo({ institucion, color, logo, pie }, texto) {
  const c = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#2455e6';
  const cuerpo = texto.split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px;line-height:1.55">${escapar(p).replace(/\n/g, '<br>')}</p>`).join('');
  const cab = logo && /^https:\/\//.test(logo)
    ? `<img src="${escapar(logo)}" alt="${escapar(institucion)}" style="max-height:44px;max-width:220px;display:block">`
    : `<span style="color:#fff;font-size:18px;font-weight:600">${escapar(institucion)}</span>`;
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6"><tr><td align="center" style="padding:16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:${c};padding:18px 24px">${cab}</td></tr>
<tr><td style="padding:24px;font-size:15px">${cuerpo}</td></tr>
<tr><td style="padding:14px 24px;background:#f9fafb;color:#6b7280;font-size:12px">${escapar(pie || 'Mensaje enviado por ' + institucion)}</td></tr>
</table></td></tr></table></body></html>`;
}

module.exports = { render, renderAsunto, htmlCorreo, escapar };

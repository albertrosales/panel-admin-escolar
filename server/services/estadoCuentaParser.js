// Lector directo (sin IA) de estados de cuenta en CSV con encabezados reconocibles.
// Devuelve null si no reconoce el formato, para que se use la lectura con IA.

function partirLinea(l, sep) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === sep && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

function numero(v) {
  let s = String(v || '').replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else if (s.includes(',')) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function fechaISO(v) {
  const s = String(v || '').trim();
  let m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function leerCSV(texto) {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lineas.length < 2) return null;
  const sep = (lineas[0].match(/;/g) || []).length > (lineas[0].match(/,/g) || []).length ? ';' : ',';
  const enc = partirLinea(lineas[0], sep).map((h) => h.toLowerCase());
  const iFecha = enc.findIndex((h) => /fecha|date/.test(h));
  const iCred = enc.findIndex((h) => /cr[eé]dito|credit|abono|dep[oó]sito|entrada/.test(h));
  if (iFecha < 0 || iCred < 0) return null;
  const iRef = enc.findIndex((h) => /refer/.test(h));
  let iDesc = enc.findIndex((h) => /descri|detalle|concepto|movimiento/.test(h));
  if (iDesc < 0) iDesc = (iRef >= 0 ? iRef : iFecha) + 1;
  const trailing = Math.max(0, enc.length - 1 - iDesc);
  const desdeFinal = enc.length - iCred; // posición del crédito contando desde el final (soporta comas sueltas en la descripción)
  const movs = [];
  for (const l of lineas.slice(1)) {
    const c = partirLinea(l, sep);
    if (c.length < 3) continue;
    const monto = numero(c[c.length - desdeFinal]);
    if (!(monto > 0)) continue;
    const fecha = fechaISO(c[iFecha]);
    const desc = c.slice(iDesc, c.length - trailing).join(', ');
    movs.push({ fecha, referencia: iRef >= 0 ? c[iRef] : null, monto, descripcion: desc });
  }
  return movs;
}

module.exports = { leerCSV, numero, fechaISO };

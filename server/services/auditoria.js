// Registro de auditoría: quién hizo qué y cuándo. Se llena solo con cada cambio (POST/PUT/PATCH/DELETE exitoso).
const pool = require('../db');

const OCULTAR = /pass|token|imagen|archivo|logo|secret|hash|contrasena|clave/i;
const OMITIR = /^(auth\/|colegio\/contexto|.*vista-previa|.*analizar|.*validar|correos\/prueba)/;

function limpiar(v, nivel = 0) {
  if (v == null) return v;
  if (typeof v === 'string') return v.length > 200 ? v.slice(0, 200) + '…' : v;
  if (typeof v !== 'object') return v;
  if (nivel > 3) return '…';
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => limpiar(x, nivel + 1));
  const o = {};
  for (const [k, x] of Object.entries(v)) o[k] = OCULTAR.test(k) ? '[oculto]' : limpiar(x, nivel + 1);
  return o;
}

async function registrar(r) {
  try {
    let d = r.detalle == null ? null : limpiar(r.detalle);
    if (d && JSON.stringify(d).length > 4000) d = { resumen: 'Contenido demasiado grande para guardar' };
    await pool.query(
      `INSERT INTO auditoria (colegio_id, usuario_id, usuario, rol, soporte, accion, metodo, ruta, entidad, entidad_id, detalle, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [r.colegioId || null, r.usuarioId || null, r.usuario || null, r.rol || null, !!r.soporte, String(r.accion || '').slice(0, 200), r.metodo || null,
        r.ruta ? String(r.ruta).slice(0, 250) : null, r.entidad || null, r.entidadId || null, d ? JSON.stringify(d) : null, r.ip ? String(r.ip).slice(0, 60) : null]);
  } catch (e) { console.error('auditoría:', e.message); }
}

const VERBO = { POST: 'Crear', PUT: 'Modificar', PATCH: 'Modificar', DELETE: 'Eliminar' };
function describir(metodo, seg) {
  const ultimo = seg[seg.length - 1];
  if (metodo === 'POST' && seg.length > 1 && !/^\d+$/.test(ultimo)) return 'Ejecutar ' + ultimo.replace(/-/g, ' ') + ' (' + seg[0] + ')';
  return VERBO[metodo] + ' ' + seg[0];
}

/** Va después de licencias.guard (que deja el token verificado en req.jwt) */
function middleware(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  res.on('finish', () => {
    try {
      const p = req.jwt;
      if (!p || res.statusCode >= 400) return;
      const url = req.originalUrl.split('?')[0].replace(/^\/api\//, '');
      if (OMITIR.test(url)) return;
      const seg = url.split('/').filter(Boolean);
      if (!seg.length) return;
      registrar({
        colegioId: p.colegio_id, usuarioId: p.id, usuario: p.tipo ? `${p.tipo} #${p.id}` : p.correo, rol: p.tipo || p.rol, soporte: !!p.soporte,
        accion: describir(req.method, seg), metodo: req.method, ruta: '/' + url, entidad: seg[0],
        entidadId: seg.slice(1).find((x) => /^\d+$/.test(x)) || null, detalle: req.body,
        ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip
      });
    } catch (e) { /* nunca romper la petición */ }
  });
  next();
}

const depurar = () => pool.query("DELETE FROM auditoria WHERE creado_en < NOW() - interval '540 days'").catch(() => {});

module.exports = { registrar, middleware, depurar, limpiar };

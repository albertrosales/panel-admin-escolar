const express = require('express');
const XLSX = require('xlsx');
const pool = require('../db');
const lic = require('../services/licencias');
const router = express.Router();
router.use((req, res, next) => ['admin', 'director', 'superadmin'].includes(req.jwt && req.jwt.rol) ? next() : res.status(403).json({ error: 'Sin permiso' }));

const PLANTILLAS = {
  alumnos: {
    cols: ['nombre_completo', 'identidad', 'seccion', 'nombre_encargado', 'telefono_encargado', 'correo_encargado', 'telefono', 'direccion', 'fecha_nacimiento', 'mensualidad'],
    ejemplo: ['Ana María López', '0801-2010-12345', '8.º Grado A', 'Carlos López', '9999-8888', 'carlos@correo.com', '', 'Col. Centro, Tocoa', '2010-05-14', 850],
    ayuda: 'Obligatorio: nombre_completo. "seccion" debe coincidir con una sección creada en Grados (matricula al alumno en todas sus clases). Fechas: AAAA-MM-DD.'
  },
  profesores: {
    cols: ['nombre_completo', 'correo', 'telefono', 'fecha_ingreso'],
    ejemplo: ['Luis Pérez', 'luis@correo.com', '9888-7777', '2020-02-01'],
    ayuda: 'Obligatorio: nombre_completo. Si no hay fecha_ingreso se usa la de hoy.'
  },
  saldos: {
    cols: ['codigo', 'identidad', 'nombre_completo', 'periodo', 'monto', 'fecha_vencimiento', 'notas'],
    ejemplo: ['2026001', '', 'Ana María López', '2026-09', 850, '2026-09-05', 'Saldo anterior'],
    ayuda: 'Cada fila crea un pago pendiente. El alumno se busca por código, luego identidad, luego nombre exacto. periodo: AAAA-MM.'
  }
};

const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const clave = (s) => norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const txt = (v) => (v == null ? '' : String(v).trim());

function fechaISO(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : undefined; }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return undefined;
}
const numero = (v) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[^\d.\-]/g, '')); return isNaN(n) ? undefined : n; };

function leerFilas(archivo) {
  const m = /^data:[^;]*;base64,(.+)$/.exec(archivo || '');
  if (!m) { const e = new Error('Adjunta un archivo de Excel (.xlsx)'); e.status = 400; throw e; }
  let wb;
  try { wb = XLSX.read(Buffer.from(m[1], 'base64'), { type: 'buffer', cellDates: true }); } catch { const e = new Error('No se pudo leer el archivo. Usa un .xlsx o .csv'); e.status = 400; throw e; }
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: true });
  if (filas.length > 2000) { const e = new Error('Máximo 2000 filas por archivo; divídelo en partes.'); e.status = 400; throw e; }
  return filas.map((f) => { const o = {}; for (const k of Object.keys(f)) o[clave(k)] = f[k]; return o; })
    .filter((f) => Object.values(f).some((v) => txt(v) !== ''));
}

// Procesa el archivo dentro de una transacción; si es simulación se revierte
async function procesar(tipo, filas, colegioId, aplicar) {
  const c = await pool.connect();
  const res = { total: filas.length, ok: 0, omitidas: 0, errores: 0, filas: [] };
  const anota = (n, estado, msg) => { res.filas.push({ fila: n, estado, mensaje: msg }); if (estado === 'ok') res.ok++; else if (estado === 'omitida') res.omitidas++; else res.errores++; };
  try {
    await c.query('BEGIN');
    if (tipo === 'alumnos') {
      const { rows: [{ n }] } = await c.query('SELECT COUNT(*)::int n FROM alumnos WHERE colegio_id=$1 AND activo=true', [colegioId]);
      const col = await lic.cargarColegio(colegioId);
      const lim = col ? lic.limites(col).alumnos : null;
      let activos = n;
      const { rows: ex } = await c.query('SELECT identidad, nombre_completo FROM alumnos WHERE colegio_id=$1', [colegioId]);
      const ids = new Set(ex.map((a) => norm(a.identidad)).filter(Boolean));
      const nombres = new Set(ex.map((a) => norm(a.nombre_completo)));
      const { rows: gr } = await c.query("SELECT id, seccion FROM grados WHERE colegio_id=$1 AND seccion IS NOT NULL AND seccion<>''", [colegioId]);
      const secs = {}; gr.forEach((g) => (secs[norm(g.seccion)] = secs[norm(g.seccion)] || []).push(g.id));
      for (let i = 0; i < filas.length; i++) {
        const f = filas[i], num = i + 2;
        try {
          const nombre = txt(f.nombre_completo);
          if (!nombre) { anota(num, 'error', 'Falta nombre_completo'); continue; }
          const idn = txt(f.identidad);
          if ((idn && ids.has(norm(idn))) || (!idn && nombres.has(norm(nombre)))) { anota(num, 'omitida', 'Ya existe (' + (idn || nombre) + ')'); continue; }
          const fn = fechaISO(f.fecha_nacimiento), mens = numero(f.mensualidad);
          if (fn === undefined) { anota(num, 'error', 'fecha_nacimiento inválida (usa AAAA-MM-DD)'); continue; }
          if (mens === undefined) { anota(num, 'error', 'mensualidad inválida'); continue; }
          const sec = txt(f.seccion);
          if (sec && !secs[norm(sec)]) { anota(num, 'error', `La sección "${sec}" no existe en Grados`); continue; }
          if (lim != null && activos + 1 > lim) { anota(num, 'error', `Límite de ${lim} alumnos del plan alcanzado`); continue; }
          const { rows: [a] } = await c.query(
            `INSERT INTO alumnos (colegio_id, grado_id, nombre_completo, nombre_encargado, telefono_encargado, correo_encargado, telefono, direccion, fecha_nacimiento, identidad, monto_mensualidad)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, codigo`,
            [colegioId, sec ? secs[norm(sec)][0] : null, nombre, txt(f.nombre_encargado) || null, txt(f.telefono_encargado) || null, txt(f.correo_encargado) || null, txt(f.telefono) || null, txt(f.direccion) || null, fn, idn || null, mens]);
          if (sec) for (const gid of secs[norm(sec)]) await c.query('INSERT INTO matriculas (alumno_id, grado_id) SELECT $1,$2 WHERE NOT EXISTS (SELECT 1 FROM matriculas WHERE alumno_id=$1 AND grado_id=$2)', [a.id, gid]);
          activos++; if (idn) ids.add(norm(idn)); nombres.add(norm(nombre));
          anota(num, 'ok', 'Código ' + a.codigo);
        } catch (e) { anota(num, 'error', e.message); }
      }
    } else if (tipo === 'profesores') {
      const { rows: ex } = await c.query('SELECT correo, nombre_completo FROM profesores WHERE colegio_id=$1', [colegioId]);
      const correos = new Set(ex.map((p) => norm(p.correo)).filter(Boolean)), nombres = new Set(ex.map((p) => norm(p.nombre_completo)));
      for (let i = 0; i < filas.length; i++) {
        const f = filas[i], num = i + 2;
        try {
          const nombre = txt(f.nombre_completo), cor = txt(f.correo);
          if (!nombre) { anota(num, 'error', 'Falta nombre_completo'); continue; }
          if (cor && !/^\S+@\S+\.\S+$/.test(cor)) { anota(num, 'error', 'Correo inválido'); continue; }
          if ((cor && correos.has(norm(cor))) || (!cor && nombres.has(norm(nombre)))) { anota(num, 'omitida', 'Ya existe'); continue; }
          const fi = fechaISO(f.fecha_ingreso);
          if (fi === undefined) { anota(num, 'error', 'fecha_ingreso inválida'); continue; }
          await c.query('INSERT INTO profesores (colegio_id, nombre_completo, correo, telefono, fecha_ingreso) VALUES ($1,$2,$3,$4,COALESCE($5::date, $6::date))',
            [colegioId, nombre, cor || null, txt(f.telefono) || null, fi, lic.hoy()]);
          if (cor) correos.add(norm(cor)); nombres.add(norm(nombre));
          anota(num, 'ok', 'Profesor creado');
        } catch (e) { anota(num, 'error', e.message); }
      }
    } else {
      const { rows: al } = await c.query('SELECT id, codigo, identidad, nombre_completo FROM alumnos WHERE colegio_id=$1', [colegioId]);
      const porCod = {}, porId = {}, porNom = {};
      al.forEach((a) => { if (a.codigo) porCod[norm(a.codigo)] = a; if (a.identidad) porId[norm(a.identidad)] = a; (porNom[norm(a.nombre_completo)] = porNom[norm(a.nombre_completo)] || []).push(a); });
      const tocados = new Set();
      for (let i = 0; i < filas.length; i++) {
        const f = filas[i], num = i + 2;
        try {
          const cod = txt(f.codigo), idn = txt(f.identidad), nom = txt(f.nombre_completo);
          let a = (cod && porCod[norm(cod)]) || (idn && porId[norm(idn)]) || null;
          if (!a && nom) { const l = porNom[norm(nom)] || []; if (l.length > 1) { anota(num, 'error', 'Nombre repetido; usa código o identidad'); continue; } a = l[0] || null; }
          if (!a) { anota(num, 'error', 'Alumno no encontrado'); continue; }
          const per = txt(f.periodo), monto = numero(f.monto), fv = fechaISO(f.fecha_vencimiento);
          if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(per)) { anota(num, 'error', 'periodo inválido (AAAA-MM)'); continue; }
          if (monto == null || monto === undefined || monto <= 0) { anota(num, 'error', 'monto inválido'); continue; }
          if (!fv) { anota(num, 'error', 'fecha_vencimiento requerida (AAAA-MM-DD)'); continue; }
          const { rowCount } = await c.query('SELECT 1 FROM pagos WHERE alumno_id=$1 AND periodo=$2 AND monto=$3 AND pagado=false', [a.id, per, monto]);
          if (rowCount) { anota(num, 'omitida', 'Ya existe un pago pendiente igual'); continue; }
          await c.query('INSERT INTO pagos (alumno_id, periodo, monto, fecha_vencimiento, notas) VALUES ($1,$2,$3,$4,$5)', [a.id, per, monto, fv, txt(f.notas) || 'Saldo importado']);
          tocados.add(a.id);
          anota(num, 'ok', a.nombre_completo);
        } catch (e) { anota(num, 'error', e.message); }
      }
      res.alumnos_afectados = [...tocados];
    }
    await c.query(aplicar ? 'COMMIT' : 'ROLLBACK');
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
  return res;
}

router.get('/plantilla/:tipo', (req, res) => {
  const p = PLANTILLAS[req.params.tipo];
  if (!p) return res.status(404).json({ error: 'Tipo desconocido' });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([p.cols, p.ejemplo]), 'Datos');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Instrucciones'], [p.ayuda], ['Borra la fila de ejemplo antes de importar.']]), 'Instrucciones');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="plantilla_${req.params.tipo}.xlsx"`);
  res.send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
});

async function ejecutar(req, res, aplicar) {
  try {
    const tipo = req.body.tipo;
    if (!PLANTILLAS[tipo]) return res.status(400).json({ error: 'Tipo de importación inválido' });
    const filas = leerFilas(req.body.archivo);
    if (!filas.length) return res.status(400).json({ error: 'El archivo no tiene filas con datos' });
    const req_ = { alumnos: ['nombre_completo'], profesores: ['nombre_completo'], saldos: ['periodo', 'monto', 'fecha_vencimiento'] }[tipo];
    const falta = req_.filter((k) => !(k in filas[0]));
    if (falta.length) return res.status(400).json({ error: 'Faltan columnas: ' + falta.join(', ') + '. Descarga la plantilla.' });
    const r = await procesar(tipo, filas, req.colegioId, aplicar);
    if (aplicar && tipo === 'saldos' && r.alumnos_afectados.length) {
      const { evaluarEstadoAlumno } = require('../services/estadoPagoService');
      for (const id of r.alumnos_afectados) await evaluarEstadoAlumno(id).catch(() => {});
    }
    delete r.alumnos_afectados;
    res.json(Object.assign({ aplicado: aplicar }, r));
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
}
router.post('/analizar', (req, res) => ejecutar(req, res, false));
router.post('/importar', (req, res) => ejecutar(req, res, true));

module.exports = router;

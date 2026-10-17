const XLSX = require('xlsx');
const pool = require('../db');
const { buildClient } = require('./moodleService');

const ROMANOS = ['I', 'II', 'III', 'IV'];
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
// Moodle guarda segundos UTC; el día local de Honduras es UTC-6
const diaLocal = (seg) => new Date((seg - 6 * 3600) * 1000).toISOString().slice(0, 10);

function encabezadoPorDefecto(colegio, grado) {
  return {
    centro: [colegio.sace_codigo, colegio.sace_centro || colegio.nombre].filter(Boolean).join(' | '),
    modalidad: colegio.sace_modalidad || '',
    grado: grado.sace_grado || String(grado.seccion || '').toUpperCase(),
    jornada: colegio.sace_jornada || '',
    asignatura: grado.materia || grado.nombre
  };
}

async function parcialesDe(gradoId) {
  const { rows } = await pool.query('SELECT parcial, inicio::text, fin::text FROM sace_parciales WHERE grado_id=$1 ORDER BY parcial', [gradoId]);
  return rows;
}

// Notas de Moodle por alumno: suma de las actividades calificadas dentro de las fechas de cada parcial
async function notasMoodle(colegio, curso, parciales) {
  const out = {};
  if (!curso || !parciales.length) return out;
  const call = buildClient(colegio.moodle_url, colegio.moodle_token);
  const r = await call('gradereport_user_get_grade_items', { courseid: curso, userid: 0 });
  const usuarios = r.usergrades || [];
  for (const p of parciales) {
    // Una actividad pertenece al parcial si alguien fue calificado en sus fechas
    const items = {};
    for (const u of usuarios) for (const it of u.gradeitems || []) {
      if (it.itemtype !== 'mod' && it.itemtype !== 'manual') continue;
      const seg = it.gradedategraded || it.gradedatesubmitted;
      if (it.graderaw == null || !seg || !it.grademax) continue;
      const d = diaLocal(seg);
      if (d >= p.inicio && d <= p.fin) items[it.id] = it.grademax;
    }
    const max = Object.values(items).reduce((a, b) => a + b, 0);
    for (const u of usuarios) {
      let sum = 0;
      for (const it of u.gradeitems || []) if (items[it.id] != null && it.graderaw != null) sum += it.graderaw;
      (out[u.userid] = out[u.userid] || {})[p.parcial] = max ? Math.round((sum / max) * 100) : null;
    }
  }
  return out;
}

async function datosClase(colegioId, gradoId, { justificadas = true } = {}) {
  const { rows: [colegio] } = await pool.query('SELECT * FROM colegios WHERE id=$1', [colegioId]);
  const { rows: [grado] } = await pool.query(
    `SELECT g.*, (SELECT materia FROM profesor_grado_materia WHERE grado_id=g.id LIMIT 1) AS materia FROM grados g WHERE g.id=$1 AND g.colegio_id=$2`, [gradoId, colegioId]);
  if (!grado) return null;
  const parciales = await parcialesDe(gradoId);
  const { rows: alumnos } = await pool.query(
    `SELECT a.id, a.nombre_completo, a.identidad, a.es_extranjero, a.moodle_user_id FROM matriculas m JOIN alumnos a ON a.id=m.alumno_id
     WHERE m.grado_id=$1 AND m.activa AND a.activo ORDER BY a.nombre_completo`, [gradoId]);
  const estados = justificadas ? "('A','J')" : "('A')";
  const inas = {};
  for (const p of parciales) {
    const { rows } = await pool.query(
      `SELECT alumno_id, COUNT(*)::int n FROM asistencia WHERE grado_id=$1 AND fecha BETWEEN $2 AND $3 AND estado IN ${estados} GROUP BY 1`, [gradoId, p.inicio, p.fin]);
    inas[p.parcial] = Object.fromEntries(rows.map((x) => [x.alumno_id, x.n]));
  }
  let notas = {}, avisoMoodle = null;
  try { notas = await notasMoodle(colegio, grado.moodle_category_id, parciales); } catch (e) { avisoMoodle = 'No se pudieron leer las notas de Moodle: ' + e.message; }
  return {
    encabezado: encabezadoPorDefecto(colegio, grado),
    parciales,
    aviso: avisoMoodle || (!grado.moodle_category_id ? 'Esta clase no está vinculada a un curso de Moodle; las notas quedan vacías.' : null),
    alumnos: alumnos.map((a) => ({
      documento: a.es_extranjero ? 'EXT' : 'HND', identidad: a.identidad || '', nombre: String(a.nombre_completo).toUpperCase(),
      p: [1, 2, 3, 4].map((n) => {
        if (!parciales.find((x) => x.parcial === n)) return { inas: '', nota: '' };
        const nota = a.moodle_user_id && notas[a.moodle_user_id] ? notas[a.moodle_user_id][n] : null;
        return { inas: (inas[n] && inas[n][a.id]) || 0, nota: nota == null ? '' : nota };
      })
    }))
  };
}

// Hoja con la misma estructura que el formato oficial de SACE
function generarXls({ encabezado: e, alumnos }) {
  const aoa = [
    [e.centro || ''], ['MODALIDAD: ' + (e.modalidad || '')], [e.grado || ''], ['JORNADA ' + (e.jornada || '______________________')], ['ASIGNATURA ' + (e.asignatura || '')],
    ['DOCUMENTO', 'IDENTIDAD', 'NOMBRE', 'PARCIAL I', '', 'PARCIAL II', '', 'PARCIAL III', '', 'PARCIAL IV', '', 'RECUPERACIÓN'],
    ['', '', '', 'INASISTENCIAS', 'NOTA TOTAL', 'INASISTENCIAS', 'NOTA TOTAL', 'INASISTENCIAS', 'NOTA TOTAL', 'INASISTENCIAS', 'NOTA TOTAL']
  ];
  for (const a of alumnos) {
    const fila = [a.documento || 'HND', a.identidad, a.nombre];
    for (let i = 0; i < 4; i++) { const p = (a.p || [])[i] || {}; fila.push(p.inas === '' || p.inas == null ? '' : Number(p.inas), p.nota === '' || p.nota == null ? '' : Number(p.nota)); }
    aoa.push(fila);
  }
  aoa.push(['**********************Fin del documento**********************']);
  aoa.push(['Nota: Únicamente ingrese notas en las casillas generadas por el sistema para este documento, de ninguna forma altere el formato y diseño de este.']);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const n = aoa.length;
  ws['!merges'] = [0, 1, 2, 3, 4, n - 2, n - 1].map((r) => ({ s: { r, c: 0 }, e: { r, c: 14 } }))
    .concat([{ s: { r: 5, c: 0 }, e: { r: 6, c: 0 } }, { s: { r: 5, c: 1 }, e: { r: 6, c: 1 } }, { s: { r: 5, c: 2 }, e: { r: 6, c: 2 } }, { s: { r: 5, c: 11 }, e: { r: 6, c: 11 } }],
      [3, 5, 7, 9].map((c) => ({ s: { r: 5, c }, e: { r: 5, c: c + 1 } })));
  ws['!cols'] = [12, 18, 45, 14, 14, 14, 14, 14, 14, 14, 14, 18].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'SACE');
  return XLSX.write(wb, { type: 'buffer', bookType: 'biff8' });
}

module.exports = { datosClase, generarXls, parcialesDe, encabezadoPorDefecto, ROMANOS };

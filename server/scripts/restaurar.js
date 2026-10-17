#!/usr/bin/env node
// Restaura datos faltantes desde un respaldo (.json.gz) SIN sobrescribir lo que ya existe.
// Uso:  DATABASE_URL=... node server/scripts/restaurar.js respaldo.json.gz [colegio_id] [--simular]
// Sirve para recuperar registros borrados por error. No borra nada.
const fs = require('fs');
const zlib = require('zlib');
const pool = require('../db');
const { TABLAS } = require('../services/respaldo');

(async () => {
  const args = process.argv.slice(2);
  const simular = args.includes('--simular');
  const [archivo, solo] = args.filter((a) => !a.startsWith('--'));
  if (!archivo) { console.error('Uso: node server/scripts/restaurar.js respaldo.json.gz [colegio_id] [--simular]'); process.exit(1); }
  const datos = JSON.parse(zlib.gunzipSync(fs.readFileSync(archivo)).toString('utf8'));
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    for (const col of datos.colegios) {
      if (solo && Number(solo) !== col.colegio_id) continue;
      console.log('Colegio', col.colegio_id);
      for (const [t] of TABLAS) {
        const filas = col.tablas[t] || [];
        if (!filas.length || t === 'colegios') continue; // el colegio debe existir ya (el respaldo no incluye su token de Moodle)
        let nuevas = 0;
        await cliente.query('SAVEPOINT tabla');
        try {
        for (const f of filas) {
          const cols = Object.keys(f);
          const r = await cliente.query(`INSERT INTO "${t}" (${cols.map((c) => '"' + c + '"').join(', ')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(', ')}) ON CONFLICT DO NOTHING`, cols.map((c) => f[c]));
          nuevas += r.rowCount;
        }
        } catch (e) { await cliente.query('ROLLBACK TO SAVEPOINT tabla'); console.log('  ' + t + ': omitida (' + e.message + ')'); continue; }
        if (nuevas) console.log('  ' + t + ': ' + nuevas + ' registro(s) recuperado(s)');
        const { rows: [s] } = await cliente.query('SELECT pg_get_serial_sequence($1, $2) AS seq', [t, 'id']);
        if (s.seq) await cliente.query(`SELECT setval($1, GREATEST((SELECT COALESCE(MAX(id),1) FROM "${t}"), 1))`, [s.seq]);
      }
    }
    await cliente.query(simular ? 'ROLLBACK' : 'COMMIT');
    console.log(simular ? 'Simulación terminada: no se guardó nada.' : 'Listo.');
  } catch (e) { await cliente.query('ROLLBACK'); console.error('Error, no se cambió nada:', e.message); process.exitCode = 1; }
  finally { cliente.release(); await pool.end(); }
})();

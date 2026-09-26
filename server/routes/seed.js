const express = require('express');
const router = express.Router();
const pool = require('../db');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

router.get('/schema', async (req, res) => {
  try {
    const schemaPath = path.join(__dirname, '..', '..', 'db', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(sql);
    res.json({ mensaje: 'Esquema creado correctamente (tablas, tipos e índices).' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/colegio', async (req, res) => {
  try {
    const existentesResult = await pool.query('SELECT * FROM colegios');
    if (existentesResult.rows.length > 0) {
      return res.json({ mensaje: 'Ya existe al menos un colegio, no se creó otro.', colegios: existentesResult.rows });
    }

    const colegioResult = await pool.query(
      'INSERT INTO colegios (nombre, moodle_url, moodle_token) VALUES ($1,$2,$3) RETURNING *',
      ['Ulua Campus - Piloto', 'https://edu.uluamedia.com', process.env.MOODLE_TOKEN_PILOTO]
    );
    res.json({ mensaje: 'Colegio creado', colegio: colegioResult.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/corregir-token', async (req, res) => {
  try {
    const colegioResult = await pool.query(
      'UPDATE colegios SET moodle_token = $1 WHERE id = 1 RETURNING *',
      [process.env.MOODLE_TOKEN_PILOTO]
    );
    res.json({ mensaje: 'Token actualizado', colegio: colegioResult.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const { getCourses, getEnrolledUsers } = require('../services/moodleService');

router.get('/importar-moodle', async (req, res) => {
  try {
    const colegioResult = await pool.query('SELECT * FROM colegios WHERE id = 1');
    const colegio = colegioResult.rows[0];
    if (!colegio) return res.status(400).json({ error: 'No existe el colegio piloto (id=1)' });

    const cursos = await getCourses({ moodleUrl: colegio.moodle_url, token: colegio.moodle_token });

    const resumen = { grados_creados: 0, alumnos_creados: 0, profesores_creados: 0, cursos_procesados: [] };

    for (const curso of cursos) {
      let gradoResult = await pool.query(
        'SELECT * FROM grados WHERE colegio_id = $1 AND moodle_category_id = $2',
        [colegio.id, curso.id]
      );
      let grado = gradoResult.rows[0];
      if (!grado) {
        const nuevoGradoResult = await pool.query(
          'INSERT INTO grados (colegio_id, nombre, moodle_category_id) VALUES ($1,$2,$3) RETURNING *',
          [colegio.id, curso.fullname, curso.id]
        );
        grado = nuevoGradoResult.rows[0];
        resumen.grados_creados++;
      }

      const usuarios = await getEnrolledUsers({ moodleUrl: colegio.moodle_url, token: colegio.moodle_token, courseId: curso.id });
      let alumnosEnCurso = 0, profesoresEnCurso = 0;

      for (const usuario of usuarios) {
        const roles = (usuario.roles || []).map(function (r) { return r.shortname; });
        const esProfesor = roles.includes('editingteacher') || roles.includes('teacher');
        const esAlumno = roles.includes('student');

        if (esAlumno) {
          const existentesResult = await pool.query('SELECT id FROM alumnos WHERE moodle_user_id = $1', [usuario.id]);
          if (existentesResult.rows.length === 0) {
            const nuevoAlumnoResult = await pool.query(
              'INSERT INTO alumnos (colegio_id, grado_id, nombre_completo, moodle_user_id, correo_encargado) VALUES ($1,$2,$3,$4,$5) RETURNING id',
              [colegio.id, grado.id, usuario.fullname, usuario.id, usuario.email || null]
            );
            await pool.query(
              'INSERT INTO matriculas (alumno_id, grado_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
              [nuevoAlumnoResult.rows[0].id, grado.id]
            );
            resumen.alumnos_creados++;
            alumnosEnCurso++;
          } else {
            await pool.query(
              'INSERT INTO matriculas (alumno_id, grado_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
              [existentesResult.rows[0].id, grado.id]
            );
          }
        }

        if (esProfesor) {
          const existentesResult = await pool.query('SELECT id FROM profesores WHERE moodle_user_id = $1', [usuario.id]);
          let profesorId;
          if (existentesResult.rows.length === 0) {
            const nuevoProfesorResult = await pool.query(
              'INSERT INTO profesores (colegio_id, nombre_completo, correo, fecha_ingreso, materias, moodle_user_id) VALUES ($1,$2,$3,CURRENT_DATE,$4,$5) RETURNING id',
              [colegio.id, usuario.fullname, usuario.email || null, [curso.fullname], usuario.id]
            );
            profesorId = nuevoProfesorResult.rows[0].id;
            resumen.profesores_creados++;
            profesoresEnCurso++;
          } else {
            profesorId = existentesResult.rows[0].id;
          }

          const asignacionExistente = await pool.query(
            'SELECT id FROM profesor_grado_materia WHERE profesor_id = $1 AND grado_id = $2',
            [profesorId, grado.id]
          );
          if (asignacionExistente.rows.length === 0) {
            await pool.query(
              'INSERT INTO profesor_grado_materia (profesor_id, grado_id, materia, moodle_course_id) VALUES ($1,$2,$3,$4)',
              [profesorId, grado.id, curso.fullname, curso.id]
            );
          }
        }
      }

      resumen.cursos_procesados.push({ curso: curso.fullname, alumnos: alumnosEnCurso, profesores: profesoresEnCurso });
    }

    res.json({ mensaje: 'Importación completada', resumen });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/fix-schema', async (req, res) => {
  try {
    await pool.query('ALTER TABLE grados ALTER COLUMN nombre TYPE VARCHAR(255)');
    await pool.query('ALTER TABLE profesor_grado_materia ALTER COLUMN materia TYPE VARCHAR(255)');
    res.json({ mensaje: 'Columnas ampliadas correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/migrar-matriculas', async (req, res) => {
  try {
    await pool.query(
      'CREATE TABLE IF NOT EXISTS matriculas (' +
      'id SERIAL PRIMARY KEY, ' +
      'alumno_id INT REFERENCES alumnos(id) ON DELETE CASCADE, ' +
      'grado_id INT REFERENCES grados(id) ON DELETE CASCADE, ' +
      'fecha_matricula DATE DEFAULT CURRENT_DATE, ' +
      'activa BOOLEAN DEFAULT TRUE, ' +
      'UNIQUE(alumno_id, grado_id)' +
      ');'
    );
    await pool.query(
      'INSERT INTO matriculas (alumno_id, grado_id) ' +
      'SELECT id, grado_id FROM alumnos WHERE grado_id IS NOT NULL ' +
      'ON CONFLICT (alumno_id, grado_id) DO NOTHING;'
    );
    res.json({ mensaje: 'Tabla matriculas creada y datos existentes migrados.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/crear-admin-inicial', async (req, res) => {
  try {
    const existentesResult = await pool.query('SELECT * FROM usuarios_admin');
    if (existentesResult.rows.length > 0) {
      return res.json({ mensaje: 'Ya existe al menos un usuario admin, no se creó otro.' });
    }

    const correo = req.query.correo;
    const password = req.query.password;
    const nombre = req.query.nombre || 'Administrador';

    if (!correo || !password) {
      return res.status(400).json({ error: 'Debes pasar ?correo=...&password=...&nombre=... en la URL' });
    }

    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO usuarios_admin (colegio_id, nombre, correo, password_hash, rol) VALUES ($1,$2,$3,$4,$5) RETURNING id, nombre, correo, rol',
      [1, nombre, correo, hash, 'admin']
    );

    res.json({ mensaje: 'Usuario admin creado', usuario: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

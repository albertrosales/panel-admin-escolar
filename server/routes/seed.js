const express = require('express');
const router = express.Router();
const pool = require('../db');
const fs = require('fs');
const path = require('path');

/**
 * ENDPOINT TEMPORAL — usar una sola vez para crear las tablas,
 * luego eliminar este archivo y su registro en server.js por seguridad.
 *
 * Visitar en el navegador: https://TU-BACKEND.onrender.com/api/seed/schema
 */
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

/**
 * ENDPOINT TEMPORAL — usar una sola vez para crear el colegio piloto,
 * luego eliminar este archivo y su registro en server.js por seguridad.
 *
 * Visitar en el navegador: https://TU-BACKEND.onrender.com/api/seed/colegio
 */
router.get('/colegio', async (req, res) => {
  try {
    const { rows: existentes } = await pool.query('SELECT * FROM colegios');
    if (existentes.length > 0) {
      return res.json({ mensaje: 'Ya existe al menos un colegio, no se creó otro.', colegios: existentes });
    }

    const { rows: [colegio] } = await pool.query(
      `INSERT INTO colegios (nombre, moodle_url, moodle_token) VALUES ($1,$2,$3) RETURNING *`,
      ['Ulua Campus - Piloto', 'https://edu.uluamedia.com', process.env.MOODLE_TOKEN_PILOTO]
    );
    res.json({ mensaje: 'Colegio creado', colegio });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * ENDPOINT TEMPORAL — corrige el token del colegio piloto si quedó mal copiado.
 * Visitar en el navegador: https://TU-BACKEND.onrender.com/api/seed/corregir-token
 */
router.get('/corregir-token', async (req, res) => {
  try {
    const { rows: [colegio] } = await pool.query(
      `UPDATE colegios SET moodle_token = $1 WHERE id = 1 RETURNING *`,
      [process.env.MOODLE_TOKEN_PILOTO]
    );
    res.json({ mensaje: 'Token actualizado', colegio });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const { getCourses, getEnrolledUsers } = require('../services/moodleService');

/**
 * ENDPOINT TEMPORAL — importa cursos, alumnos y profesores ya existentes
 * en Moodle hacia la base de datos del panel.
 *
 * Visitar en el navegador: https://TU-BACKEND.onrender.com/api/seed/importar-moodle
 */
router.get('/importar-moodle', async (req, res) => {
  try {
    const { rows: [colegio] } = await pool.query('SELECT * FROM colegios WHERE id = 1');
    if (!colegio) return res.status(400).json({ error: 'No existe el colegio piloto (id=1)' });

    const cursos = await getCourses({ moodleUrl: colegio.moodle_url, token: colegio.moodle_token });

    const resumen = { grados_creados: 0, alumnos_creados: 0, profesores_creados: 0, cursos_procesados: [] };

    for (const curso of cursos) {
      // Crear o reutilizar el "grado" (mapeado 1:1 con el curso de Moodle)
      let { rows: [grado] } = await pool.query(
        'SELECT * FROM grados WHERE colegio_id = $1 AND moodle_category_id = $2',
        [colegio.id, curso.id]
      );
      if (!grado) {
        const { rows: [nuevoGrado] } = await pool.query(
          'INSERT INTO grados (colegio_id, nombre, moodle_category_id) VALUES ($1,$2,$3) RETURNING *',
          [colegio.id, curso.fullname, curso.id]
        );
        grado = nuevoGrado;
        resumen.grados_creados++;
      }

      const usuarios = await getEnrolledUsers({ moodleUrl: colegio.moodle_url, token: colegio.moodle_token, courseId: curso.id });
      let alumnosEnCurso = 0, profesoresEnCurso = 0;

      for (const usuario of usuarios) {
        const roles = (usuario.roles || []).map(r => r.shortname);
        const esProfesor = roles.includes('editingteacher') || roles.includes('teacher');
        const esAlumno = roles.includes('student');

        if (esAlumno) {
          const { rows: existentes } = await pool.query(
            'SELECT id FROM alumnos WHERE moodle_user_id = $1', [usuario.id]
          );
          if (existentes.length === 0) {
            await pool.query(
              `INSERT INTO alumnos (colegio_id, grado_id, nombre_completo, moodle_user_id, correo_encargado)
               VALUES ($1,$2,$3,$4,$5)`,
              [colegio.id, grado.id, usuario.fullname, usuario.id, usuario.email || null]
            );
            resumen.alumnos_creados++;
            alumnosEnCurso++;
          }
        }

        if (esProfesor) {
          const { rows: existentes } = await pool.query(
            'SELECT id FROM profesores WHERE moodle_user_id = $1', [usuario.id]
          );
          if (existentes.length === 0) {
            await pool.query(
              `INSERT INTO profesores (colegio_id, nombre_completo, correo, fecha_ingreso, materias, moodle_user_id)
               VALUES ($1,$2,$3,CURRENT_DATE,$4,$5)`,
              [colegio.id, usuario.fullname, usuario.email || null, [curso.fullname], usuario.id]
            );
            resumen.profesores_creados++;
            profesoresEnCurso++;
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

/**
 * ENDPOINT TEMPORAL — amplía columnas que resultaron muy cortas para nombres reales de Moodle.
 * Visitar en el navegador: https://TU-BACKEND.onrender.com/api/seed/fix-schema
 */
router.get('/fix-schema', async (req, res) => {
  try {
    await pool.query('ALTER TABLE grados ALTER COLUMN nombre TYPE VARCHAR(255)');
    await pool.query('ALTER TABLE profesor_grado_materia ALTER COLUMN materia TYPE VARCHAR(255)');
    res.json({ mensaje: 'Columnas ampliadas correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

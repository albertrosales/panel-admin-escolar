const express = require('express');
const router = express.Router();
const pool = require('../db');
const { getOrCreateUser, enrolUser, TEACHER_ROLE_ID } = require('../services/moodleService');

router.get('/', async (req, res) => {
  const colegio_id = req.query.colegio_id;
  const result = await pool.query(
    'SELECT * FROM profesores WHERE colegio_id = $1 ORDER BY nombre_completo',
    [colegio_id]
  );
  res.json(result.rows);
});

router.get('/:id', async (req, res) => {
  const id = req.params.id;
  const profesorResult = await pool.query('SELECT * FROM profesores WHERE id = $1', [id]);
  const profesor = profesorResult.rows[0];
  if (!profesor) return res.status(404).json({ error: 'Profesor no encontrado' });

  const asignacionesResult = await pool.query(
    'SELECT pgm.*, g.nombre AS grado_nombre FROM profesor_grado_materia pgm JOIN grados g ON g.id = pgm.grado_id WHERE pgm.profesor_id = $1',
    [id]
  );
  const resenasResult = await pool.query(
    'SELECT * FROM profesor_resenas WHERE profesor_id = $1 ORDER BY fecha DESC', [id]
  );

  const antiguedadAnios = ((new Date() - new Date(profesor.fecha_ingreso)) / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1);

  res.json(Object.assign({}, profesor, {
    antiguedad_anios: Number(antiguedadAnios),
    asignaciones: asignacionesResult.rows,
    resenas: resenasResult.rows
  }));
});

router.post('/', async (req, res) => {
  const colegio_id = req.body.colegio_id;
  const nombre_completo = req.body.nombre_completo;
  const correo = req.body.correo;
  const telefono = req.body.telefono;
  const fecha_ingreso = req.body.fecha_ingreso;
  const asignaciones = req.body.asignaciones || [];

  if (!colegio_id || !nombre_completo || !fecha_ingreso) {
    return res.status(400).json({ error: 'colegio_id, nombre_completo y fecha_ingreso son requeridos' });
  }

  const colegioResult = await pool.query('SELECT * FROM colegios WHERE id = $1', [colegio_id]);
  const colegio = colegioResult.rows[0];
  if (!colegio) return res.status(400).json({ error: 'Colegio no encontrado' });

  let moodleInfo = null;
  if (correo) {
    try {
      moodleInfo = await getOrCreateUser({
        moodleUrl: colegio.moodle_url, token: colegio.moodle_token,
        nombreCompleto: nombre_completo, email: correo
      });
    } catch (err) {
      return res.status(502).json({ error: 'Error creando usuario en Moodle: ' + err.message });
    }
  }

  const materias = asignaciones.map(function (a) { return a.materia; });
  const profesorResult = await pool.query(
    'INSERT INTO profesores (colegio_id, nombre_completo, correo, telefono, fecha_ingreso, materias, moodle_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [colegio_id, nombre_completo, correo, telefono, fecha_ingreso, materias, moodleInfo ? moodleInfo.id : null]
  );
  const profesor = profesorResult.rows[0];

  const erroresAsignacion = [];
  for (const asignacion of asignaciones) {
    const gradoResult = await pool.query('SELECT * FROM grados WHERE id = $1', [asignacion.grado_id]);
    const grado = gradoResult.rows[0];
    if (!grado) continue;

    await pool.query(
      'INSERT INTO profesor_grado_materia (profesor_id, grado_id, materia, moodle_course_id) VALUES ($1,$2,$3,$4)',
      [profesor.id, grado.id, asignacion.materia, grado.moodle_category_id]
    );

    if (moodleInfo && moodleInfo.id && grado.moodle_category_id) {
      try {
        await enrolUser({
          moodleUrl: colegio.moodle_url, token: colegio.moodle_token,
          userId: moodleInfo.id, courseId: grado.moodle_category_id, roleId: TEACHER_ROLE_ID
        });
      } catch (err) {
        erroresAsignacion.push({ grado: grado.nombre, error: err.message });
      }
    }
  }

  res.status(201).json({ profesor: profesor, moodle: moodleInfo, erroresAsignacion: erroresAsignacion });
});

router.post('/:id/resenas', async (req, res) => {
  const id = req.params.id;
  const autor = req.body.autor;
  const comentario = req.body.comentario;
  const resenaResult = await pool.query(
    'INSERT INTO profesor_resenas (profesor_id, autor, comentario) VALUES ($1,$2,$3) RETURNING *',
    [id, autor, comentario]
  );
  res.status(201).json(resenaResult.rows[0]);
});

module.exports = router;

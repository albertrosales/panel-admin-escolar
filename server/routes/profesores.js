const express = require('express');
const router = express.Router();
const pool = require('../db');
const { getOrCreateUser, enrolUser, TEACHER_ROLE_ID } = require('../services/moodleService');

// Toda ruta con :id verifica que el profesor sea del colegio de quien pide
router.param('id', async (req, res, next, id) => {
  try {
    if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'ID de profesor inválido' });
    const r = await pool.query('SELECT colegio_id FROM profesores WHERE id = $1', [id]);
    if (!r.rows[0] || Number(r.rows[0].colegio_id) !== req.colegioId) {
      return res.status(404).json({ error: 'Profesor no encontrado' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const incluirInactivos = req.query.incluir_inactivos === 'true';
    const condicion = incluirInactivos ? 'colegio_id = $1' : 'colegio_id = $1 AND activo = true';
    const result = await pool.query(
      `SELECT * FROM profesores WHERE ${condicion} ORDER BY nombre_completo`,
      [req.colegioId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const profesorResult = await pool.query('SELECT * FROM profesores WHERE id = $1', [id]);
    const profesor = profesorResult.rows[0];

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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const b = req.body;
    const colegioId = req.colegioId;
    if (!b.nombre_completo || !b.fecha_ingreso) {
      return res.status(400).json({ error: 'nombre_completo y fecha_ingreso son requeridos' });
    }

    const colegioResult = await pool.query('SELECT * FROM colegios WHERE id = $1', [colegioId]);
    const colegio = colegioResult.rows[0];
    if (!colegio) return res.status(400).json({ error: 'Colegio no encontrado' });

    let moodleInfo = null;
    if (b.correo) {
      try {
        moodleInfo = await getOrCreateUser({
          moodleUrl: colegio.moodle_url, token: colegio.moodle_token,
          nombreCompleto: b.nombre_completo, email: b.correo
        });
      } catch (err) {
        return res.status(502).json({ error: 'Error creando usuario en Moodle: ' + err.message });
      }
    }

    const asignaciones = b.asignaciones || [];
    const materias = asignaciones.map(a => a.materia);
    const profesorResult = await pool.query(
      `INSERT INTO profesores (
        colegio_id, nombre_completo, correo, telefono, fecha_ingreso, materias, moodle_user_id,
        direccion, fecha_nacimiento, identidad, foto_url, es_extranjero
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        colegioId, b.nombre_completo, b.correo, b.telefono, b.fecha_ingreso, materias,
        moodleInfo ? moodleInfo.id : null, b.direccion || null, b.fecha_nacimiento || null,
        b.identidad || null, b.foto_url || null, !!b.es_extranjero
      ]
    );
    const profesor = profesorResult.rows[0];

    const erroresAsignacion = [];
    for (const asignacion of asignaciones) {
      const gradoResult = await pool.query(
        'SELECT * FROM grados WHERE id = $1 AND colegio_id = $2',
        [asignacion.grado_id, colegioId]
      );
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

    res.status(201).json({ profesor, moodle: moodleInfo, erroresAsignacion });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const campos = ['nombre_completo', 'correo', 'telefono', 'direccion', 'fecha_nacimiento',
      'identidad', 'foto_url', 'es_extranjero'];
    const sets = [];
    const params = [];
    for (const campo of campos) {
      if (req.body[campo] !== undefined) {
        params.push(req.body[campo] === '' ? null : req.body[campo]);
        sets.push(campo + ' = $' + params.length);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    params.push(id);

    const result = await pool.query(
      `UPDATE profesores SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/dar-de-baja', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE profesores SET activo = false, fecha_baja = CURRENT_DATE, motivo_baja = $1 WHERE id = $2 RETURNING *`,
      [req.body.motivo || null, req.params.id]
    );
    res.json({ profesor: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/reactivar', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE profesores SET activo = true, fecha_baja = NULL, motivo_baja = NULL WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json({ profesor: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/resenas', async (req, res) => {
  try {
    const resenaResult = await pool.query(
      `INSERT INTO profesor_resenas (profesor_id, autor, comentario) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, req.body.autor, req.body.comentario]
    );
    res.status(201).json(resenaResult.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { evaluarEstadoAlumno } = require('../services/estadoPagoService');
const { getOrCreateUser, enrolUser, STUDENT_ROLE_ID } = require('../services/moodleService');

router.get('/', async (req, res) => {
  try {
    const colegio_id = req.query.colegio_id;
    const estado_pago = req.query.estado_pago;
    const grado_id = req.query.grado_id;

    const conditions = ['a.colegio_id = $1'];
    const params = [colegio_id];
    let join = '';

    if (estado_pago) {
      params.push(estado_pago);
      conditions.push('a.estado_pago = $' + params.length);
    }
    if (grado_id) {
      join = 'JOIN matriculas m ON m.alumno_id = a.id';
      params.push(grado_id);
      conditions.push('m.grado_id = $' + params.length);
    }

    const result = await pool.query(
      'SELECT DISTINCT a.* FROM alumnos a ' + join + ' WHERE ' + conditions.join(' AND ') + ' ORDER BY a.nombre_completo',
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }

    const alumnoResult = await pool.query('SELECT * FROM alumnos WHERE id = $1', [id]);
    const alumno = alumnoResult.rows[0];
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    const historialResult = await pool.query(
      'SELECT * FROM alumno_historial WHERE alumno_id = $1 ORDER BY fecha DESC', [id]
    );
    const pagosResult = await pool.query(
      'SELECT * FROM pagos WHERE alumno_id = $1 ORDER BY fecha_vencimiento DESC', [id]
    );
    const clasesResult = await pool.query(
      'SELECT g.id, g.nombre, m.activa, m.fecha_matricula FROM matriculas m JOIN grados g ON g.id = m.grado_id WHERE m.alumno_id = $1 ORDER BY g.nombre',
      [id]
    );

    res.json(Object.assign({}, alumno, {
      historial: historialResult.rows,
      pagos: pagosResult.rows,
      clases: clasesResult.rows
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const colegio_id = req.body.colegio_id;
    const nombre_completo = req.body.nombre_completo;
    const nombre_encargado = req.body.nombre_encargado;
    const telefono_encargado = req.body.telefono_encargado;
    const correo_encargado = req.body.correo_encargado;
    const correo_alumno = req.body.correo_alumno;
    const gradoIds = req.body.grados || [];

    if (!colegio_id || !nombre_completo) {
      return res.status(400).json({ error: 'colegio_id y nombre_completo son requeridos' });
    }

    const colegioResult = await pool.query('SELECT * FROM colegios WHERE id = $1', [colegio_id]);
    const colegio = colegioResult.rows[0];
    if (!colegio) return res.status(400).json({ error: 'Colegio no encontrado' });

    let moodleInfo = null;
    const correoParaMoodle = correo_alumno || correo_encargado;

    if (correoParaMoodle) {
      try {
        moodleInfo = await getOrCreateUser({
          moodleUrl: colegio.moodle_url,
          token: colegio.moodle_token,
          nombreCompleto: nombre_completo,
          email: correoParaMoodle
        });
      } catch (err) {
        return res.status(502).json({ error: 'Error creando usuario en Moodle: ' + err.message });
      }
    }

    let grados = [];
    if (gradoIds.length) {
      const gradosResult = await pool.query(
        'SELECT * FROM grados WHERE id = ANY($1) AND colegio_id = $2',
        [gradoIds, colegio_id]
      );
      grados = gradosResult.rows;
    }

    const alumnoResult = await pool.query(
      'INSERT INTO alumnos (colegio_id, grado_id, nombre_completo, nombre_encargado, telefono_encargado, correo_encargado, moodle_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [colegio_id, grados[0] ? grados[0].id : null, nombre_completo, nombre_encargado, telefono_encargado, correo_encargado, moodleInfo ? moodleInfo.id : null]
    );
    const alumno = alumnoResult.rows[0];

    const erroresMatricula = [];
    for (const grado of grados) {
      await pool.query(
        'INSERT INTO matriculas (alumno_id, grado_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [alumno.id, grado.id]
      );
      if (moodleInfo && moodleInfo.id && grado.moodle_category_id) {
        try {
          await enrolUser({
            moodleUrl: colegio.moodle_url, token: colegio.moodle_token,
            userId: moodleInfo.id, courseId: grado.moodle_category_id, roleId: STUDENT_ROLE_ID
          });
        } catch (err) {
          erroresMatricula.push({ grado: grado.nombre, error: err.message });
        }
      }
    }

    await pool.query(
      "INSERT INTO alumno_historial (alumno_id, tipo, descripcion) VALUES ($1, 'matricula', $2)",
      [alumno.id, 'Alumno matriculado en ' + grados.length + ' clase(s)']
    );

    res.status(201).json({
      alumno: alumno,
      moodle: moodleInfo,
      clasesMatriculadas: grados.map(function (g) { return g.nombre; }),
      erroresMatricula: erroresMatricula
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/matricular', async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: 'ID de alumno inválido' });
    }
    const gradoIds = req.body.grados || [];

    const alumnoResult = await pool.query('SELECT * FROM alumnos WHERE id = $1', [id]);
    const alumno = alumnoResult.rows[0];
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    const colegioResult = await pool.query('SELECT * FROM colegios WHERE id = $1', [alumno.colegio_id]);
    const colegio = colegioResult.rows[0];
    const gradosResult = await pool.query('SELECT * FROM grados WHERE id = ANY($1)', [gradoIds]);
    const grados = gradosResult.rows;

    const erroresMatricula = [];
    for (const grado of grados) {
      await pool.query(
        'INSERT INTO matriculas (alumno_id, grado_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [alumno.id, grado.id]
      );
      if (alumno.moodle_user_id && grado.moodle_category_id) {
        try {
          await enrolUser({
            moodleUrl: colegio.moodle_url, token: colegio.moodle_token,
            userId: alumno.moodle_user_id, courseId: grado.moodle_category_id, roleId: STUDENT_ROLE_ID
          });
        } catch (err) {
          erroresMatricula.push({ grado: grado.nombre, error: err.message });
        }
      }
    }

    res.json({
      mensaje: 'Matrícula actualizada',
      clasesAgregadas: grados.map(function (g) { return g.nombre; }),
      erroresMatricula: erroresMatricula
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/evaluar-estado', async (req, res) => {
  try {
    const resultado = await evaluarEstadoAlumno(req.params.id);
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

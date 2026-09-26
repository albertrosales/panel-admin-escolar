const express = require('express');
const router = express.Router();
const pool = require('../db');
const { evaluarEstadoAlumno } = require('../services/estadoPagoService');
const { getOrCreateUser, enrolUser, setEnrolmentSuspension, STUDENT_ROLE_ID } = require('../services/moodleService');

router.get('/', async (req, res) => {
  try {
    const colegio_id = req.query.colegio_id;
    const estado_pago = req.query.estado_pago;
    const grado_id = req.query.grado_id;
    const incluirInactivos = req.query.incluir_inactivos === 'true';

    const conditions = ['a.colegio_id = $1'];
    const params = [colegio_id];
    let join = '';

    if (!incluirInactivos) conditions.push('a.activo = true');
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
    const b = req.body;
    if (!b.colegio_id || !b.nombre_completo) {
      return res.status(400).json({ error: 'colegio_id y nombre_completo son requeridos' });
    }

    const colegioResult = await pool.query('SELECT * FROM colegios WHERE id = $1', [b.colegio_id]);
    const colegio = colegioResult.rows[0];
    if (!colegio) return res.status(400).json({ error: 'Colegio no encontrado' });

    let moodleInfo = null;
    const correoParaMoodle = b.correo_alumno || b.correo_encargado;
    if (correoParaMoodle) {
      try {
        moodleInfo = await getOrCreateUser({
          moodleUrl: colegio.moodle_url, token: colegio.moodle_token,
          nombreCompleto: b.nombre_completo, email: correoParaMoodle
        });
      } catch (err) {
        return res.status(502).json({ error: 'Error creando usuario en Moodle: ' + err.message });
      }
    }

    let grados = [];
    const gradoIds = b.grados || [];
    if (gradoIds.length) {
      const gradosResult = await pool.query(
        'SELECT * FROM grados WHERE id = ANY($1) AND colegio_id = $2',
        [gradoIds, b.colegio_id]
      );
      grados = gradosResult.rows;
    }

    const alumnoResult = await pool.query(
      `INSERT INTO alumnos (
        colegio_id, grado_id, nombre_completo, nombre_encargado, telefono_encargado, correo_encargado,
        telefono, direccion, fecha_nacimiento, identidad, foto_url, es_extranjero, moodle_user_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        b.colegio_id, grados[0] ? grados[0].id : null, b.nombre_completo, b.nombre_encargado,
        b.telefono_encargado, b.correo_encargado, b.telefono || null, b.direccion || null,
        b.fecha_nacimiento || null, b.identidad || null, b.foto_url || null,
        !!b.es_extranjero, moodleInfo ? moodleInfo.id : null
      ]
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
      alumno, moodle: moodleInfo,
      clasesMatriculadas: grados.map(g => g.nombre),
      erroresMatricula
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Editar datos de perfil (no toca matrícula ni Moodle)
router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const campos = ['nombre_completo', 'nombre_encargado', 'telefono_encargado', 'correo_encargado',
      'telefono', 'direccion', 'fecha_nacimiento', 'identidad', 'foto_url', 'es_extranjero'];
    const sets = [];
    const params = [];
    for (const campo of campos) {
      if (req.body[campo] !== undefined) {
        params.push(req.body[campo]);
        sets.push(campo + ' = $' + params.length);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    params.push(id);

    const result = await pool.query(
      `UPDATE alumnos SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Alumno no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/dar-de-baja', async (req, res) => {
  try {
    const id = req.params.id;
    const motivo = req.body.motivo || null;

    const alumnoResult = await pool.query('SELECT * FROM alumnos WHERE id = $1', [id]);
    const alumno = alumnoResult.rows[0];
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    const result = await pool.query(
      `UPDATE alumnos SET activo = false, fecha_baja = CURRENT_DATE, motivo_baja = $1 WHERE id = $2 RETURNING *`,
      [motivo, id]
    );

    if (alumno.moodle_user_id) {
      const colegioResult = await pool.query('SELECT * FROM colegios WHERE id = $1', [alumno.colegio_id]);
      const colegio = colegioResult.rows[0];
      try {
        await setEnrolmentSuspension({
          moodleUrl: colegio.moodle_url, token: colegio.moodle_token,
          moodleUserId: alumno.moodle_user_id, suspend: true
        });
      } catch (err) {
        // no bloqueamos la baja si Moodle falla, solo avisamos
        return res.json({ alumno: result.rows[0], avisoMoodle: 'No se pudo suspender en Moodle: ' + err.message });
      }
    }

    await pool.query(
      "INSERT INTO alumno_historial (alumno_id, tipo, descripcion) VALUES ($1, 'cambio_estado', $2)",
      [id, 'Alumno dado de baja' + (motivo ? ': ' + motivo : '')]
    );

    res.json({ alumno: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/reactivar', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await pool.query(
      `UPDATE alumnos SET activo = true, fecha_baja = NULL, motivo_baja = NULL WHERE id = $1 RETURNING *`,
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Alumno no encontrado' });
    res.json({ alumno: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/matricular', async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'ID de alumno inválido' });
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

    res.json({ mensaje: 'Matrícula actualizada', clasesAgregadas: grados.map(g => g.nombre), erroresMatricula });
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

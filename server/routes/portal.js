const express = require('express');
const router = express.Router();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { buildClient } = require('../services/moodleService');
const requirePortal = require('../middleware/portalAuth');

async function pedirTokenMoodle(moodleUrl, username, password) {
  const url = moodleUrl.replace(/\/$/, '') + '/login/token.php';
  const body = new URLSearchParams({ username: username, password: password, service: 'moodle_mobile_app' });
  const res = await axios.post(url, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  if (!res.data || !res.data.token) {
    const err = new Error((res.data && res.data.error) || 'No se pudo iniciar sesión');
    err.code = res.data && res.data.errorcode;
    throw err;
  }
  return res.data.token;
}

// Login: valida usuario/clave contra Moodle y emite un token del portal
router.post('/login', async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';
    const colegioId = req.body.colegio_id || 1;

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }

    const colegioResult = await pool.query('SELECT * FROM colegios WHERE id = $1 AND activo = true', [colegioId]);
    const colegio = colegioResult.rows[0];
    if (!colegio) return res.status(400).json({ error: 'Colegio no encontrado' });

    let userToken;
    try {
      userToken = await pedirTokenMoodle(colegio.moodle_url, username, password);
    } catch (err) {
      if (err.code === 'invalidlogin') {
        return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
      }
      return res.status(502).json({
        error: 'Moodle no permitió el inicio de sesión (' + (err.code || err.message) + '). Verifica que el servicio móvil esté habilitado en Moodle.'
      });
    }

    const call = buildClient(colegio.moodle_url, userToken);
    const info = await call('core_webservice_get_site_info');
    const moodleUserId = info.userid;

    let tipo = null;
    let persona = null;

    const profResult = await pool.query(
      'SELECT id, nombre_completo, activo FROM profesores WHERE moodle_user_id = $1 AND colegio_id = $2',
      [moodleUserId, colegio.id]
    );
    if (profResult.rows[0]) {
      tipo = 'profesor';
      persona = profResult.rows[0];
    } else {
      const alumnoResult = await pool.query(
        'SELECT id, nombre_completo, activo FROM alumnos WHERE moodle_user_id = $1 AND colegio_id = $2',
        [moodleUserId, colegio.id]
      );
      if (alumnoResult.rows[0]) {
        tipo = 'alumno';
        persona = alumnoResult.rows[0];
      }
    }

    if (!persona) {
      return res.status(403).json({ error: 'Tu cuenta de Moodle no está registrada en el panel del colegio.' });
    }
    if (!persona.activo) {
      return res.status(403).json({ error: 'Tu cuenta está inactiva. Comunícate con la administración.' });
    }

    const token = jwt.sign(
      {
        tipo: tipo,
        id: persona.id,
        colegio_id: colegio.id,
        moodle_user_id: moodleUserId,
        moodle_token: userToken
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token: token, usuario: { tipo: tipo, nombre: persona.nombre_completo } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Datos propios del alumno o profesor autenticado
router.get('/me', requirePortal, async (req, res) => {
  try {
    const u = req.portal;

    if (u.tipo === 'alumno') {
      const alumnoResult = await pool.query(
        'SELECT nombre_completo, estado_pago, fecha_matricula, telefono, direccion FROM alumnos WHERE id = $1',
        [u.id]
      );
      const alumno = alumnoResult.rows[0];
      if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

      const clasesResult = await pool.query(
        'SELECT g.id, g.nombre, g.moodle_category_id FROM matriculas m JOIN grados g ON g.id = m.grado_id WHERE m.alumno_id = $1 ORDER BY g.nombre',
        [u.id]
      );
      const pagosResult = await pool.query(
        'SELECT periodo, monto, fecha_vencimiento, pagado, fecha_pago FROM pagos WHERE alumno_id = $1 ORDER BY fecha_vencimiento DESC',
        [u.id]
      );

      let notas = null;
      try {
        const colegioResult = await pool.query('SELECT moodle_url FROM colegios WHERE id = $1', [u.colegio_id]);
        const call = buildClient(colegioResult.rows[0].moodle_url, u.moodle_token);
        const r = await call('gradereport_overview_get_course_grades', { userid: u.moodle_user_id });
        const nombres = {};
        clasesResult.rows.forEach(function (c) {
          if (c.moodle_category_id) nombres[c.moodle_category_id] = c.nombre;
        });
        notas = (r.grades || []).map(function (g) {
          return { clase: nombres[g.courseid] || ('Curso ' + g.courseid), nota: g.grade };
        });
      } catch (e) {
        notas = null;
      }

      return res.json({
        tipo: 'alumno',
        perfil: alumno,
        clases: clasesResult.rows.map(function (c) { return { id: c.id, nombre: c.nombre }; }),
        pagos: pagosResult.rows,
        notas: notas
      });
    }

    // Profesor
    const profResult = await pool.query(
      'SELECT nombre_completo, correo, telefono, fecha_ingreso FROM profesores WHERE id = $1',
      [u.id]
    );
    const profesor = profResult.rows[0];
    if (!profesor) return res.status(404).json({ error: 'Profesor no encontrado' });

    const asigResult = await pool.query(
      'SELECT pgm.grado_id, pgm.materia, g.nombre AS grado_nombre FROM profesor_grado_materia pgm JOIN grados g ON g.id = pgm.grado_id WHERE pgm.profesor_id = $1 ORDER BY g.nombre',
      [u.id]
    );

    const asignaciones = [];
    for (const a of asigResult.rows) {
      const alumnosResult = await pool.query(
        'SELECT a.id, a.nombre_completo FROM matriculas m JOIN alumnos a ON a.id = m.alumno_id WHERE m.grado_id = $1 AND a.activo = true ORDER BY a.nombre_completo',
        [a.grado_id]
      );
      asignaciones.push({ grado_nombre: a.grado_nombre, materia: a.materia, alumnos: alumnosResult.rows });
    }

    const antiguedad = ((new Date() - new Date(profesor.fecha_ingreso)) / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1);

    res.json({
      tipo: 'profesor',
      perfil: Object.assign({}, profesor, { antiguedad_anios: Number(antiguedad) }),
      asignaciones: asignaciones
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

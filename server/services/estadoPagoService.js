const pool = require('../db');
const { setEnrolmentSuspension } = require('./moodleService');

/**
 * Revisa el estado de un alumno y lo actualiza + sincroniza con Moodle.
 * Reglas:
 *  - Tiene un plan de pago activo con cuotas al día -> 'plan_pago' (acceso habilitado, amarillo)
 *  - Sin pagos vencidos -> 'al_dia' (acceso habilitado)
 *  - Con pago vencido y sin plan de pago activo -> 'moroso' (acceso bloqueado)
 */
async function evaluarEstadoAlumno(alumnoId) {
  const { rows: [alumno] } = await pool.query(
    'SELECT a.*, c.moodle_url, c.moodle_token FROM alumnos a JOIN colegios c ON c.id = a.colegio_id WHERE a.id = $1',
    [alumnoId]
  );
  if (!alumno) throw new Error('Alumno no encontrado');

  const { rows: pagosVencidos } = await pool.query(
    `SELECT * FROM pagos WHERE alumno_id = $1 AND pagado = FALSE AND fecha_vencimiento < CURRENT_DATE`,
    [alumnoId]
  );

  const { rows: [planActivo] } = await pool.query(
    `SELECT * FROM planes_pago WHERE alumno_id = $1 AND activo = TRUE
     ORDER BY creado_en DESC LIMIT 1`,
    [alumnoId]
  );

  let nuevoEstado;
  if (planActivo) {
    nuevoEstado = 'plan_pago';
  } else if (pagosVencidos.length > 0) {
    nuevoEstado = 'moroso';
  } else {
    nuevoEstado = 'al_dia';
  }

  const estadoCambio = nuevoEstado !== alumno.estado_pago;

  if (estadoCambio) {
    await pool.query('UPDATE alumnos SET estado_pago = $1 WHERE id = $2', [nuevoEstado, alumnoId]);

    // Sincronizar con Moodle: solo 'moroso' bloquea el acceso
    if (alumno.moodle_user_id) {
      const suspend = nuevoEstado === 'moroso';
      await setEnrolmentSuspension({
        moodleUrl: alumno.moodle_url,
        token: alumno.moodle_token,
        moodleUserId: alumno.moodle_user_id,
        suspend
      });

      await pool.query(
        `INSERT INTO alumno_historial (alumno_id, tipo, descripcion, metadata)
         VALUES ($1, $2, $3, $4)`,
        [
          alumnoId,
          suspend ? 'suspension_moodle' : 'activacion_moodle',
          `Estado de pago cambió a "${nuevoEstado}" — acceso Moodle ${suspend ? 'bloqueado' : 'activo'}`,
          JSON.stringify({ estadoAnterior: alumno.estado_pago, estadoNuevo: nuevoEstado })
        ]
      );
    }
  }

  return { alumnoId, estadoAnterior: alumno.estado_pago, estadoNuevo: nuevoEstado, cambio: estadoCambio };
}

/**
 * Job diario: revisa a todos los alumnos activos.
 * Se ejecuta con un cron (ver server/jobs/revisarPagos.js).
 */
async function evaluarTodosLosAlumnos() {
  const { rows: alumnos } = await pool.query('SELECT id FROM alumnos WHERE activo = TRUE');
  const resultados = [];
  for (const a of alumnos) {
    try {
      resultados.push(await evaluarEstadoAlumno(a.id));
    } catch (err) {
      resultados.push({ alumnoId: a.id, error: err.message });
    }
  }
  return resultados;
}

module.exports = { evaluarEstadoAlumno, evaluarTodosLosAlumnos };

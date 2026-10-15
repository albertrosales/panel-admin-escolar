const pool = require('../db');
const { setEnrolmentSuspension } = require('./moodleService');

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

async function aplicarRecargos() {
  const { rows } = await pool.query(
    `SELECT p.id, p.monto, p.alumno_id, c.mora_tipo, c.mora_valor FROM pagos p
     JOIN alumnos a ON a.id = p.alumno_id JOIN colegios c ON c.id = a.colegio_id
     WHERE p.pagado = FALSE AND COALESCE(p.recargo,0) = 0 AND COALESCE(c.mora_valor,0) > 0
       AND p.fecha_vencimiento + COALESCE(c.mora_dias_gracia,0) < CURRENT_DATE`
  );
  for (const p of rows) {
    const r = p.mora_tipo === 'fijo' ? Number(p.mora_valor) : Math.round(Number(p.monto) * Number(p.mora_valor)) / 100;
    if (r <= 0) continue;
    await pool.query('UPDATE pagos SET recargo = $1 WHERE id = $2', [r, p.id]);
    await pool.query(
      `INSERT INTO alumno_historial (alumno_id, tipo, descripcion, metadata) VALUES ($1,'pago',$2,$3)`,
      [p.alumno_id, `Recargo por mora aplicado: L. ${r.toFixed(2)}`, JSON.stringify({ recargo: r, pago_id: p.id })]
    );
  }
  return rows.length;
}

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

/**
 * Genera el cobro del mes actual para cada alumno activo que tenga
 * monto_mensualidad definido, si todavía no existe un pago para ese periodo.
 * El vencimiento se calcula según el día de pago fijo del colegio (dia_pago_mensual).
 */
async function generarCobrosMensuales() {
  const { rows: colegios } = await pool.query('SELECT * FROM colegios WHERE activo = TRUE');
  const hoy = new Date();
  const periodo = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0');
  const generados = [];

  for (const colegio of colegios) {
    const diaPago = colegio.dia_pago_mensual || 5;

    const { rows: alumnos } = await pool.query(
      `SELECT * FROM alumnos WHERE colegio_id = $1 AND activo = TRUE AND monto_mensualidad IS NOT NULL`,
      [colegio.id]
    );

    for (const alumno of alumnos) {
      const { rows: existentes } = await pool.query(
        `SELECT id FROM pagos WHERE alumno_id = $1 AND periodo = $2`,
        [alumno.id, periodo]
      );
      if (existentes.length > 0) continue;

      const ultimoDiaMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
      const diaVencimiento = Math.min(diaPago, ultimoDiaMes);
      const fechaVencimiento = new Date(hoy.getFullYear(), hoy.getMonth(), diaVencimiento);

      const pct = Math.min(100, Number(alumno.descuento_pct || 0) + Number(alumno.beca_pct || 0));
      const descuento = Math.round(Number(alumno.monto_mensualidad) * pct) / 100;
      const montoNeto = Number(alumno.monto_mensualidad) - descuento;
      const { rows: [pago] } = await pool.query(
        `INSERT INTO pagos (alumno_id, periodo, monto, fecha_vencimiento) VALUES ($1,$2,$3,$4) RETURNING *`,
        [alumno.id, periodo, montoNeto, fechaVencimiento]
      );
      if (descuento > 0) await pool.query('UPDATE pagos SET descuento_aplicado = $1 WHERE id = $2', [descuento, pago.id]);

      await pool.query(
        `INSERT INTO alumno_historial (alumno_id, tipo, descripcion, metadata) VALUES ($1,'pago',$2,$3)`,
        [alumno.id, `Cobro de mensualidad generado para ${periodo}`, JSON.stringify({ monto: montoNeto, pago_id: pago.id })]
      );

      generados.push(pago);
    }
  }

  return generados;
}

module.exports = { aplicarRecargos, evaluarEstadoAlumno, evaluarTodosLosAlumnos, generarCobrosMensuales };

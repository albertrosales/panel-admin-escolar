/**
 * Job diario:
 *  1. Genera el cobro del mes actual para alumnos con mensualidad configurada
 *     (si todavía no existe ese cobro).
 *  2. Evalúa el estado de pago de todos los alumnos activos y sincroniza
 *     el bloqueo/desbloqueo de acceso en Moodle.
 *
 * Ejecutar con node-cron desde server.js, o como cron job externo:
 *   node server/jobs/revisarPagos.js
 */
const { evaluarTodosLosAlumnos, generarCobrosMensuales, aplicarRecargos } = require('../services/estadoPagoService');

async function run() {
  console.log(`[${new Date().toISOString()}] Iniciando revisión diaria de pagos...`);

  const cobrosGenerados = await generarCobrosMensuales();
  if (cobrosGenerados.length > 0) {
    console.log(`Se generaron ${cobrosGenerados.length} cobro(s) de mensualidad nuevos.`);
  }

  const recargos = await aplicarRecargos();
  if (recargos > 0) console.log(`Recargo por mora aplicado a ${recargos} pago(s).`);

  await require('../services/correo/notificaciones').notificarCobros().catch(err => console.error('Avisos de cobro:', err.message));

  const resultados = await evaluarTodosLosAlumnos();
  const cambios = resultados.filter(r => r.cambio);
  console.log(`Revisión completa. ${cambios.length} alumnos cambiaron de estado.`);
  cambios.forEach(c => console.log(`  Alumno ${c.alumnoId}: ${c.estadoAnterior} -> ${c.estadoNuevo}`));

  return { cobrosGenerados, resultados };
}

if (require.main === module) {
  run().then(() => process.exit(0)).catch(err => {
    console.error('Error en job de revisión de pagos:', err);
    process.exit(1);
  });
}

module.exports = run;

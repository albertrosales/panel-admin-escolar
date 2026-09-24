/**
 * Job diario: evalúa el estado de pago de todos los alumnos activos
 * y sincroniza el bloqueo/desbloqueo de acceso en Moodle.
 *
 * Ejecutar con node-cron desde server.js, o como cron job externo:
 *   node server/jobs/revisarPagos.js
 */
const { evaluarTodosLosAlumnos } = require('../services/estadoPagoService');

async function run() {
  console.log(`[${new Date().toISOString()}] Iniciando revisión diaria de pagos...`);
  const resultados = await evaluarTodosLosAlumnos();
  const cambios = resultados.filter(r => r.cambio);
  console.log(`Revisión completa. ${cambios.length} alumnos cambiaron de estado.`);
  cambios.forEach(c => console.log(`  Alumno ${c.alumnoId}: ${c.estadoAnterior} -> ${c.estadoNuevo}`));
  return resultados;
}

if (require.main === module) {
  run().then(() => process.exit(0)).catch(err => {
    console.error('Error en job de revisión de pagos:', err);
    process.exit(1);
  });
}

module.exports = run;

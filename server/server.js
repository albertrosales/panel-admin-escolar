require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const pool = require('./db');
const authRoutes = require('./routes/auth');
const portalRoutes = require('./routes/portal');
const alumnosRoutes = require('./routes/alumnos');
const profesoresRoutes = require('./routes/profesores');
const pagosRoutes = require('./routes/pagos');
const reportesRoutes = require('./routes/reportes');
const gradosRoutes = require('./routes/grados');
const adminRoutes = require('./routes/admin');
const estadisticasRoutes = require('./routes/estadisticas');
const calendarioRoutes = require('./routes/calendario');
const asistenciaRoutes = require('./routes/asistencia');
const notasRoutes = require('./routes/notas');
const comprobantesRoutes = require('./routes/comprobantes');
const comprobantesPortalRoutes = require('./routes/comprobantesPortal');
const requirePortal = require('./middleware/portalAuth');
const importacionRoutes = require('./routes/importacion');
const saceRoutes = require('./routes/sace');
const conciliacionRoutes = require('./routes/conciliacion');
const correosRoutes = require('./routes/correos');
const colegioRoutes = require('./routes/colegio');
const proveedorRoutes = require('./routes/proveedor');
const licencias = require('./services/licencias');
const auditoria = require('./services/auditoria');
const respaldo = require('./services/respaldo');
const auditoriaRoutes = require('./routes/auditoria');
const soporteRoutes = require('./routes/soporte');
const respaldosRoutes = require('./routes/respaldos');
const matriculasRoutes = require('./routes/matriculas');
const matriculaPortalRoutes = require('./routes/matriculaPortal');
const notif = require('./services/correo/notificaciones');
const migrar = require('./services/migraciones');
const requireAuth = require('./middleware/auth');
const revisarPagos = require('./jobs/revisarPagos');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/generated-pdfs', express.static('generated-pdfs'));

app.get('/health', (req, res) => res.json({ ok: true }));

// Los reportes reciben el id del alumno o profesor en la URL: verificamos que sea del colegio de quien pide
async function verificarPropiedadReportes(req, res, next) {
  try {
    let m = req.path.match(/^\/(constancia|reporte-pago)\/(\d+)/);
    if (m) {
      const r = await pool.query('SELECT colegio_id FROM alumnos WHERE id = $1', [m[2]]);
      if (!r.rows[0] || Number(r.rows[0].colegio_id) !== req.colegioId) {
        return res.status(404).json({ error: 'Alumno no encontrado' });
      }
      return next();
    }
    m = req.path.match(/^\/informe-docente\/(\d+)/);
    if (m) {
      const r = await pool.query('SELECT colegio_id FROM profesores WHERE id = $1', [m[1]]);
      if (!r.rows[0] || Number(r.rows[0].colegio_id) !== req.colegioId) {
        return res.status(404).json({ error: 'Profesor no encontrado' });
      }
      return next();
    }
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

app.get('/api/marca/:id/logo', colegioRoutes.logoPublico);
app.use('/api', licencias.guard, auditoria.middleware);
app.use('/api/auth', authRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/portal-comprobantes', requirePortal, licencias.requireModulo('comprobantes'), comprobantesPortalRoutes);

app.use('/api/alumnos', requireAuth, alumnosRoutes);
app.use('/api/profesores', requireAuth, profesoresRoutes);
app.use('/api/pagos', requireAuth, pagosRoutes);
app.use('/api/reportes', requireAuth, verificarPropiedadReportes, reportesRoutes);
app.use('/api/grados', requireAuth, gradosRoutes);
app.use('/api/admin', requireAuth, adminRoutes);
app.use('/api/estadisticas', requireAuth, estadisticasRoutes);
app.use('/api/calendario', requireAuth, calendarioRoutes);
app.use('/api/colegio', requireAuth, colegioRoutes);
app.use('/api/auditoria', requireAuth, auditoriaRoutes);
app.use('/api/soporte', requireAuth, soporteRoutes);
app.use('/api/importacion', requireAuth, licencias.requireModulo('importacion'), importacionRoutes);
app.use('/api/sace', requireAuth, licencias.requireModulo('asistencia'), saceRoutes('admin'));
app.use('/api/portal-sace', requirePortal, licencias.requireModulo('asistencia'), saceRoutes('portal'));
app.use('/api/respaldos', requireAuth, respaldosRoutes);
app.use('/api/proveedor', requireAuth, proveedorRoutes);
app.use('/api/matriculas', requireAuth, licencias.requireModulo('matricula'), matriculasRoutes);
app.use('/api/portal-matricula', requirePortal, licencias.requireModulo('matricula'), matriculaPortalRoutes);
app.use('/api/asistencia', requireAuth, licencias.requireModulo('asistencia'), asistenciaRoutes);
app.use('/api/notas', requireAuth, notasRoutes);
app.use('/api/comprobantes', requireAuth, licencias.requireModulo('comprobantes'), comprobantesRoutes);
app.use('/api/correos', requireAuth, licencias.requireModulo('notificaciones'), correosRoutes);
app.use('/api/conciliacion', requireAuth, licencias.requireModulo('conciliacion'), conciliacionRoutes);

cron.schedule('0 6 * * *', () => {
  revisarPagos().catch(err => console.error('Error en cron de pagos:', err));
});

// Respaldo semanal por correo (si BACKUP_EMAIL está configurado) y limpieza de auditoría antigua
cron.schedule('0 3 * * 0', () => { respaldo.respaldoPorCorreo().catch(err => console.error('Respaldo semanal:', err.message)); });
cron.schedule('30 3 * * *', () => { auditoria.depurar(); });

// Cola de correos: reintenta pendientes cada 5 minutos
cron.schedule('*/5 * * * *', () => { notif.procesarPendientes().catch(err => console.error('Cola de correos:', err.message)); });

const PORT = process.env.PORT || 3000;
migrar()
  .catch(err => console.error('Error en migraciones:', err.message))
  .finally(() => app.listen(PORT, () => {
    console.log(`Panel administrativo escuchando en puerto ${PORT}`);
    // Al despertar (Render gratis duerme): ponerse al día con avisos de cobro y correos pendientes (no duplica)
    setTimeout(() => respaldo.respaldoSiToca().catch(err => console.error('Respaldo al iniciar:', err.message)), 60000);
    notif.notificarCobros().then(() => notif.procesarPendientes()).catch(err => console.error('Notificaciones al iniciar:', err.message));
  }));

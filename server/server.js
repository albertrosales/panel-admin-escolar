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
const requireAuth = require('./middleware/auth');
const revisarPagos = require('./jobs/revisarPagos');

const app = express();
app.use(cors());
app.use(express.json());
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

app.use('/api/auth', authRoutes);
app.use('/api/portal', portalRoutes);

app.use('/api/alumnos', requireAuth, alumnosRoutes);
app.use('/api/profesores', requireAuth, profesoresRoutes);
app.use('/api/pagos', requireAuth, pagosRoutes);
app.use('/api/reportes', requireAuth, verificarPropiedadReportes, reportesRoutes);
app.use('/api/grados', requireAuth, gradosRoutes);
app.use('/api/admin', requireAuth, adminRoutes);
app.use('/api/estadisticas', requireAuth, estadisticasRoutes);

cron.schedule('0 6 * * *', () => {
  revisarPagos().catch(err => console.error('Error en cron de pagos:', err));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Panel administrativo escuchando en puerto ${PORT}`));

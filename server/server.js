require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const authRoutes = require('./routes/auth');
const alumnosRoutes = require('./routes/alumnos');
const profesoresRoutes = require('./routes/profesores');
const pagosRoutes = require('./routes/pagos');
const reportesRoutes = require('./routes/reportes');
const gradosRoutes = require('./routes/grados');
const requireAuth = require('./middleware/auth');
const revisarPagos = require('./jobs/revisarPagos');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/generated-pdfs', express.static('generated-pdfs'));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);

app.use('/api/alumnos', requireAuth, alumnosRoutes);
app.use('/api/profesores', requireAuth, profesoresRoutes);
app.use('/api/pagos', requireAuth, pagosRoutes);
app.use('/api/reportes', requireAuth, reportesRoutes);
app.use('/api/grados', requireAuth, gradosRoutes);

cron.schedule('0 6 * * *', () => {
  revisarPagos().catch(err => console.error('Error en cron de pagos:', err));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Panel administrativo escuchando en puerto ${PORT}`));

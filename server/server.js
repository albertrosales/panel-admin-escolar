require('dotenv').config();
const express = require('express');
const cron = require('node-cron');

const alumnosRoutes = require('./routes/alumnos');
const profesoresRoutes = require('./routes/profesores');
const pagosRoutes = require('./routes/pagos');
const reportesRoutes = require('./routes/reportes');
const revisarPagos = require('./jobs/revisarPagos');

const app = express();
app.use(express.json());
app.use('/generated-pdfs', express.static('generated-pdfs'));

app.use('/api/alumnos', alumnosRoutes);
app.use('/api/profesores', profesoresRoutes);
app.use('/api/pagos', pagosRoutes);
app.use('/api/reportes', reportesRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

// Cron: todos los días a las 6:00 AM revisa vencimientos y sincroniza Moodle
cron.schedule('0 6 * * *', () => {
  revisarPagos().catch(err => console.error('Error en cron de pagos:', err));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Panel administrativo escuchando en puerto ${PORT}`));

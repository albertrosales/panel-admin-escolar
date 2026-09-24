const express = require('express');
const router = express.Router();
const path = require('path');
const {
  generarConstanciaEstudio,
  generarReportePago,
  generarInformeDocente
} = require('../services/pdfService');

router.post('/constancia/:alumnoId', async (req, res) => {
  try {
    const doc = await generarConstanciaEstudio(req.params.alumnoId);
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reporte-pago/:alumnoId', async (req, res) => {
  try {
    const doc = await generarReportePago(req.params.alumnoId);
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/informe-docente/:profesorId', async (req, res) => {
  try {
    const doc = await generarInformeDocente(req.params.profesorId);
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Descargar el PDF generado
router.get('/descargar/:filename', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'generated-pdfs', req.params.filename));
});

module.exports = router;

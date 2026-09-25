const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  const colegio_id = req.query.colegio_id;
  const result = await pool.query(
    'SELECT * FROM grados WHERE colegio_id = $1 ORDER BY nombre',
    [colegio_id]
  );
  res.json(result.rows);
});

module.exports = router;

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const auditoria = require('../services/auditoria');

router.post('/login', async (req, res) => {
  try {
    const correo = req.body.correo;
    const password = req.body.password;

    if (!correo || !password) {
      return res.status(400).json({ error: 'Correo y contraseña son requeridos' });
    }

    const result = await pool.query(
      'SELECT * FROM usuarios_admin WHERE correo = $1 AND activo = true',
      [correo]
    );
    const usuario = result.rows[0];
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip;
    if (!usuario) {
      auditoria.registrar({ usuario: String(correo).slice(0, 150), accion: 'Inicio de sesión fallido (usuario inexistente)', metodo: 'POST', ruta: '/auth/login', entidad: 'auth', ip });
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const coincide = await bcrypt.compare(password, usuario.password_hash);
    if (!coincide) {
      auditoria.registrar({ colegioId: usuario.colegio_id, usuarioId: usuario.id, usuario: usuario.correo, rol: usuario.rol, accion: 'Inicio de sesión fallido', metodo: 'POST', ruta: '/auth/login', entidad: 'auth', ip });
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    auditoria.registrar({ colegioId: usuario.colegio_id, usuarioId: usuario.id, usuario: usuario.correo, rol: usuario.rol, accion: 'Inicio de sesión', metodo: 'POST', ruta: '/auth/login', entidad: 'auth', ip });
    const token = jwt.sign(
      { id: usuario.id, colegio_id: usuario.colegio_id, correo: usuario.correo, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token: token,
      usuario: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol, colegio_id: usuario.colegio_id }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

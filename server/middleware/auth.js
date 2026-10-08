const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || header.indexOf('Bearer ') !== 0) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Solo tokens de administración: los del portal (alumno/profesor) no entran aquí
    if (!payload.rol || payload.tipo) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    if (!payload.colegio_id) {
      return res.status(401).json({ error: 'Sesión sin colegio asignado. Vuelve a iniciar sesión.' });
    }
    req.usuario = payload;
    req.colegioId = Number(payload.colegio_id);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// Administrador general: rol admin del colegio 1 (o rol superadmin)
function esSuperAdmin(usuario) {
  return usuario.rol === 'superadmin' || (usuario.rol === 'admin' && Number(usuario.colegio_id) === 1);
}

function requireSuperAdmin(req, res, next) {
  if (!esSuperAdmin(req.usuario)) {
    return res.status(403).json({ error: 'Solo el administrador general puede hacer esto' });
  }
  next();
}

module.exports = requireAuth;
module.exports.requireSuperAdmin = requireSuperAdmin;

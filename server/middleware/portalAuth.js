const jwt = require('jsonwebtoken');

function requirePortal(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || header.indexOf('Bearer ') !== 0) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.tipo !== 'alumno' && payload.tipo !== 'profesor') {
      return res.status(401).json({ error: 'No autorizado' });
    }
    req.portal = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

module.exports = requirePortal;

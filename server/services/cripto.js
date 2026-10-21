const crypto = require('crypto');
// Cifra datos sensibles (p. ej. el acceso al correo de cada colegio) antes de guardarlos
const clave = () => crypto.createHash('sha256').update('correo-colegio:' + (process.env.CORREO_CLAVE || process.env.JWT_SECRET)).digest();
function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', clave(), iv);
  const enc = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function descifrar(valor) {
  const [iv, tag, enc] = String(valor).split('.').map((x) => Buffer.from(x, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', clave(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
module.exports = { cifrar, descifrar };

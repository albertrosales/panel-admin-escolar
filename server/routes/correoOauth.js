const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/auth');
const { cifrar } = require('../services/cripto');

const base = () => String(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
const redirectUri = () => base() + '/api/correo-oauth/callback';
const front = () => String(process.env.FRONTEND_URL || 'https://sistema.uluamedia.com').replace(/\/+$/, '');

// Devuelve la dirección de Google a la que hay que mandar al administrador para conectar su Gmail
router.get('/iniciar', requireAuth, (req, res) => {
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) return res.status(400).json({ error: 'Falta configurar GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET en el servidor' });
  if (!base()) return res.status(400).json({ error: 'Falta configurar PUBLIC_URL en el servidor' });
  const state = jwt.sign({ c: req.colegioId, p: 'correo' }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const q = new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID, redirect_uri: redirectUri(), response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.send openid email', access_type: 'offline', prompt: 'consent', state
  });
  res.json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + q.toString(), redirect_uri: redirectUri() });
});

// Google regresa aquí (sin sesión): el "state" firmado indica a qué colegio pertenece
router.get('/callback', async (req, res) => {
  const volver = (x) => res.redirect(front() + '/configuracion?correo=' + encodeURIComponent(x));
  try {
    if (req.query.error) return volver('cancelado');
    const st = jwt.verify(String(req.query.state || ''), process.env.JWT_SECRET);
    if (st.p !== 'correo') return volver('error');
    const t = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
      code: String(req.query.code || ''), client_id: process.env.GMAIL_CLIENT_ID, client_secret: process.env.GMAIL_CLIENT_SECRET,
      redirect_uri: redirectUri(), grant_type: 'authorization_code'
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 });
    if (!t.data.refresh_token) return volver('sin_permiso');
    let correo = '';
    try { correo = JSON.parse(Buffer.from(String(t.data.id_token).split('.')[1], 'base64').toString()).email || ''; } catch (e) { /* sin id_token */ }
    if (!correo) return volver('error');
    await pool.query('UPDATE colegios SET gmail_refresh_token = $1, gmail_correo = $2 WHERE id = $3', [cifrar(t.data.refresh_token), correo, st.c]);
    volver('ok');
  } catch (e) { console.error('correo-oauth:', e.message, JSON.stringify(e.response && e.response.data || '')); volver('error'); }
});

router.get('/estado', requireAuth, async (req, res) => {
  const { rows: [c] } = await pool.query('SELECT gmail_correo FROM colegios WHERE id = $1', [req.colegioId]);
  res.json({ correo: (c && c.gmail_correo) || null, disponible: !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && base()), redirect_uri: base() ? redirectUri() : null });
});

router.delete('/', requireAuth, async (req, res) => {
  await pool.query('UPDATE colegios SET gmail_refresh_token = NULL, gmail_correo = NULL WHERE id = $1', [req.colegioId]);
  res.json({ ok: true });
});

module.exports = router;

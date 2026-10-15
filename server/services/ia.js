const axios = require('axios');

function parseJSON(t) {
  const m = String(t || '').match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Respuesta de lectura inválida');
  return JSON.parse(m[0]);
}

/** Pide un JSON a la IA con una imagen/PDF (buffer+mime) y/o un texto. Usa Gemini o, si no hay, Claude. */
async function generarJSON({ prompt, mime, buffer, texto }) {
  if (process.env.GEMINI_API_KEY) {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const parts = [];
    if (buffer) parts.push({ inline_data: { mime_type: mime, data: buffer.toString('base64') } });
    if (texto) parts.push({ text: texto });
    parts.push({ text: prompt });
    const r = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent',
      { contents: [{ parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } },
      { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY }, timeout: 120000 }
    );
    const p = (((r.data.candidates || [])[0] || {}).content || {}).parts || [];
    return parseJSON(p.map((x) => x.text || '').join(''));
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const content = [];
    if (buffer) content.push({ type: mime === 'application/pdf' ? 'document' : 'image', source: { type: 'base64', media_type: mime, data: buffer.toString('base64') } });
    if (texto) content.push({ type: 'text', text: texto });
    content.push({ type: 'text', text: prompt });
    const r = await axios.post('https://api.anthropic.com/v1/messages',
      { model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 4000, messages: [{ role: 'user', content }] },
      { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, timeout: 120000 });
    return parseJSON((r.data.content || []).map((c) => c.text || '').join(''));
  }
  throw new Error('Falta GEMINI_API_KEY en el servidor');
}

module.exports = { generarJSON };

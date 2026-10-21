import { useState } from 'react';

// Estado del correo de bienvenida + botón para enviar una contraseña nueva
export default function CredencialesAviso({ envio, enviarNueva }) {
  const [r, setR] = useState(envio);
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState('');
  async function reenviar() {
    setCargando(true); setErr('');
    try { setR(await enviarNueva()); } catch (e) { setErr(e.message); }
    setCargando(false);
  }
  return (
    <div className="mt-3 text-sm">
      {r && r.enviado && <p className="text-green-700">✓ Credenciales enviadas a {r.para}.</p>}
      {r && !r.enviado && <p className="text-amber-700">No se envió el correo: {r.motivo}</p>}
      {err && <p className="text-red-600">{err}</p>}
      <button type="button" className="secondary mt-2" disabled={cargando} onClick={reenviar}>
        {cargando ? 'Enviando…' : 'Enviar credenciales (con contraseña nueva)'}
      </button>
    </div>
  );
}

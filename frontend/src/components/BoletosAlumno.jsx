import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../api';

const fechaTxt = (f) => (f ? f.split('-').reverse().join('/') : '');
const ESTADO = { pagado: ['Pagado', 'badge-verde'], usado: ['Ya ingresó', 'badge-amarillo'], pendiente: ['Sin pagar', 'badge-rojo'] };

function Qr({ codigo }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(codigo, { width: 220, margin: 1 }).then(setSrc); }, [codigo]);
  return src ? <img src={src} alt={'QR ' + codigo} className="w-28 h-28" /> : null;
}

/** Boletos de eventos del alumno: los pagados muestran su QR; los pendientes avisan que falta el pago */
export default function BoletosAlumno({ alumnoId }) {
  const [filas, setFilas] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { api.eventos.deAlumno(alumnoId).then(setFilas).catch(() => setFilas([])); }, [alumnoId]);
  if (!filas || !filas.length) return null;
  async function enviar(b) {
    const c = window.prompt('¿A qué correo enviar este boleto?', b.correo || ''); if (!c) return;
    try { await api.eventos.enviarBoleto(b.id, c.trim()); setMsg('Boleto enviado a ' + c.trim()); } catch (e) { setMsg(e.message); }
  }
  return (
    <div className="card">
      <h3>Boletos de eventos</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        {filas.map((b) => (
          <div key={b.id} className="border-2 border-dashed rounded-xl p-3 flex items-center gap-3">
            {b.codigo && b.estado !== 'usado' ? <Qr codigo={b.codigo} /> : <div className="w-28 h-28 rounded-lg bg-gray-100 flex items-center justify-center text-xs text-gray-500 text-center p-2">{b.estado === 'usado' ? 'Ya se usó' : 'QR disponible al pagar'}</div>}
            <div className="min-w-0 text-sm">
              <p className="font-bold">{b.evento}</p>
              <p className="text-gray-500">{[b.fecha && fechaTxt(b.fecha), b.hora, b.lugar].filter(Boolean).join(' · ')}</p>
              <p className="mt-1"><span className={'badge ' + (ESTADO[b.estado] || ['', ''])[1]}>{(ESTADO[b.estado] || [b.estado])[0]}</span></p>
              {b.codigo && <p className="font-mono text-xs mt-1">{b.codigo}</p>}
              {b.codigo && b.estado === 'pagado' && <button type="button" className="secondary mt-2" onClick={() => enviar(b)}>Enviar por correo</button>}
            </div>
          </div>
        ))}
      </div>
      {msg && <p className="text-sm text-gray-500 mt-2">{msg}</p>}
    </div>
  );
}

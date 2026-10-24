import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

// Lee códigos QR con la cámara. También sirve un lector USB (escribe el código en el campo y Enter).
export default function EscanerQR({ onCodigo, activo }) {
  const video = useRef(null); const canvas = useRef(null); const ultimo = useRef({ c: '', t: 0 });
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!activo) return undefined;
    let stream, raf, vivo = true;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!vivo) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.current.srcObject = stream; await video.current.play();
        const tick = () => {
          const v = video.current;
          if (v && v.readyState === v.HAVE_ENOUGH_DATA) {
            const c = canvas.current; c.width = v.videoWidth; c.height = v.videoHeight;
            const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(v, 0, 0);
            const r = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
            if (r && r.data && (r.data !== ultimo.current.c || Date.now() - ultimo.current.t > 4000)) { ultimo.current = { c: r.data, t: Date.now() }; onCodigo(r.data); }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) { setErr('No se pudo abrir la cámara. Revisa el permiso del navegador (se necesita HTTPS) o escribe el código a mano.'); }
    })();
    return () => { vivo = false; cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, [activo]);
  if (!activo) return null;
  return (
    <div>
      {err ? <p className="text-sm text-red-600">{err}</p> : <video ref={video} playsInline muted className="w-full max-w-sm rounded-xl bg-black" />}
      <canvas ref={canvas} className="hidden" />
    </div>
  );
}

import { useEffect, useState, useSyncExternalStore } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { suscribir, estado, cerrarAviso } from '../ui';

let cache = estado();
const snap = () => { const n = estado(); if (n.pendientes !== cache.pendientes || n.avisos !== cache.avisos) cache = n; return cache; };
const useUI = () => useSyncExternalStore(suscribir, snap);

/** Barra de carga superior + avisos de guardado + spinner en botones. Se monta una sola vez en la app. */
export function CapaUI() {
  const { pendientes, avisos } = useUI();
  const [barra, setBarra] = useState(false);
  const [lento, setLento] = useState(false);

  // La barra solo aparece si la petición tarda más de 150 ms (evita parpadeos)
  useEffect(() => {
    if (!pendientes) { const t = setTimeout(() => setBarra(false), 250); return () => clearTimeout(t); }
    const t = setTimeout(() => setBarra(true), 150);
    return () => clearTimeout(t);
  }, [pendientes]);

  // Si el servidor tarda más de 4 s (estaba dormido), se avisa para que nadie piense que se trabó
  useEffect(() => {
    if (!pendientes) { setLento(false); return; }
    const t = setTimeout(() => setLento(true), 4000);
    return () => clearTimeout(t);
  }, [pendientes]);

  // Botón con spinner mientras su acción espera respuesta del servidor
  useEffect(() => {
    const alClic = (e) => {
      const b = e.target.closest && e.target.closest('button');
      if (!b || b.classList.contains('secondary') || b.disabled) return;
      setTimeout(() => { if (estado().pendientes > 0 && document.contains(b)) b.setAttribute('data-cargando', '1'); }, 120);
    };
    document.addEventListener('click', alClic, true);
    return () => document.removeEventListener('click', alClic, true);
  }, []);
  useEffect(() => {
    if (pendientes === 0) document.querySelectorAll('button[data-cargando]').forEach((b) => b.removeAttribute('data-cargando'));
  }, [pendientes]);

  return (
    <>
      <div className={'barra-carga' + (barra ? ' activa' : '')} aria-hidden="true"><span /></div>
      {lento && <div className="aviso-lento" role="status">El servidor estaba descansando y está despertando. Puede tardar hasta un minuto; no cierres la página.</div>}
      <div className="avisos" role="status" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={'aviso aviso-' + a.tipo}>
            {a.tipo === 'error' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
            <span>{a.texto}</span>
            <button type="button" aria-label="Cerrar" onClick={() => cerrarAviso(a.id)}><X size={14} /></button>
          </div>
        ))}
      </div>
    </>
  );
}

/** Bloque gris animado que ocupa el lugar del contenido mientras carga */
export const Esqueleto = ({ w = '100%', h = 16, className = '' }) => <div className={'esqueleto ' + className} style={{ width: w, height: h }} />;

/** Varias tarjetas fantasma: úsalo en lugar de "Cargando..." */
export function Cargando({ tarjetas = 2, cifras = 0 }) {
  return (
    <div aria-busy="true" aria-label="Cargando">
      <Esqueleto w={220} h={26} className="mb-5" />
      {cifras > 0 && (
        <div className="stats-row">{Array.from({ length: cifras }).map((_, i) => (
          <div key={i} className="card stat-box"><Esqueleto w={70} h={28} className="mb-2" /><Esqueleto w="60%" h={12} /></div>
        ))}</div>
      )}
      {Array.from({ length: tarjetas }).map((_, i) => (
        <div key={i} className="card"><Esqueleto w={160} h={14} className="mb-4" /><Esqueleto h={12} className="mb-2" /><Esqueleto w="85%" h={12} className="mb-2" /><Esqueleto w="70%" h={12} /></div>
      ))}
    </div>
  );
}

/** Barra de progreso. valor y max numéricos; color: azul | verde | ambar | rojo */
export function Barra({ valor, max, color = 'azul', etiqueta, derecha }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (Number(valor) / Number(max)) * 100)) : 0;
  const [ancho, setAncho] = useState(0);
  useEffect(() => { const t = requestAnimationFrame(() => setAncho(pct)); return () => cancelAnimationFrame(t); }, [pct]);
  return (
    <div className="barra-wrap">
      {(etiqueta || derecha) && <div className="barra-txt"><span>{etiqueta}</span><span>{derecha}</span></div>}
      <div className="barra" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin="0" aria-valuemax="100"><div className={'barra-fill barra-' + color} style={{ width: ancho + '%' }} /></div>
    </div>
  );
}

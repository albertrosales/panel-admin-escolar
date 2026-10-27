import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, GraduationCap, Ticket } from 'lucide-react';
import { api } from '../api';

/** Búsqueda global: alumnos, profesores y boletos. Ctrl/Cmd + K para enfocar. */
export default function BuscadorGlobal() {
  const [q, setQ] = useState('');
  const [r, setR] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const [sel, setSel] = useState(0);
  const ref = useRef(null);
  const caja = useRef(null);
  const nav = useNavigate();

  useEffect(() => {
    const tecla = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ref.current && ref.current.focus(); } };
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
    window.addEventListener('keydown', tecla); document.addEventListener('mousedown', fuera);
    return () => { window.removeEventListener('keydown', tecla); document.removeEventListener('mousedown', fuera); };
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) { setR(null); return; }
    let vivo = true;
    const t = setTimeout(() => api.buscar(q.trim()).then((x) => { if (vivo) { setR(x); setSel(0); } }).catch(() => {}), 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [q]);

  const items = r ? [
    ...r.alumnos.map((a) => ({ k: 'a' + a.id, icono: User, titulo: a.nombre_completo, sub: ['Alumno', a.codigo && 'Código ' + a.codigo, !a.activo && 'Inactivo', a.estado_pago === 'moroso' && 'Moroso'].filter(Boolean).join(' · '), ruta: '/alumnos/' + a.id })),
    ...r.profesores.map((p) => ({ k: 'p' + p.id, icono: GraduationCap, titulo: p.nombre_completo, sub: 'Profesor', ruta: '/profesores' })),
    ...r.boletos.map((b) => ({ k: 'b' + b.id, icono: Ticket, titulo: (b.comprador || 'Boleto') + ' · ' + b.codigo, sub: 'Boleto · ' + b.evento + ' · ' + b.estado, ruta: '/eventos' }))
  ] : [];

  const ir = (it) => { setAbierto(false); setQ(''); setR(null); nav(it.ruta); };
  const alTeclear = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter' && items[sel]) ir(items[sel]);
    else if (e.key === 'Escape') { setAbierto(false); e.target.blur(); }
  };

  return (
    <div className="buscador" ref={caja}>
      <Search size={16} className="buscador-ico" />
      <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setAbierto(true); }} onFocus={() => setAbierto(true)} onKeyDown={alTeclear}
        placeholder="Buscar alumno, código, encargado o boleto…" aria-label="Búsqueda global" />
      <kbd className="buscador-kbd">Ctrl K</kbd>
      {abierto && q.trim().length >= 2 && (
        <div className="buscador-lista">
          {r && !items.length && <p className="text-sm text-gray-500 px-3 py-3">Sin resultados para “{q}”.</p>}
          {!r && <p className="text-sm text-gray-400 px-3 py-3">Buscando…</p>}
          {items.map((it, i) => (
            <button type="button" key={it.k} className={'buscador-item' + (i === sel ? ' sel' : '')} onMouseEnter={() => setSel(i)} onClick={() => ir(it)}>
              <it.icono size={16} /><span className="min-w-0"><b>{it.titulo}</b><small>{it.sub}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

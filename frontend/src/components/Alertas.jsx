import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, CheckCircle2 } from 'lucide-react';
import { api } from '../api';

const PUNTO = { rojo: 'bg-red-500', ambar: 'bg-amber-500', azul: 'bg-blue-500', gris: 'bg-gray-400' };

/** Lo que necesita atención hoy: cada línea lleva a la pantalla donde se resuelve */
export default function Alertas() {
  const [lista, setLista] = useState(null);
  const nav = useNavigate();
  useEffect(() => { api.alertas().then(setLista).catch(() => setLista([])); }, []);
  if (lista === null) return null;
  return (
    <div className="card">
      <h3>Requiere tu atención</h3>
      {!lista.length ? (
        <p className="text-sm text-green-700 flex items-center gap-2"><CheckCircle2 size={16} /> Todo en orden: no hay pendientes por ahora.</p>
      ) : (
        <div className="flex flex-col">
          {lista.map((a) => (
            <button type="button" key={a.clave} className="alerta" onClick={() => nav(a.ruta)}>
              <span className={'w-2.5 h-2.5 rounded-full shrink-0 ' + PUNTO[a.nivel]} />
              <span className="flex-1 text-left">{a.texto}</span>
              <ChevronRight size={16} className="text-gray-400" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { api } from '../api';

const COLEGIO_ID = 1;

export default function Configuracion() {
  const [dia, setDia] = useState(5);
  const [guardando, setGuardando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const [mora, setMora] = useState({ mora_tipo: 'porcentaje', mora_valor: 0, mora_dias_gracia: 0 });
  useEffect(() => { api.admin.mora().then((m) => m.mora_tipo && setMora(m)).catch(() => {}); }, []);
  async function guardarMora(e) {
    e.preventDefault();
    try { setMensaje((await api.admin.guardarMora(mora)).mensaje); } catch (e2) { setMensaje('Error: ' + e2.message); }
  }

  async function guardarDia(e) {
    e.preventDefault();
    setGuardando(true);
    setMensaje('');
    try {
      await api.admin.configurarDiaPago(COLEGIO_ID, dia);
      setMensaje('Día de pago actualizado a día ' + dia + ' de cada mes.');
    } catch (e2) {
      setMensaje('Error: ' + e2.message);
    } finally {
      setGuardando(false);
    }
  }

  async function generarAhora() {
    setGenerando(true);
    setMensaje('');
    try {
      const res = await api.admin.generarCobrosMensuales();
      setMensaje(res.mensaje);
    } catch (e2) {
      setMensaje('Error: ' + e2.message);
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div>
      <h2>Configuración de cobros</h2>

      <div className="card">
        <h3>Día de vencimiento mensual</h3>
        <p className="text-sm text-gray-500 mb-3">
          Es el mismo día del mes para todos los alumnos. Cada alumno tiene su propio monto de
          mensualidad, definido en su ficha.
        </p>
        <form onSubmit={guardarDia} className="flex items-end gap-3">
          <label>
            Día del mes (1-28)
            <input type="number" min="1" max="28" value={dia} onChange={(e) => setDia(e.target.value)} className="w-28" />
          </label>
          <button type="submit" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
        </form>
      </div>

      <div className="card">
        <h3>Recargo por mora</h3>
        <p className="text-sm text-gray-500 mb-3">
          Se aplica una sola vez a cada cobro vencido y sin pagar, pasados los días de gracia. Valor 0 = sin recargo.
          Los descuentos y becas se definen en la ficha de cada alumno.
        </p>
        <form onSubmit={guardarMora} className="flex flex-wrap items-end gap-3">
          <label>Tipo
            <select value={mora.mora_tipo} onChange={(e) => setMora({ ...mora, mora_tipo: e.target.value })}>
              <option value="porcentaje">Porcentaje (%)</option>
              <option value="fijo">Monto fijo (L.)</option>
            </select>
          </label>
          <label>Valor
            <input type="number" min="0" step="0.01" className="w-28" value={mora.mora_valor} onChange={(e) => setMora({ ...mora, mora_valor: e.target.value })} />
          </label>
          <label>Días de gracia
            <input type="number" min="0" className="w-28" value={mora.mora_dias_gracia} onChange={(e) => setMora({ ...mora, mora_dias_gracia: e.target.value })} />
          </label>
          <button type="submit">Guardar</button>
        </form>
      </div>

      <div className="card">
        <h3>Generación de cobros mensuales</h3>
        <p className="text-sm text-gray-500 mb-3">
          Esto ocurre automáticamente todos los días a las 6:00 AM. Usa este botón solo si quieres
          forzar la generación ahora mismo (por ejemplo, justo después de configurar el día de pago).
        </p>
        <button onClick={generarAhora} disabled={generando}>{generando ? 'Generando...' : 'Generar cobros del mes ahora'}</button>
      </div>

      {mensaje && <p className="text-sm text-gray-600">{mensaje}</p>}
    </div>
  );
}

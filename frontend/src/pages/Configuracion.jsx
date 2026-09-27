import { useState } from 'react';
import { api } from '../api';

const COLEGIO_ID = 1;

export default function Configuracion() {
  const [dia, setDia] = useState(5);
  const [guardando, setGuardando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [mensaje, setMensaje] = useState('');

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

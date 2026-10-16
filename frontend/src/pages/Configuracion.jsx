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

  const [cuentas, setCuentas] = useState('');
  const [autoMF, setAutoMF] = useState(false);
  useEffect(() => { api.admin.cuentas().then((r) => { setCuentas(r.cuentas_destino || ''); setAutoMF(!!r.conciliacion_monto_fecha); }).catch(() => {}); }, []);
  async function guardarCuentas(e) {
    e.preventDefault();
    try { setMensaje((await api.admin.guardarCuentas(cuentas, autoMF)).mensaje); } catch (e2) { setMensaje('Error: ' + e2.message); }
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

  async function sincronizarCodigos() {
    setMensaje('Enviando códigos a Moodle...');
    try {
      const r = await api.admin.sincronizarCodigos();
      setMensaje(r.actualizados + ' alumnos actualizados en Moodle' + (r.compartidos ? ' (' + r.compartidos + ' comparten cuenta de Moodle con otro alumno y se omitieron)' : '') + (r.total_errores ? '. Errores: ' + r.total_errores + ' — ' + r.errores.join(' | ') : '.'));
    } catch (e2) { setMensaje('Error: ' + e2.message); }
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
        <h3>Cuentas bancarias del colegio</h3>
        <p className="text-sm text-gray-500 mb-3">
          Una por línea. Sirve para avisarte cuando un comprobante fue depositado a otra cuenta. Basta con los últimos dígitos.
        </p>
        <form onSubmit={guardarCuentas} className="flex flex-col gap-3 max-w-md">
          <textarea rows="3" value={cuentas} onChange={(e) => setCuentas(e.target.value)} placeholder="Ej. 216350229626" />
          <label className="!flex-row items-start gap-2 text-sm">
            <input type="checkbox" className="w-auto mt-1" checked={autoMF} onChange={(e) => setAutoMF(e.target.checked)} />
            <span>Estas cuentas son exclusivas del colegio: confirmar automáticamente por monto y fecha cuando no haya referencia.
              <span className="block text-gray-500">Déjalo apagado si se usan cuentas personales: así los depósitos que solo coinciden en monto quedan como "probables" para que los apruebes tú.</span></span>
          </label>
          <div><button type="submit">Guardar</button></div>
        </form>
      </div>

      <div className="card">
        <h3>Código de alumno en Moodle</h3>
        <p className="text-sm text-gray-500 mb-3">
          Cada alumno nuevo ya queda con su código en Moodle (campo "Número de ID"). Usa este botón una vez para enviar los códigos de los alumnos que ya existían.
        </p>
        <button onClick={sincronizarCodigos}>Enviar códigos a Moodle</button>
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

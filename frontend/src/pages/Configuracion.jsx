import { useState, useEffect } from 'react';
import { api } from '../api';
import { comprimirImagen } from '../imagen';

const COLEGIO_ID = 1;

function MiPlan({ ctx }) {
  if (!ctx) return null;
  const l = ctx.licencia; const lim = ctx.plan.limites;
  const E = { activa: 'Activa', prueba: 'Prueba gratuita', vencida: 'Vencida', suspendida: 'Suspendida' };
  return (
    <div className="card">
      <h3>Mi plan</h3>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm mb-3">
        <p><span className="text-gray-500">Plan:</span> {ctx.plan.nombre || 'Sin plan asignado'}</p>
        <p><span className="text-gray-500">Licencia:</span> {E[l.estado]}{l.vence ? ' · vence ' + l.vence.slice(8, 10) + '/' + l.vence.slice(5, 7) + '/' + l.vence.slice(0, 4) : ''}</p>
        <p><span className="text-gray-500">Alumnos:</span> {ctx.uso.alumnos}{lim.alumnos != null ? ' de ' + lim.alumnos : ''}</p>
        <p><span className="text-gray-500">Usuarios:</span> {ctx.uso.usuarios}{lim.usuarios != null ? ' de ' + lim.usuarios : ''}</p>
      </div>
      <p className="text-xs font-medium text-gray-500 mb-1">Módulos</p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(ctx.nombres_modulos).map(([k, n]) => <span key={k} className={'badge ' + (ctx.modulos[k] ? 'badge-verde' : '')}>{n}{ctx.modulos[k] ? '' : ' (no incluido)'}</span>)}
      </div>
    </div>
  );
}

function CorreoEnvio() {
  const [e, setE] = useState(null);
  const [msg, setMsg] = useState('');
  const cargar = () => api.correoEnvio.estado().then(setE).catch((x) => setMsg(x.message));
  useEffect(() => {
    cargar();
    const q = new URLSearchParams(window.location.search).get('correo');
    const M = { ok: 'Correo conectado correctamente.', cancelado: 'Conexión cancelada.', sin_permiso: 'Google no entregó el permiso. Vuelve a intentarlo y acepta todo.', error: 'No se pudo conectar el correo.' };
    if (q) setMsg(M[q] || '');
  }, []);
  async function conectar() {
    try { const r = await api.correoEnvio.iniciar(); window.location.href = r.url; } catch (x) { setMsg(x.message); }
  }
  async function quitar() { if (!confirm('¿Desconectar este correo?')) return; await api.correoEnvio.desconectar(); setMsg('Correo desconectado.'); cargar(); }
  return (
    <div className="card">
      <h3>Correo de envío</h3>
      <p className="text-sm text-gray-500 mb-3">Desde este Gmail se envían los correos del colegio: bienvenida con credenciales, avisos de pago, asistencia y comunicados. Cada colegio conecta el suyo.</p>
      {e && e.correo
        ? <p className="mb-2">Conectado: <strong>{e.correo}</strong></p>
        : <p className="mb-2 text-amber-700">Sin correo conectado. {e && !e.disponible ? 'El servidor aún no tiene configurado el acceso a Google.' : ''}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={conectar} disabled={!e || !e.disponible}>{e && e.correo ? 'Cambiar correo' : 'Conectar Gmail'}</button>
        {e && e.correo && <button type="button" className="secondary" onClick={quitar}>Desconectar</button>}
      </div>
      {msg && <p className="text-sm text-gray-500 mt-2">{msg}</p>}
    </div>
  );
}

function Marca({ ctx, recargarCtx }) {
  const [f, setF] = useState({ nombre: ctx.colegio.nombre, color: ctx.colegio.color || '#2455e6', pie: ctx.colegio.pie || '' });
  const [msg, setMsg] = useState('');
  async function guardar(e) {
    e.preventDefault(); setMsg('');
    try { await api.colegio.guardarMarca(f); setMsg('Guardado.'); recargarCtx(); } catch (err) { setMsg(err.message); }
  }
  async function subirLogo(e) {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    try {
      const url = await comprimirImagen(file, 400, 'image/png');
      await api.colegio.guardarMarca({ logo: url }); setMsg('Logo actualizado.'); recargarCtx();
    } catch (err) { setMsg(err.message); }
    e.target.value = '';
  }
  async function quitarLogo() { await api.colegio.guardarMarca({ quitar_logo: true }); recargarCtx(); setMsg('Logo quitado.'); }
  return (
    <div className="card">
      <h3>Marca de la institución</h3>
      <p className="text-sm text-gray-500 mb-3">Nombre, color y logo se usan en el panel, los correos y los boletines.</p>
      <form onSubmit={guardar} className="flex flex-col gap-3 max-w-lg">
        <label>Nombre de la institución<input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required /></label>
        <label>Color principal<input type="color" className="w-20 h-10 p-1" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></label>
        <label>Pie de los correos (opcional)<input value={f.pie} onChange={(e) => setF({ ...f, pie: e.target.value })} placeholder="Tocoa, Colón · Tel. ..." /></label>
        <div className="flex items-center gap-3">
          {ctx.colegio.tiene_logo ? <img src={'/api/marca/' + ctx.colegio.id + '/logo?' + Date.now()} alt="Logo" className="h-12 w-auto border border-gray-200 rounded-lg p-1" /> : <span className="text-sm text-gray-500">Sin logo</span>}
          <label className="!flex-row items-center gap-2"><span className="underline cursor-pointer text-blue-600">Subir logo (PNG o JPG)</span><input type="file" accept="image/png,image/jpeg" className="hidden" onChange={subirLogo} /></label>
          {ctx.colegio.tiene_logo && <button type="button" className="secondary" onClick={quitarLogo}>Quitar</button>}
        </div>
        <div><button type="submit">Guardar</button></div>
        {msg && <p className="text-sm text-gray-500">{msg}</p>}
      </form>
    </div>
  );
}

export default function Configuracion({ ctx, recargarCtx }) {
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
      <h2>Configuración</h2>
      {ctx && <MiPlan ctx={ctx} />}
      {ctx && <Marca ctx={ctx} recargarCtx={recargarCtx} />}
      <CorreoEnvio />

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

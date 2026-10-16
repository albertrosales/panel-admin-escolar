import { useEffect, useRef, useState } from 'react';
import { api, imagenComprobante } from '../api';
import { comprimirImagen } from '../imagen';

const FLAGS = {
  referencia_repetida: ['Referencia ya usada', 'rojo'],
  datos_repetidos: ['Posible duplicado', 'rojo'],
  destino_distinto: ['Cuenta destino no es del colegio', 'rojo'],
  no_es_comprobante: ['No parece un comprobante', 'rojo'],
  ocr_fallo: ['No se pudo leer: llena los datos', 'rojo'],
  banco_en_proceso: ['El banco indica que aún se procesa', 'amarillo'],
  monto_distinto: ['Monto distinto al cobro', 'amarillo'],
  fecha_antigua: ['Fecha antigua', 'amarillo'],
  fecha_futura: ['Fecha futura', 'amarillo'],
  sin_referencia: ['Sin referencia', 'amarillo'],
  sin_nombre: ['Sin nombre del que paga', 'amarillo'],
  codigo_nota_distinto: ['El comentario trae el código de otro alumno', 'amarillo']
};

const pendiente0 = (c) => c.estado === 'requiere_alumno' || c.estado === 'por_verificar';

const ORIGEN = {
  ocr_alumno: 'por el nombre de quien pagó', ocr_encargado: 'por el nombre del encargado', codigo_nota: 'por el código escrito en el comentario',
  codigo_escrito: 'por el código que escribió quien subió el pago', portal: 'subido por el propio alumno', manual: 'elegido por administración'
};

function Miniatura({ id }) {
  const [src, setSrc] = useState(null);
  useEffect(() => { imagenComprobante(id).then(setSrc).catch(() => {}); }, [id]);
  if (!src) return <div className="w-28 h-40 bg-gray-100 rounded-lg" />;
  return <a href={src} target="_blank" rel="noreferrer"><img src={src} alt="Comprobante" className="w-28 h-40 object-cover rounded-lg border border-gray-200" /></a>;
}

function Tarjeta({ c, alumnos, onCambio }) {
  const [alumnoTxt, setAlumnoTxt] = useState(c.alumno_id ? `${c.alumno_nombre} #${c.alumno_id}` : '');
  const [pagos, setPagos] = useState([]);
  const [pagoId, setPagoId] = useState(c.pago_id || '');
  const [monto, setMonto] = useState(c.monto || '');
  const [ref, setRef] = useState(c.referencia || '');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!c.alumno_id) return setPagos([]);
    api.alumnos.detalle(c.alumno_id).then((a) => setPagos(a.pagos.filter((p) => !p.pagado)));
  }, [c.alumno_id]);
  useEffect(() => { setPagoId(c.pago_id || ''); }, [c.pago_id]);

  const idAlumno = () => { const m = /#(\d+)\s*$/.exec(alumnoTxt); return m ? Number(m[1]) : null; };

  async function guardar() {
    try {
      await api.comprobantes.actualizar(c.id, { alumno_id: idAlumno() || '', pago_id: pagoId || '', monto, referencia: ref });
      setMsg(''); onCambio();
    } catch (e) { setMsg(e.message); }
  }
  async function aprobar() {
    try { await guardar(); await api.comprobantes.aprobar(c.id, pagoId || undefined); onCambio(); } catch (e) { setMsg(e.message); }
  }
  async function rechazar() {
    const nota = window.prompt('Motivo del rechazo (se enviará al encargado por correo)');
    if (nota === null) return;
    if (!nota.trim()) { setMsg('Escribe el motivo del rechazo'); return; }
    try { await api.comprobantes.rechazar(c.id, nota.trim()); onCambio(); } catch (e) { setMsg(e.message); }
  }

  const pendiente = c.estado === 'requiere_alumno' || c.estado === 'por_verificar';

  return (
    <div className="card flex flex-col sm:flex-row gap-4">
      <Miniatura id={c.id} />
      <div className="flex-1 min-w-0 text-sm">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {(c.flags || []).map((f) => FLAGS[f] && <span key={f} className={'badge badge-' + FLAGS[f][1]}>{FLAGS[f][0]}</span>)}
          {c.estado === 'confirmado' && <span className="badge badge-verde">Confirmado</span>}
          {c.estado === 'rechazado' && <span className="badge badge-rojo">Rechazado</span>}
        </div>
        <p><b>{c.banco || 'Banco ?'}</b> · {c.monto != null ? 'L. ' + Number(c.monto).toFixed(2) : 'monto ?'} · {c.fecha_transferencia ? new Date(c.fecha_transferencia).toLocaleDateString('es-HN', { timeZone: 'UTC' }) : 'fecha ?'} {c.hora || ''}</p>
        <p className="text-gray-500">De: {c.nombre_remitente || '—'} → {c.nombre_destinatario || '—'} {c.cuenta_destino ? '(' + c.cuenta_destino + ')' : ''}</p>
        {c.deposito_probable && pendiente0(c) && (
          <p className="mt-1 text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1">
            Depósito probable en el banco: L. {Number(c.deposito_probable.monto).toFixed(2)}
            {c.deposito_probable.fecha ? ' el ' + new Date(c.deposito_probable.fecha).toLocaleDateString('es-HN', { timeZone: 'UTC' }) : ''}
            {c.deposito_probable.descripcion ? ' · ' + c.deposito_probable.descripcion : ''}. Si lo reconoces, aprueba el pago.
          </p>
        )}
        {c.texto_notas && <p className="text-gray-500">Comentario del pago: “{c.texto_notas}”</p>}
        {c.alumno_origen && ORIGEN[c.alumno_origen] && c.alumno_nombre && <p className="text-gray-500">Alumno asignado {ORIGEN[c.alumno_origen]}.</p>}
        <p className="text-gray-500">Subido por {c.subido_por} ({c.subido_tipo === 'alumno' ? 'alumno' : 'administración'})</p>

        {pendiente ? (
          <div className="grid sm:grid-cols-2 gap-2 mt-3">
            <label>Alumno {c.estado === 'requiere_alumno' && <span className="text-red-600">· indica de quién es</span>}
              <input list="lista-alumnos" value={alumnoTxt} onChange={(e) => setAlumnoTxt(e.target.value)} onBlur={() => idAlumno() !== c.alumno_id && idAlumno() && guardar()} placeholder="Escribe el nombre..." />
            </label>
            <label>Cobro que paga
              <select value={pagoId} onChange={(e) => setPagoId(e.target.value)}>
                <option value="">Selecciona...</option>
                {pagos.map((p) => <option key={p.id} value={p.id}>{p.periodo} · L. {(Number(p.monto) + Number(p.recargo || 0)).toFixed(2)}</option>)}
              </select>
            </label>
            <label>Monto (L.)<input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} /></label>
            <label>Referencia<input value={ref} onChange={(e) => setRef(e.target.value)} /></label>
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              <button onClick={aprobar}>Aprobar pago</button>
              <button className="secondary" onClick={guardar}>Guardar datos</button>
              <button className="secondary text-red-600" onClick={rechazar}>Rechazar</button>
            </div>
          </div>
        ) : c.alumno_nombre && <p className="mt-2">Alumno: {c.alumno_nombre}</p>}
        {msg && <p className="text-red-600 mt-2">{msg}</p>}
      </div>
    </div>
  );
}

export default function Comprobantes() {
  const [lista, setLista] = useState([]);
  const [alumnos, setAlumnos] = useState([]);
  const [tab, setTab] = useState('');
  const [alumnoTxt, setAlumnoTxt] = useState('');
  const [codigo, setCodigo] = useState('');
  const [conf, setConf] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef();

  const cargar = () => api.comprobantes.listar(tab).then(setLista).catch((e) => setMsg(e.message));
  useEffect(() => { cargar(); }, [tab]);
  useEffect(() => { api.alumnos.listar({}).then(setAlumnos); }, []);

  async function verificar(v) {
    setCodigo(v); setConf(null);
    if (v.trim().length < 6) return;
    try { setConf({ alumno: await api.alumnos.porCodigo(v.trim()) }); } catch (err) { setConf({ error: err.message }); }
  }
  function confirmarCodigo() {
    setAlumnoTxt(`${conf.alumno.nombre_completo} · ${conf.alumno.codigo} #${conf.alumno.id}`);
    setCodigo(''); setConf(null);
  }

  async function subir(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const m = /#(\d+)\s*$/.exec(alumnoTxt);
    setSubiendo(true); setMsg('Leyendo comprobante(s)...');
    let errores = [];
    for (const f of files) {
      try { await api.comprobantes.subir(await comprimirImagen(f), m ? Number(m[1]) : undefined); }
      catch (err) { errores.push(f.name + ': ' + err.message); }
    }
    setSubiendo(false); fileRef.current.value = '';
    setMsg(errores.length ? errores.join(' | ') : 'Listo. Revisa los datos leídos.');
    cargar();
  }

  return (
    <div>
      <h2>Comprobantes de pago</h2>
      <datalist id="lista-alumnos">{alumnos.map((a) => <option key={a.id} value={`${a.nombre_completo} · ${a.codigo} #${a.id}`} />)}</datalist>

      <div className="card">
        <h3>Subir comprobante</h3>
        <p className="text-sm text-gray-500 mb-3">
          Sube la captura o foto. El sistema lee banco, monto, fecha y referencia, y busca al alumno por el nombre de quien pagó.
          Si el recibo no trae nombre (por ejemplo, agente bancario), podrás indicar el alumno aquí o después. Puedes elegir varias imágenes a la vez.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <label>Alumno (opcional)
            <input list="lista-alumnos" value={alumnoTxt} onChange={(e) => setAlumnoTxt(e.target.value)} placeholder="Si ya sabes de quién es" />
          </label>
          <label>Código de alumno (opcional)
            <input value={codigo} onChange={(e) => verificar(e.target.value)} placeholder="Ej. 202601" inputMode="numeric" />
          </label>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={subir} disabled={subiendo} className="w-auto" />
        </div>
        {conf && conf.error && <p className="text-sm text-red-600 mt-2">{conf.error}</p>}
        {conf && conf.alumno && (
          <div className="bg-amber-50 rounded-xl p-3 mt-3 text-sm">
            <p>¿El código {conf.alumno.codigo} es de <b>{conf.alumno.nombre_completo}</b>?</p>
            <div className="flex gap-2 mt-2">
              <button onClick={confirmarCodigo}>Sí, es él/ella</button>
              <button className="secondary" onClick={() => { setCodigo(''); setConf(null); }}>No, corregir</button>
            </div>
          </div>
        )}
        {msg && <p className="text-sm text-gray-500 mt-2">{msg}</p>}
      </div>

      <div className="flex gap-2 mb-4">
        {[['', 'Por revisar'], ['confirmado', 'Confirmados'], ['rechazado', 'Rechazados']].map(([k, n]) => (
          <button key={k} className={tab === k ? '' : 'secondary'} onClick={() => setTab(k)}>{n}</button>
        ))}
      </div>
      {lista.length === 0 && <p className="text-sm text-gray-500">No hay comprobantes en esta lista.</p>}
      {lista.map((c) => <Tarjeta key={c.id + '-' + c.estado + '-' + (c.alumno_id || 0)} c={c} alumnos={alumnos} onCambio={cargar} />)}
    </div>
  );
}

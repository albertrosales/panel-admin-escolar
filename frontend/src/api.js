const BASE = import.meta.env.VITE_API_URL || '/api';
const ORIGIN = BASE.replace(/\/api\/?$/, '');

export function resolverUrlArchivo(url) {
  if (!url) return url;
  if (/^https?:\/\//.test(url)) return url;
  return ORIGIN + url;
}

// ---------- Sesión de administración ----------
function getToken() {
  return localStorage.getItem('token');
}

export function guardarSesion(token, usuario) {
  localStorage.setItem('token', token);
  localStorage.setItem('usuario', JSON.stringify(usuario));
}

export function cerrarSesion() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
}

export function obtenerUsuario() {
  const raw = localStorage.getItem('usuario');
  return raw ? JSON.parse(raw) : null;
}

export function haySesion() {
  return !!getToken();
}

// ---------- Sesión del portal (alumnos / profesores) ----------
export function guardarSesionPortal(token, usuario) {
  localStorage.setItem('portal_token', token);
  localStorage.setItem('portal_usuario', JSON.stringify(usuario));
}

export function cerrarSesionPortal() {
  localStorage.removeItem('portal_token');
  localStorage.removeItem('portal_usuario');
}

export function obtenerUsuarioPortal() {
  const raw = localStorage.getItem('portal_usuario');
  return raw ? JSON.parse(raw) : null;
}

export function haySesionPortal() {
  return !!localStorage.getItem('portal_token');
}

async function request(path, options) {
  options = options || {};
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(BASE + path, { headers, ...options });

  if (res.status === 401) {
    cerrarSesion();
    window.location.href = '/login';
    throw new Error('Sesión expirada');
  }
  if (!res.ok) throw new Error((await res.json()).error || 'Error de red');
  return res.json();
}

async function requestPortal(path, options) {
  options = options || {};
  const token = localStorage.getItem('portal_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(BASE + path, { headers, ...options });

  if (res.status === 401 && path !== '/portal/login') {
    cerrarSesionPortal();
    window.location.href = '/portal/login';
    throw new Error('Sesión expirada');
  }
  if (!res.ok) throw new Error((await res.json()).error || 'Error de red');
  return res.json();
}

export async function imagenComprobante(id) {
  const res = await fetch(BASE + '/comprobantes/' + id + '/imagen', { headers: { Authorization: 'Bearer ' + getToken() } });
  if (!res.ok) throw new Error('Sin imagen');
  return URL.createObjectURL(await res.blob());
}

// Descarga una copia de seguridad (archivo comprimido) con la sesión actual
export async function descargarRespaldo(colegioId) {
  const res = await fetch(BASE + '/respaldos/exportar' + (colegioId ? '?colegio_id=' + colegioId : ''), { headers: { Authorization: 'Bearer ' + getToken() } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo descargar');
  const m = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a'); a.href = url; a.download = m ? m[1] : 'respaldo.json.gz'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function descargarPlantilla(tipo) {
  const res = await fetch(BASE + '/importacion/plantilla/' + tipo, { headers: { Authorization: 'Bearer ' + getToken() } });
  if (!res.ok) throw new Error('No se pudo descargar la plantilla');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a'); a.href = url; a.download = 'plantilla_' + tipo + '.xlsx'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// SACE: mismas operaciones para el panel (admin) y para el portal docente
export function saceApi(portal) {
  const base = portal ? '/portal-sace' : '/sace';
  const rq = portal ? requestPortal : request;
  return {
    clases: () => rq(base + '/clases'),
    guardarParciales: (id, parciales) => rq(base + '/' + id + '/parciales', { method: 'PUT', body: JSON.stringify({ parciales }) }),
    datos: (id, justificadas) => rq(base + '/' + id + '/datos?justificadas=' + (justificadas ? 1 : 0)),
    config: () => rq(base + '/config'),
    guardarConfig: (d) => rq(base + '/config', { method: 'PUT', body: JSON.stringify(d) }),
    async descargar(id, datos) {
      const token = portal ? localStorage.getItem('portal_token') : getToken();
      const res = await fetch(BASE + base + '/' + id + '/xls', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(datos) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo generar');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a'); a.href = url; const m = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || ''); a.download = m ? m[1] : 'SACE.xls'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  };
}

export const api = {
  importacion: {
    analizar: (d) => request('/importacion/analizar', { method: 'POST', body: JSON.stringify(d) }),
    importar: (d) => request('/importacion/importar', { method: 'POST', body: JSON.stringify(d) })
  },
  auth: {
    login: (correo, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ correo, password }) })
  },
  portal: {
    login: (username, password, colegio_id) =>
      requestPortal('/portal/login', { method: 'POST', body: JSON.stringify({ username, password, colegio_id }) }),
    me: () => requestPortal('/portal/me'),
    subirComprobante: (imagen, codigo) => requestPortal('/portal-comprobantes', { method: 'POST', body: JSON.stringify({ imagen, codigo }) }),
    verificarCodigo: (codigo) => requestPortal('/portal-comprobantes/codigo/' + encodeURIComponent(codigo)),
    misComprobantes: () => requestPortal('/portal-comprobantes'),
    matricula: () => requestPortal('/portal-matricula'),
    solicitarMatricula: (data) => requestPortal('/portal-matricula', { method: 'POST', body: JSON.stringify(data) })
  },
  grados: {
    listar: (params) => request('/grados?' + new URLSearchParams(params)),
    crear: (data) => request('/grados', { method: 'POST', body: JSON.stringify(data) }),
    crearEnMoodle: (id) => request('/grados/' + id + '/crear-en-moodle', { method: 'POST', body: JSON.stringify({}) }),
    asignarSeccion: (id, seccion) => request('/grados/' + id, { method: 'PATCH', body: JSON.stringify({ seccion }) }),
    listarCategoriasMoodle: (params) => request('/grados/categorias-moodle?' + new URLSearchParams(params))
  },
  gastos: {
    listar: (q) => request('/gastos?' + new URLSearchParams(q || {})),
    categorias: () => request('/gastos/categorias'),
    crearCategoria: (nombre) => request('/gastos/categorias', { method: 'POST', body: JSON.stringify({ nombre }) }),
    borrarCategoria: (id) => request('/gastos/categorias/' + id, { method: 'DELETE' }),
    crear: (d) => request('/gastos', { method: 'POST', body: JSON.stringify(d) }),
    editar: (id, d) => request('/gastos/' + id, { method: 'PUT', body: JSON.stringify(d) }),
    borrar: (id) => request('/gastos/' + id, { method: 'DELETE' })
  },
  ingresos: {
    listar: (q) => request('/ingresos?' + new URLSearchParams(q || {})),
    categorias: () => request('/ingresos/categorias'),
    crearCategoria: (nombre) => request('/ingresos/categorias', { method: 'POST', body: JSON.stringify({ nombre }) }),
    borrarCategoria: (id) => request('/ingresos/categorias/' + id, { method: 'DELETE' }),
    crear: (d) => request('/ingresos', { method: 'POST', body: JSON.stringify(d) }),
    editar: (id, d) => request('/ingresos/' + id, { method: 'PUT', body: JSON.stringify(d) }),
    borrar: (id) => request('/ingresos/' + id, { method: 'DELETE' })
  },
  finanzas: { resumen: (q) => request('/finanzas/resumen?' + new URLSearchParams(q || {})) },
  eventos: {
    listar: () => request('/eventos'),
    crear: (d) => request('/eventos', { method: 'POST', body: JSON.stringify(d) }),
    editar: (id, d) => request('/eventos/' + id, { method: 'PUT', body: JSON.stringify(d) }),
    borrar: (id) => request('/eventos/' + id, { method: 'DELETE' }),
    boletos: (id, q) => request('/eventos/' + id + '/boletos?' + new URLSearchParams(q || {})),
    vender: (id, d) => request('/eventos/' + id + '/boletos', { method: 'POST', body: JSON.stringify(d) }),
    pagar: (bid, d) => request('/eventos/boletos/' + bid + '/pagar', { method: 'POST', body: JSON.stringify(d || {}) }),
    enviarBoleto: (bid, correo) => request('/eventos/boletos/' + bid + '/enviar', { method: 'POST', body: JSON.stringify({ correo }) }),
    anular: (bid) => request('/eventos/boletos/' + bid + '/anular', { method: 'POST' }),
    escanear: (codigo, evento_id) => request('/eventos/escanear', { method: 'POST', body: JSON.stringify({ codigo, evento_id }) })
  },
  correoEnvio: {
    estado: () => request('/correo-oauth/estado'),
    iniciar: () => request('/correo-oauth/iniciar'),
    desconectar: () => request('/correo-oauth', { method: 'DELETE' })
  },
  alumnos: {
    enviarCredenciales: (id, data) => request('/alumnos/' + id + '/credenciales', { method: 'POST', body: JSON.stringify(data || {}) }),
    listar: (params) => request('/alumnos?' + new URLSearchParams(params)),
    detalle: (id) => request('/alumnos/' + id),
    porCodigo: (codigo) => request('/alumnos/por-codigo/' + encodeURIComponent(codigo)),
    crear: (data) => request('/alumnos', { method: 'POST', body: JSON.stringify(data) }),
    actualizar: (id, data) => request('/alumnos/' + id, { method: 'PATCH', body: JSON.stringify(data) }),
    matricular: (id, data) => request('/alumnos/' + id + '/matricular', { method: 'POST', body: JSON.stringify(data) }),
    evaluarEstado: (id) => request('/alumnos/' + id + '/evaluar-estado', { method: 'POST' }),
    darDeBaja: (id, motivo) => request('/alumnos/' + id + '/dar-de-baja', { method: 'POST', body: JSON.stringify({ motivo }) }),
    reactivar: (id) => request('/alumnos/' + id + '/reactivar', { method: 'POST' })
  },
  profesores: {
    enviarCredenciales: (id, data) => request('/profesores/' + id + '/credenciales', { method: 'POST', body: JSON.stringify(data || {}) }),
    listar: (params) => request('/profesores?' + new URLSearchParams(params)),
    detalle: (id) => request('/profesores/' + id),
    crear: (data) => request('/profesores', { method: 'POST', body: JSON.stringify(data) }),
    actualizar: (id, data) => request('/profesores/' + id, { method: 'PATCH', body: JSON.stringify(data) }),
    agregarResena: (id, data) => request('/profesores/' + id + '/resenas', { method: 'POST', body: JSON.stringify(data) }),
    darDeBaja: (id, motivo) => request('/profesores/' + id + '/dar-de-baja', { method: 'POST', body: JSON.stringify({ motivo }) }),
    reactivar: (id) => request('/profesores/' + id + '/reactivar', { method: 'POST' })
  },
  pagos: {
    crear: (data) => request('/pagos', { method: 'POST', body: JSON.stringify(data) }),
    marcarPagado: (id, metodo_pago) => request('/pagos/' + id + '/marcar-pagado', { method: 'POST', body: JSON.stringify({ metodo_pago }) }),
    crearPlan: (data) => request('/pagos/planes', { method: 'POST', body: JSON.stringify(data) }),
    reporteEstado: (colegio_id) => request('/pagos/reporte-estado?colegio_id=' + colegio_id)
  },
  reportes: {
    constancia: (alumnoId) => request('/reportes/constancia/' + alumnoId, { method: 'POST' }),
    reportePago: (alumnoId) => request('/reportes/reporte-pago/' + alumnoId, { method: 'POST' }),
    informeDocente: (profesorId) => request('/reportes/informe-docente/' + profesorId, { method: 'POST' })
  },
  estadisticas: {
    resumen: (colegio_id) => request('/estadisticas/resumen?colegio_id=' + colegio_id),
    ingresosPorMes: (colegio_id) => request('/estadisticas/ingresos-por-mes?colegio_id=' + colegio_id),
    alumnosNuevosPorMes: (colegio_id) => request('/estadisticas/alumnos-nuevos-por-mes?colegio_id=' + colegio_id),
    bajasPorMes: (colegio_id) => request('/estadisticas/bajas-por-mes?colegio_id=' + colegio_id)
  },
  comprobantes: {
    listar: (estado) => request('/comprobantes' + (estado ? '?estado=' + estado : '')),
    subir: (imagen, alumno_id) => request('/comprobantes', { method: 'POST', body: JSON.stringify({ imagen, alumno_id }) }),
    actualizar: (id, data) => request('/comprobantes/' + id, { method: 'PATCH', body: JSON.stringify(data) }),
    aprobar: (id, pago_id) => request('/comprobantes/' + id + '/aprobar', { method: 'POST', body: JSON.stringify({ pago_id }) }),
    rechazar: (id, nota) => request('/comprobantes/' + id + '/rechazar', { method: 'POST', body: JSON.stringify({ nota }) })
  },
  soporte: {
    listar: (q) => request('/soporte?' + new URLSearchParams(q || {})),
    crear: (d) => request('/soporte', { method: 'POST', body: JSON.stringify(d) }),
    ver: (id) => request('/soporte/' + id),
    responder: (id, mensaje) => request('/soporte/' + id + '/mensajes', { method: 'POST', body: JSON.stringify({ mensaje }) }),
    estado: (id, estado) => request('/soporte/' + id, { method: 'PATCH', body: JSON.stringify({ estado }) })
  },
  auditoria: (q) => request('/auditoria?' + new URLSearchParams(q || {})),
  respaldos: {
    listar: () => request('/respaldos')
  },
  colegio: {
    contexto: () => request('/colegio/contexto'),
    guardarMarca: (d) => request('/colegio/marca', { method: 'PUT', body: JSON.stringify(d) })
  },
  proveedor: {
    resumen: () => request('/proveedor/resumen'),
    colegios: () => request('/proveedor/colegios'),
    crearColegio: (d) => request('/proveedor/colegios', { method: 'POST', body: JSON.stringify(d) }),
    editarColegio: (id, d) => request('/proveedor/colegios/' + id, { method: 'PUT', body: JSON.stringify(d) }),
    usuarios: (id) => request('/proveedor/colegios/' + id + '/usuarios'),
    editarUsuario: (id, uid, d) => request('/proveedor/colegios/' + id + '/usuarios/' + uid, { method: 'PUT', body: JSON.stringify(d) }),
    extender: (id, dias) => request('/proveedor/colegios/' + id + '/extender', { method: 'POST', body: JSON.stringify({ dias }) }),
    entrar: (id) => request('/proveedor/colegios/' + id + '/entrar', { method: 'POST' }),
    planes: () => request('/proveedor/planes'),
    crearPlan: (d) => request('/proveedor/planes', { method: 'POST', body: JSON.stringify(d) }),
    editarPlan: (id, d) => request('/proveedor/planes/' + id, { method: 'PUT', body: JSON.stringify(d) })
  },
  matriculas: {
    periodos: () => request('/matriculas/periodos'),
    crearPeriodo: (d) => request('/matriculas/periodos', { method: 'POST', body: JSON.stringify(d) }),
    editarPeriodo: (id, d) => request('/matriculas/periodos/' + id, { method: 'PUT', body: JSON.stringify(d) }),
    eliminarPeriodo: (id) => request('/matriculas/periodos/' + id, { method: 'DELETE' }),
    solicitudes: (q) => request('/matriculas/solicitudes?' + new URLSearchParams(q || {})),
    eliminarSolicitud: (id) => request('/matriculas/solicitudes/' + id, { method: 'DELETE' }),
    aprobar: (id) => request('/matriculas/solicitudes/' + id + '/aprobar', { method: 'POST' }),
    rechazar: (id, motivo) => request('/matriculas/solicitudes/' + id + '/rechazar', { method: 'POST', body: JSON.stringify({ motivo }) })
  },
  correos: {
    estado: () => request('/correos/estado'),
    guardarEstado: (data) => request('/correos/estado', { method: 'PUT', body: JSON.stringify(data) }),
    plantillas: () => request('/correos/plantillas'),
    guardarPlantilla: (clave, data) => request('/correos/plantillas/' + clave, { method: 'PUT', body: JSON.stringify(data) }),
    restaurar: (clave) => request('/correos/plantillas/' + clave + '/restaurar', { method: 'POST' }),
    vistaPrevia: (data) => request('/correos/vista-previa', { method: 'POST', body: JSON.stringify(data) }),
    prueba: (data) => request('/correos/prueba', { method: 'POST', body: JSON.stringify(data) }),
    enviar: (data) => request('/correos/enviar', { method: 'POST', body: JSON.stringify(data) }),
    historial: (estado) => request('/correos/historial' + (estado ? '?estado=' + estado : '')),
    reintentar: (id) => request('/correos/' + id + '/reintentar', { method: 'POST' })
  },
  conciliacion: {
    subir: (archivo, nombre, cuenta) => request('/conciliacion', { method: 'POST', body: JSON.stringify({ archivo, nombre, cuenta }) })
  },
  calendario: {
    mes: (mes) => request('/calendario?mes=' + mes),
    dia: (fecha) => request('/calendario/dia?fecha=' + fecha),
    crear: (data) => request('/calendario', { method: 'POST', body: JSON.stringify(data) }),
    borrar: (id) => request('/calendario/' + id, { method: 'DELETE' })
  },
  asistencia: {
    lista: (grado_id, fecha) => request('/asistencia?grado_id=' + grado_id + '&fecha=' + fecha),
    guardar: (data) => request('/asistencia', { method: 'POST', body: JSON.stringify(data) }),
    alumno: (id) => request('/asistencia/alumno/' + id)
  },
  notas: {
    alumno: (id) => request('/notas/alumno/' + id),
    boletin: (id) => request('/notas/boletin/' + id, { method: 'POST' })
  },
  admin: {
    sincronizarCodigos: () => request('/admin/sincronizar-codigos-moodle', { method: 'POST' }),
    cuentas: () => request('/admin/cuentas'),
    guardarCuentas: (cuentas_destino, conciliacion_monto_fecha) => request('/admin/cuentas', { method: 'POST', body: JSON.stringify({ cuentas_destino, conciliacion_monto_fecha }) }),
    mora: () => request('/admin/mora'),
    guardarMora: (data) => request('/admin/mora', { method: 'POST', body: JSON.stringify(data) }),
    configurarDiaPago: (colegio_id, dia_pago_mensual) =>
      request('/admin/configurar-dia-pago', { method: 'POST', body: JSON.stringify({ colegio_id, dia_pago_mensual }) }),
    generarCobrosMensuales: () => request('/admin/generar-cobros-mensuales', { method: 'POST' })
  }
};

const BASE = import.meta.env.VITE_API_URL || '/api';
const ORIGIN = BASE.replace(/\/api\/?$/, '');

export function resolverUrlArchivo(url) {
  if (!url) return url;
  if (/^https?:\/\//.test(url)) return url;
  return ORIGIN + url;
}

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

async function request(path, options) {
  options = options || {};
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(BASE + path, {
    headers: headers,
    ...options
  });

  if (res.status === 401) {
    cerrarSesion();
    window.location.href = '/login';
    throw new Error('Sesión expirada');
  }

  if (!res.ok) throw new Error((await res.json()).error || 'Error de red');
  return res.json();
}

export const api = {
  auth: {
    login: (correo, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ correo, password }) })
  },
  grados: {
    listar: (params) => request('/grados?' + new URLSearchParams(params))
  },
  alumnos: {
    listar: (params) => request('/alumnos?' + new URLSearchParams(params)),
    detalle: (id) => request('/alumnos/' + id),
    crear: (data) => request('/alumnos', { method: 'POST', body: JSON.stringify(data) }),
    matricular: (id, data) => request('/alumnos/' + id + '/matricular', { method: 'POST', body: JSON.stringify(data) }),
    evaluarEstado: (id) => request('/alumnos/' + id + '/evaluar-estado', { method: 'POST' })
  },
  profesores: {
    listar: (params) => request('/profesores?' + new URLSearchParams(params)),
    detalle: (id) => request('/profesores/' + id),
    crear: (data) => request('/profesores', { method: 'POST', body: JSON.stringify(data) }),
    agregarResena: (id, data) => request('/profesores/' + id + '/resenas', { method: 'POST', body: JSON.stringify(data) })
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
  }
};

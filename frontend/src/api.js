const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Error de red');
  return res.json();
}

export const api = {
  alumnos: {
    listar: (params) => request(`/alumnos?${new URLSearchParams(params)}`),
    detalle: (id) => request(`/alumnos/${id}`),
    crear: (data) => request('/alumnos', { method: 'POST', body: JSON.stringify(data) }),
    evaluarEstado: (id) => request(`/alumnos/${id}/evaluar-estado`, { method: 'POST' })
  },
  profesores: {
    listar: (params) => request(`/profesores?${new URLSearchParams(params)}`),
    detalle: (id) => request(`/profesores/${id}`),
    crear: (data) => request('/profesores', { method: 'POST', body: JSON.stringify(data) }),
    agregarResena: (id, data) => request(`/profesores/${id}/resenas`, { method: 'POST', body: JSON.stringify(data) })
  },
  pagos: {
    crear: (data) => request('/pagos', { method: 'POST', body: JSON.stringify(data) }),
    marcarPagado: (id, metodo_pago) => request(`/pagos/${id}/marcar-pagado`, { method: 'POST', body: JSON.stringify({ metodo_pago }) }),
    crearPlan: (data) => request('/pagos/planes', { method: 'POST', body: JSON.stringify(data) }),
    reporteEstado: (colegio_id) => request(`/pagos/reporte-estado?colegio_id=${colegio_id}`)
  },
  reportes: {
    constancia: (alumnoId) => request(`/reportes/constancia/${alumnoId}`, { method: 'POST' }),
    reportePago: (alumnoId) => request(`/reportes/reporte-pago/${alumnoId}`, { method: 'POST' }),
    informeDocente: (profesorId) => request(`/reportes/informe-docente/${profesorId}`, { method: 'POST' })
  }
};

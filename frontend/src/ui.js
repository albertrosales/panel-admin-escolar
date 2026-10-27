// Estado global de interfaz: peticiones en curso y avisos (toasts)
let pendientes = 0;
const oyentes = new Set();
let avisos = [];
let seq = 1;
const emitir = () => oyentes.forEach((f) => f());

export const suscribir = (f) => { oyentes.add(f); return () => oyentes.delete(f); };
export const estado = () => ({ pendientes, avisos });

export function inicioPeticion() { pendientes++; emitir(); }
export function finPeticion() { pendientes = Math.max(0, pendientes - 1); emitir(); }

export function aviso(texto, tipo = 'ok') {
  if (avisos.some((a) => a.texto === texto && Date.now() - a.t < 1500)) return;
  const id = seq++;
  avisos = [...avisos.slice(-3), { id, texto, tipo, t: Date.now() }];
  emitir();
  setTimeout(() => cerrarAviso(id), tipo === 'error' ? 6000 : 3200);
}
export function cerrarAviso(id) { avisos = avisos.filter((a) => a.id !== id); emitir(); }

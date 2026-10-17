import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { LayoutDashboard, Users, GraduationCap, UserPlus, BookOpen, Settings, LogOut, CalendarDays, ClipboardCheck, Receipt, Landmark, Mail, FileCheck, Building2, LifeBuoy, ScrollText } from 'lucide-react';
import { api, haySesion, haySesionPortal, cerrarSesion, obtenerUsuario, guardarSesion } from './api';
import Login from './pages/Login';
import PortalLogin from './pages/PortalLogin';
import Portal from './pages/Portal';
import Dashboard from './pages/Dashboard';
import Alumnos from './pages/Alumnos';
import AlumnoDetalle from './pages/AlumnoDetalle';
import NuevoAlumno from './pages/NuevoAlumno';
import Profesores from './pages/Profesores';
import NuevoProfesor from './pages/NuevoProfesor';
import NuevoUsuario from './pages/NuevoUsuario';
import Grados from './pages/Grados';
import Configuracion from './pages/Configuracion';
import Comprobantes from './pages/Comprobantes';
import Conciliacion from './pages/Conciliacion';
import Notificaciones from './pages/Notificaciones';
import Matricula from './pages/Matricula';
import Asistencia from './pages/Asistencia';
import Soporte from './pages/Soporte';
import Auditoria from './pages/Auditoria';
import Proveedor from './pages/Proveedor';
import Calendario from './components/Calendario';

function RutaProtegida({ children }) {
  if (!haySesion()) return <Navigate to="/login" replace />;
  return children;
}

function RutaPortal({ children }) {
  if (!haySesionPortal()) return <Navigate to="/portal/login" replace />;
  return children;
}

const NAV = [
  { to: '/', label: 'Resumen', icon: LayoutDashboard, end: true },
  { to: '/alumnos', label: 'Alumnos', icon: Users },
  { to: '/profesores', label: 'Profesores', icon: GraduationCap },
  { to: '/grados', label: 'Clases', icon: BookOpen },
  { to: '/comprobantes', label: 'Comprobantes', icon: Receipt, modulo: 'comprobantes' },
  { to: '/conciliacion', label: 'Estado de cuenta', icon: Landmark, modulo: 'conciliacion' },
  { to: '/matricula', label: 'Matrícula', icon: FileCheck, modulo: 'matricula' },
  { to: '/notificaciones', label: 'Notificaciones', icon: Mail, modulo: 'notificaciones' },
  { to: '/asistencia', label: 'Asistencia', icon: ClipboardCheck, modulo: 'asistencia' },
  { to: '/usuarios/nuevo', label: 'Nuevo usuario', icon: UserPlus },
  { to: '/auditoria', label: 'Auditoría', icon: ScrollText, roles: ['admin', 'director', 'superadmin'] },
  { to: '/soporte', label: 'Soporte', icon: LifeBuoy },
  { to: '/configuracion', label: 'Configuración', icon: Settings },
  { to: '/proveedor', label: 'Proveedor', icon: Building2, soloProveedor: true }
];

function volverAlProveedor() {
  const t = localStorage.getItem('token_proveedor');
  const u = localStorage.getItem('usuario_proveedor');
  if (t && u) {
    guardarSesion(t, JSON.parse(u));
    localStorage.removeItem('token_proveedor'); localStorage.removeItem('usuario_proveedor');
    window.location.href = '/proveedor';
  } else { cerrarSesion(); window.location.href = '/login'; }
}

function Aviso({ ctx }) {
  if (ctx.soporte) {
    return (
      <div className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2 mb-4 flex flex-wrap items-center justify-between gap-2">
        <span>Modo soporte en <b>{ctx.colegio.nombre}</b>. Tus acciones quedan registradas.</span>
        <button className="secondary !text-white !border-white/40 hover:!bg-white/10" onClick={volverAlProveedor}>Volver al panel del proveedor</button>
      </div>
    );
  }
  const l = ctx.licencia;
  if (l.estado === 'vencida') return <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 mb-4">La licencia venció el {l.vence}. Solo puedes consultar información hasta renovarla. Comunícate con el proveedor.</div>;
  if (l.estado === 'prueba') return <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-lg px-4 py-2 mb-4">Prueba gratuita: {l.dias_restantes != null ? 'quedan ' + l.dias_restantes + ' día(s)' : 'activa'}.</div>;
  if (l.dias_restantes != null && l.dias_restantes <= 7) return <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-2 mb-4">Tu licencia vence en {l.dias_restantes} día(s) ({l.vence}). Comunícate con el proveedor para renovarla.</div>;
  return null;
}

function Panel() {
  const usuario = obtenerUsuario();
  const [cal, setCal] = useState(false);
  const [ctx, setCtx] = useState(null);
  const [errorCtx, setErrorCtx] = useState('');
  const cargarCtx = () => api.colegio.contexto().then(setCtx).catch((e) => setErrorCtx(e.message));
  useEffect(() => { cargarCtx(); }, []);

  function salir() { cerrarSesion(); window.location.href = '/login'; }

  const color = ctx && ctx.colegio.color;
  const items = NAV.filter((n) => (!n.modulo || !ctx || ctx.modulos[n.modulo] !== false) && (!n.soloProveedor || (ctx && ctx.es_proveedor)) && (!n.roles || (usuario && n.roles.includes(usuario.rol))));
  const suspendida = ctx && ctx.licencia.estado === 'suspendida' && !ctx.soporte && !ctx.es_proveedor;

  return (
    <div className="layout">
      {color && <style>{`button:not(.secondary){background:${color}} button:not(.secondary):hover{filter:brightness(.9)} .sidebar a.active{color:${color};background:${color}1a}`}</style>}
      <aside className="sidebar">
        <div className="hidden md:flex items-center gap-2 px-3 mb-5 mt-1">
          {ctx && ctx.colegio.tiene_logo && <img src={'/api/marca/' + ctx.colegio.id + '/logo'} alt="" className="h-8 w-auto max-w-[44px] object-contain" />}
          <h1 className="!block !px-0 !mb-0 !mt-0 whitespace-normal leading-tight">{ctx ? ctx.colegio.nombre : 'Campus Virtual'}</h1>
        </div>
        <nav className="flex md:flex-col gap-1 flex-1">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <n.icon size={17} strokeWidth={2} /> <span className="hidden sm:inline">{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto pt-6 hidden md:block">
          {usuario && <p className="text-xs text-gray-500 px-3 mb-2">{usuario.nombre}</p>}
          <button className="secondary w-full flex items-center justify-center gap-2" onClick={salir}>
            <LogOut size={15} /> Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="content">
        {errorCtx && <p className="text-sm text-red-600 mb-3">{errorCtx}</p>}
        {ctx && <Aviso ctx={ctx} />}
        {suspendida ? (
          <div className="card">
            <h3>Suscripción suspendida</h3>
            <p className="text-sm text-gray-600">La suscripción de tu institución está suspendida. Comunícate con el proveedor para reactivarla.</p>
          </div>
        ) : (
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/alumnos" element={<Alumnos />} />
            <Route path="/alumnos/nuevo" element={<NuevoAlumno />} />
            <Route path="/alumnos/:id" element={<AlumnoDetalle />} />
            <Route path="/profesores" element={<Profesores />} />
            <Route path="/profesores/nuevo" element={<NuevoProfesor />} />
            <Route path="/grados" element={<Grados />} />
            <Route path="/usuarios/nuevo" element={<NuevoUsuario />} />
            <Route path="/comprobantes" element={<Comprobantes />} />
            <Route path="/conciliacion" element={<Conciliacion />} />
            <Route path="/matricula" element={<Matricula />} />
            <Route path="/notificaciones" element={<Notificaciones />} />
            <Route path="/asistencia" element={<Asistencia />} />
            <Route path="/auditoria" element={<Auditoria />} />
            <Route path="/soporte" element={<Soporte esProveedor={!!(ctx && ctx.es_proveedor)} />} />
            <Route path="/configuracion" element={<Configuracion ctx={ctx} recargarCtx={cargarCtx} />} />
            <Route path="/proveedor" element={ctx && ctx.es_proveedor ? <Proveedor /> : <Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
      {!cal && (
        <button type="button" onClick={() => setCal(true)} aria-label="Abrir calendario"
          className="fixed top-4 right-4 z-30 !rounded-full !p-3 shadow-lg">
          <CalendarDays size={20} />
        </button>
      )}
      {cal && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setCal(false)} />
          <aside className="fixed lg:sticky z-50 lg:z-10 inset-x-3 top-3 lg:top-0 lg:inset-x-auto lg:w-80 lg:shrink-0 lg:h-screen lg:overflow-y-auto lg:p-4 max-h-[92vh] overflow-y-auto">
            <Calendario onClose={() => setCal(false)} />
          </aside>
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/portal/login" element={<PortalLogin />} />
        <Route path="/portal" element={<RutaPortal><Portal /></RutaPortal>} />
        <Route path="/*" element={<RutaProtegida><Panel /></RutaProtegida>} />
      </Routes>
    </BrowserRouter>
  );
}

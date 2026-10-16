import { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { LayoutDashboard, Users, GraduationCap, UserPlus, BookOpen, Settings, LogOut, CalendarDays, ClipboardCheck, Receipt, Landmark, Mail } from 'lucide-react';
import { haySesion, haySesionPortal, cerrarSesion, obtenerUsuario } from './api';
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
import Asistencia from './pages/Asistencia';
import Calendario from './components/Calendario';

function RutaProtegida({ children }) {
  if (!haySesion()) return <Navigate to="/login" replace />;
  return children;
}

function RutaPortal({ children }) {
  if (!haySesionPortal()) return <Navigate to="/portal/login" replace />;
  return children;
}

export default function App() {
  const usuario = obtenerUsuario();
  const [cal, setCal] = useState(false);

  function salir() {
    cerrarSesion();
    window.location.href = '/login';
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/portal/login" element={<PortalLogin />} />
        <Route path="/portal" element={<RutaPortal><Portal /></RutaPortal>} />
        <Route
          path="/*"
          element={
            <RutaProtegida>
              <div className="layout">
                <aside className="sidebar">
                  <h1>Campus Virtual</h1>
                  <nav className="flex md:flex-col gap-1 flex-1">
                    <NavLink to="/" end>
                      <LayoutDashboard size={17} strokeWidth={2} /> <span className="hidden sm:inline">Resumen</span>
                    </NavLink>
                    <NavLink to="/alumnos">
                      <Users size={17} strokeWidth={2} /> <span className="hidden sm:inline">Alumnos</span>
                    </NavLink>
                    <NavLink to="/profesores">
                      <GraduationCap size={17} strokeWidth={2} /> <span className="hidden sm:inline">Profesores</span>
                    </NavLink>
                    <NavLink to="/grados">
                      <BookOpen size={17} strokeWidth={2} /> <span className="hidden sm:inline">Clases</span>
                    </NavLink>
                    <NavLink to="/comprobantes">
                      <Receipt size={17} strokeWidth={2} /> <span className="hidden sm:inline">Comprobantes</span>
                    </NavLink>
                    <NavLink to="/conciliacion">
                      <Landmark size={17} strokeWidth={2} /> <span className="hidden sm:inline">Estado de cuenta</span>
                    </NavLink>
                    <NavLink to="/notificaciones">
                      <Mail size={17} strokeWidth={2} /> <span className="hidden sm:inline">Notificaciones</span>
                    </NavLink>
                    <NavLink to="/asistencia">
                      <ClipboardCheck size={17} strokeWidth={2} /> <span className="hidden sm:inline">Asistencia</span>
                    </NavLink>
                    <NavLink to="/usuarios/nuevo">
                      <UserPlus size={17} strokeWidth={2} /> <span className="hidden sm:inline">Nuevo usuario</span>
                    </NavLink>
                    <NavLink to="/configuracion">
                      <Settings size={17} strokeWidth={2} /> <span className="hidden sm:inline">Configuración</span>
                    </NavLink>
                  </nav>
                  <div className="mt-auto pt-6 hidden md:block">
                    {usuario && <p className="text-xs text-gray-500 px-3 mb-2">{usuario.nombre}</p>}
                    <button className="secondary w-full flex items-center justify-center gap-2" onClick={salir}>
                      <LogOut size={15} /> Cerrar sesión
                    </button>
                  </div>
                </aside>
                <main className="content">
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
                    <Route path="/notificaciones" element={<Notificaciones />} />
                    <Route path="/asistencia" element={<Asistencia />} />
                    <Route path="/configuracion" element={<Configuracion />} />
                  </Routes>
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
            </RutaProtegida>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

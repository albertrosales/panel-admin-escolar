import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { LayoutDashboard, Users, GraduationCap, LogOut } from 'lucide-react';
import { haySesion, cerrarSesion, obtenerUsuario } from './api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Alumnos from './pages/Alumnos';
import AlumnoDetalle from './pages/AlumnoDetalle';
import NuevoAlumno from './pages/NuevoAlumno';
import Profesores from './pages/Profesores';
import NuevoProfesor from './pages/NuevoProfesor';

function RutaProtegida({ children }) {
  if (!haySesion()) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const usuario = obtenerUsuario();

  function salir() {
    cerrarSesion();
    window.location.href = '/login';
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
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
                  </Routes>
                </main>
              </div>
            </RutaProtegida>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

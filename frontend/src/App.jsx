import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
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
                  <NavLink to="/" end>Resumen</NavLink>
                  <NavLink to="/alumnos">Alumnos</NavLink>
                  <NavLink to="/profesores">Profesores</NavLink>
                  <div style={{ marginTop: 'auto', paddingTop: 24 }}>
                    {usuario && <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>{usuario.nombre}</p>}
                    <button className="secondary" onClick={salir}>Cerrar sesión</button>
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

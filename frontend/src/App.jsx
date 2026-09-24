import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Alumnos from './pages/Alumnos';
import AlumnoDetalle from './pages/AlumnoDetalle';
import Profesores from './pages/Profesores';

export default function App() {
  return (
    <BrowserRouter>
      <div className="layout">
        <aside className="sidebar">
          <h1>Campus Virtual</h1>
          <NavLink to="/" end>Resumen</NavLink>
          <NavLink to="/alumnos">Alumnos</NavLink>
          <NavLink to="/profesores">Profesores</NavLink>
        </aside>
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/alumnos" element={<Alumnos />} />
            <Route path="/alumnos/:id" element={<AlumnoDetalle />} />
            <Route path="/profesores" element={<Profesores />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

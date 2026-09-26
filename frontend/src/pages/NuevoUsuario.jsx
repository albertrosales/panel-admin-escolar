import { useNavigate } from 'react-router-dom';
import { Users, GraduationCap } from 'lucide-react';

export default function NuevoUsuario() {
  const navigate = useNavigate();

  return (
    <div>
      <h2>Nuevo usuario</h2>
      <p className="text-sm text-gray-500 mb-5">¿Qué tipo de usuario quieres registrar?</p>
      <div className="flex flex-col sm:flex-row gap-4">
        <button
          className="card flex-1 flex flex-col items-start gap-2 !bg-white hover:bg-gray-50 cursor-pointer text-left"
          onClick={() => navigate('/alumnos/nuevo')}
        >
          <Users size={22} className="text-blue-600" />
          <span className="text-base font-semibold text-gray-900">Alumno</span>
          <span className="text-sm text-gray-500">Registrar un estudiante, matricularlo en clases y crear su acceso a Moodle.</span>
        </button>
        <button
          className="card flex-1 flex flex-col items-start gap-2 !bg-white hover:bg-gray-50 cursor-pointer text-left"
          onClick={() => navigate('/profesores/nuevo')}
        >
          <GraduationCap size={22} className="text-blue-600" />
          <span className="text-base font-semibold text-gray-900">Profesor</span>
          <span className="text-sm text-gray-500">Registrar un docente, asignarle clases/materias y crear su acceso a Moodle.</span>
        </button>
      </div>
    </div>
  );
}

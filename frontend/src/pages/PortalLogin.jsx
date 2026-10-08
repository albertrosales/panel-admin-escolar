import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api, guardarSesionPortal } from '../api';

export default function PortalLogin() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const colegioId = Number(params.get('colegio')) || 1;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const res = await api.portal.login(username, password, colegioId);
      guardarSesionPortal(res.token, res.usuario);
      navigate('/portal');
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between bg-[#0f1a35] text-white p-12">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600" />
          <span className="font-semibold tracking-tight">Campus Virtual</span>
        </div>
        <div>
          <h2 className="text-3xl font-semibold leading-tight mb-3">Tu campus, en un solo lugar.</h2>
          <p className="text-slate-300 max-w-sm">
            Consulta tus clases, calificaciones y pagos con tu cuenta de Moodle.
          </p>
        </div>
        <p className="text-xs text-slate-400">ulúa Media</p>
      </div>

      <div className="flex items-center justify-center bg-slate-50 px-6 py-12">
        <form onSubmit={enviar} className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-blue-600 mb-3">PORTAL DEL CAMPUS</p>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">Bienvenido</h1>
          <p className="text-gray-500 mb-6">Entra con tu usuario y contraseña de Moodle.</p>

          <div className="flex flex-col gap-4">
            <label className="!text-sm !text-gray-900">
              Usuario
              <input
                className="!px-4 !py-3 !rounded-xl"
                placeholder="tu usuario de Moodle"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="none"
                autoComplete="username"
                required
              />
            </label>
            <label className="!text-sm !text-gray-900">
              Contraseña
              <input
                className="!px-4 !py-3 !rounded-xl"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={cargando}
              className="!bg-gray-900 hover:!bg-black !py-3 !rounded-xl flex items-center justify-between"
            >
              <span>{cargando ? 'Entrando...' : 'Entrar al portal'}</span>
              <ArrowRight size={16} />
            </button>
          </div>

          <p className="text-center text-xs text-gray-400 mt-5">Acceso seguro · Campus Virtual</p>

          <Link
            to="/login"
            className="block text-center mt-4 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-medium text-gray-900"
          >
            Soy administrador
          </Link>
        </form>
      </div>
    </div>
  );
}

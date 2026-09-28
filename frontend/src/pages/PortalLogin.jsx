import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, guardarSesionPortal } from '../api';

export default function PortalLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const res = await api.portal.login(username, password);
      guardarSesionPortal(res.token, res.usuario);
      navigate('/portal');
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <form onSubmit={enviar} className="card w-full max-w-sm">
        <h2 className="mb-1">Portal del Campus</h2>
        <p className="text-sm text-gray-500 mb-4">Entra con tu usuario y contraseña de Moodle.</p>
        <div className="flex flex-col gap-3">
          <label>
            Usuario
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" required />
          </label>
          <label>
            Contraseña
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={cargando}>{cargando ? 'Entrando...' : 'Entrar'}</button>
        </div>
      </form>
    </div>
  );
}

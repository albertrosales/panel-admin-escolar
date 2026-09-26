import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, guardarSesion } from '../api';

export default function Login() {
  const navigate = useNavigate();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const res = await api.auth.login(correo, password);
      guardarSesion(res.token, res.usuario);
      navigate('/');
      window.location.reload();
    } catch (err) {
      setError('Correo o contraseña incorrectos.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <form onSubmit={enviar} className="card" style={{ width: 320 }}>
        <h2 style={{ marginBottom: 16 }}>Campus Virtual</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label>
            Correo
            <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
          </label>
          <label>
            Contraseña
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p style={{ color: '#c0392b' }}>{error}</p>}
          <button type="submit" disabled={cargando}>{cargando ? 'Entrando...' : 'Entrar'}</button>
        </div>
      </form>
    </div>
  );
}

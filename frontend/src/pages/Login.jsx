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
    <main className="login-shell">
      <section className="login-visual" aria-hidden="true">
        <div className="code-rain">
          <span>{'{'} auth: 'campus' {'}'}</span>
          <span>const session = await login()</span>
          <span>npm run learn</span>
          <span>&lt;build future /&gt;</span>
        </div>
        <div className="sheep-scene">
          <div className="sheep-shadow" />
          <div className="sheep">
            <div className="sheep-ear sheep-ear-left" />
            <div className="sheep-ear sheep-ear-right" />
            <div className="sheep-head">
              <i className="sheep-eye sheep-eye-left" />
              <i className="sheep-eye sheep-eye-right" />
              <i className="sheep-smile" />
            </div>
            <div className="sheep-wool"><b /><b /><b /><b /><b /></div>
            <div className="sheep-leg sheep-leg-left" />
            <div className="sheep-leg sheep-leg-right" />
          </div>
        </div>
        <div className="login-visual-copy">
          <span className="eyebrow">CAMPUS VIRTUAL</span>
          <h1>Aprender también<br /><em>es construir.</em></h1>
          <p>Tu espacio para administrar cursos, estudiantes y nuevas ideas.</p>
        </div>
      </section>

      <section className="login-panel">
        <form onSubmit={enviar} className="login-card">
          <div className="brand-mark">CV</div>
          <p className="login-kicker">Panel administrativo</p>
          <h2>Bienvenido de nuevo</h2>
          <p className="login-muted">Ingresa para continuar al Campus Virtual.</p>
          <div className="login-fields">
            <label htmlFor="correo">Correo
              <input id="correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="tu@correo.com" autoComplete="email" required />
            </label>
            <label htmlFor="password">Contraseña
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
            </label>
            {error && <p className="login-error" role="alert">{error}</p>}
            <button className="login-submit" type="submit" disabled={cargando}>
              <span>{cargando ? 'Entrando...' : 'Entrar al panel'}</span>
              {!cargando && <span aria-hidden="true">→</span>}
            </button>
          </div>
          <p className="login-footer">Acceso seguro · Campus Virtual</p>
        </form>
      </section>
    </main>
  );
}

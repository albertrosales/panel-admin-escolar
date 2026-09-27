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
        <div className="loader-scene">
          <div className="loader" aria-label="Animación de cubos">
            <div className="box box0"><div /></div>
            <div className="box box1"><div /></div>
            <div className="box box2"><div /></div>
            <div className="box box3"><div /></div>
            <div className="box box4"><div /></div>
            <div className="box box5"><div /></div>
            <div className="box box6"><div /></div>
            <div className="box box7"><div /></div>
            <div className="ground"><div /></div>
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

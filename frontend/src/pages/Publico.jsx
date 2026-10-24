import { Link } from 'react-router-dom';
import privacidadMd from '../legal/privacidad.md?raw';
import terminosMd from '../legal/terminos.md?raw';

const CORREO = 'albertrosales.tv@gmail.com';

function Marco({ titulo, children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link to="/inicio" className="flex items-center gap-3 font-semibold text-gray-900"><img src="/logo-ulua-media.png" alt="Ulúa Media" style={{ height: 40, width: 'auto' }} /><span>Ulúa Campus</span></Link>
          <nav className="text-sm flex gap-4 text-blue-700">
            <Link to="/privacidad">Privacidad</Link><Link to="/terminos">Términos</Link><Link to="/login">Ingresar</Link>
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-5 py-8 text-gray-800 leading-relaxed [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-2 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-3">
        <h1>{titulo}</h1>
        {children}
      </main>
      <footer className="max-w-3xl mx-auto px-5 py-6 text-xs text-gray-500">
        © ulúa Media · Tocoa, Colón, Honduras · <a className="underline" href={'mailto:' + CORREO}>{CORREO}</a>
      </footer>
    </div>
  );
}

export function Inicio() {
  return (
    <Marco titulo="Ulúa Campus">
      <p><strong>Ulúa Campus</strong> es una plataforma de administración escolar de <strong>ulúa Media</strong> para colegios de Honduras. Integra con Moodle para ofrecer clases virtuales.</p>
      <h2>Qué hace</h2>
      <ul>
        <li>Registro de alumnos, docentes y clases.</li>
        <li>Control de pagos, comprobantes y mensualidades.</li>
        <li>Asistencia, calificaciones y generación del SACE.</li>
        <li>Clases virtuales con Moodle: creación automática de usuarios y matrícula.</li>
        <li>Comunicación con padres de familia y alumnos por correo electrónico.</li>
      </ul>
      <h2>Uso de Gmail</h2>
      <p>Cada colegio puede conectar su propia cuenta de Gmail para que los correos de la institución (bienvenida con credenciales de acceso, avisos de pago, asistencia y comunicados) se envíen desde su dirección. La plataforma solo solicita el permiso para <strong>enviar</strong> correos. No lee, no busca ni almacena los mensajes de la cuenta. Más detalles en la <Link className="underline text-blue-700" to="/privacidad">Política de Privacidad</Link>.</p>
      <p><Link className="underline text-blue-700" to="/login">Ingresar al sistema</Link> · <Link className="underline text-blue-700" to="/portal/login">Portal de alumnos y docentes</Link></p>
    </Marco>
  );
}

const e = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Convierte el texto en Markdown (títulos, listas, negritas, enlaces, código) a HTML
function mdAHtml(md) {
  const inline = (t) => e(t)
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+|mailto:[^)\s]+)\)/g, '<a class="underline text-blue-700" href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const out = []; let lista = false;
  const cerrar = () => { if (lista) { out.push('</ul>'); lista = false; } };
  for (const l of md.split('\n')) {
    const t = l.trimEnd();
    if (/^- /.test(t)) { if (!lista) { out.push('<ul>'); lista = true; } out.push('<li>' + inline(t.slice(2)) + '</li>'); continue; }
    cerrar();
    if (/^### /.test(t)) out.push('<h3 style="font-weight:600;margin:14px 0 6px">' + inline(t.slice(4)) + '</h3>');
    else if (/^## /.test(t)) out.push('<h2>' + inline(t.slice(3)) + '</h2>');
    else if (/^# /.test(t)) continue;
    else if (t.trim()) out.push('<p>' + inline(t) + '</p>');
  }
  cerrar();
  return out.join('\n');
}
const tituloDe = (md) => (md.match(/^# (.+)$/m) || [, ''])[1];

export function Privacidad() {
  return <Marco titulo={tituloDe(privacidadMd)}><div dangerouslySetInnerHTML={{ __html: mdAHtml(privacidadMd) }} /></Marco>;
}

export function Terminos() {
  return <Marco titulo={tituloDe(terminosMd)}><div dangerouslySetInnerHTML={{ __html: mdAHtml(terminosMd) }} /></Marco>;
}

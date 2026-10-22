import { Link } from 'react-router-dom';

const CORREO = 'albertrosales.tv@gmail.com';
const ACTUALIZADO = '22 de octubre de 2026';

function Marco({ titulo, children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link to="/inicio" className="font-semibold text-gray-900">ulúa Campus</Link>
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
    <Marco titulo="ulúa Campus">
      <p><strong>ulúa Campus</strong> es una plataforma de administración escolar de <strong>ulúa Media</strong> para colegios de Honduras. Integra con Moodle para ofrecer clases virtuales.</p>
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

export function Privacidad() {
  return (
    <Marco titulo="Política de Privacidad">
      <p>Última actualización: {ACTUALIZADO}</p>
      <p>Esta política describe cómo <strong>ulúa Campus</strong>, operada por ulúa Media (Tocoa, Colón, Honduras), trata la información de los colegios que la utilizan, de su personal, alumnos y familias.</p>
      <h2>1. Información que tratamos</h2>
      <ul>
        <li>Datos que el colegio registra: nombres, códigos, grados, correos, teléfonos, asistencia, calificaciones y pagos.</li>
        <li>Credenciales de acceso a la plataforma y a las clases virtuales (las contraseñas se generan automáticamente).</li>
        <li>Si el colegio conecta Gmail: la dirección de correo de la cuenta conectada y un código de autorización que nos entrega Google.</li>
      </ul>
      <h2>2. Uso de Google (Gmail)</h2>
      <p>El uso y la transferencia a cualquier otra app de la información recibida de las API de Google se ajustarán a la <a className="underline text-blue-700" href="https://developers.google.com/terms/api-services-user-data-policy">Política de Datos de Usuario de los Servicios de API de Google</a>, incluidos los requisitos de Uso Limitado.</p>
      <ul>
        <li><strong>Permiso solicitado:</strong> únicamente <em>enviar correo</em> (gmail.send), además de identificar la dirección de la cuenta conectada.</li>
        <li><strong>Para qué lo usamos:</strong> enviar, en nombre del colegio, los correos de la institución: bienvenida con credenciales, avisos de pagos, asistencia y comunicados.</li>
        <li><strong>Lo que no hacemos:</strong> no leemos, buscamos, modificamos ni eliminamos mensajes; no accedemos a contactos ni a otros datos de la cuenta; no usamos esta información para publicidad ni la vendemos o compartimos con terceros.</li>
        <li><strong>Almacenamiento:</strong> el código de autorización se guarda cifrado en nuestra base de datos y se usa solo para enviar los correos del colegio.</li>
        <li><strong>Revocación:</strong> el administrador puede desconectar el correo en Configuración → Correo de envío, o retirar el acceso en <a className="underline text-blue-700" href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>. Al desconectar, el código se elimina de nuestros sistemas.</li>
      </ul>
      <h2>3. Con quién compartimos</h2>
      <p>No vendemos información. Usamos proveedores necesarios para operar el servicio: alojamiento (Render), Moodle del propio colegio y Google para el envío de correos. Solo se comparte lo necesario para ofrecer el servicio.</p>
      <h2>4. Seguridad y conservación</h2>
      <p>Las comunicaciones viajan cifradas (HTTPS), los accesos están separados por colegio y los datos sensibles se guardan cifrados. Conservamos la información mientras el colegio mantenga su licencia; al terminar, el colegio puede solicitar la entrega o eliminación de sus datos.</p>
      <h2>5. Datos de menores</h2>
      <p>La plataforma maneja datos de estudiantes, incluidos menores de edad, que registra y administra el colegio como responsable. ulúa Media los trata solo para prestar el servicio.</p>
      <h2>6. Tus derechos</h2>
      <p>Para consultar, corregir o eliminar información, o para dudas sobre esta política, escribe a <a className="underline text-blue-700" href={'mailto:' + CORREO}>{CORREO}</a>. Si el dato pertenece a un colegio, la solicitud se coordina con la institución.</p>
      <h2>7. Cambios</h2>
      <p>Podemos actualizar esta política; la fecha al inicio indica la última versión.</p>
    </Marco>
  );
}

export function Terminos() {
  return (
    <Marco titulo="Términos del Servicio">
      <p>Última actualización: {ACTUALIZADO}</p>
      <h2>1. Servicio</h2>
      <p>ulúa Campus es una plataforma de administración escolar ofrecida por ulúa Media a colegios mediante una licencia. El uso implica aceptar estos términos.</p>
      <h2>2. Cuentas y responsabilidades</h2>
      <ul>
        <li>El colegio es responsable de la información que registra y de los usuarios que autoriza.</li>
        <li>Las credenciales son personales; se recomienda cambiar la contraseña al ingresar.</li>
        <li>No se permite usar la plataforma para actividades ilegales, envío de correo no solicitado (spam) o contenido ofensivo.</li>
      </ul>
      <h2>3. Correo de envío</h2>
      <p>Si el colegio conecta su Gmail, autoriza a la plataforma a enviar correos de la institución desde esa cuenta. Debe usarlo conforme a las políticas de Google y puede desconectarlo en cualquier momento.</p>
      <h2>4. Disponibilidad</h2>
      <p>Procuramos mantener el servicio disponible, sin garantizar que esté libre de interrupciones. Se realizan respaldos periódicos de la información.</p>
      <h2>5. Licencia y pagos</h2>
      <p>El acceso depende de una licencia vigente según el plan acordado con ulúa Media. Al vencer sin renovación, el acceso pasa a solo consulta.</p>
      <h2>6. Datos al terminar</h2>
      <p>Al finalizar el servicio, las condiciones de entrega o eliminación de los datos se acuerdan con ulúa Media.</p>
      <h2>7. Contacto</h2>
      <p><a className="underline text-blue-700" href={'mailto:' + CORREO}>{CORREO}</a></p>
    </Marco>
  );
}

# Panel Administrativo Escolar — ulúa Media / Campus Virtual

Módulo administrativo/contable que se conecta al Moodle de cada colegio vía su
Web Services API para gestionar alumnos, profesores, pagos y bloqueo/desbloqueo
automático de acceso según el estado de pago.

## Estructura

```
panel-admin/
├── db/
│   └── schema.sql          # Esquema completo de PostgreSQL
├── server/
│   ├── server.js           # Punto de entrada (Express + cron)
│   ├── db.js                # Conexión a PostgreSQL
│   ├── routes/
│   │   ├── alumnos.js
│   │   ├── profesores.js
│   │   └── pagos.js
│   ├── services/
│   │   ├── moodleService.js       # Llamadas a la API REST de Moodle
│   │   └── estadoPagoService.js   # Lógica de al_dia / plan_pago / moroso
│   └── jobs/
│       └── revisarPagos.js  # Job diario (cron) que sincroniza estados con Moodle
└── package.json
```

## Lógica de estados de pago

| Estado      | Acceso a Moodle | Color en el panel |
|-------------|------------------|--------------------|
| `al_dia`    | Habilitado       | Verde              |
| `plan_pago` | Habilitado       | Amarillo           |
| `moroso`    | Bloqueado        | Rojo               |

El bloqueo/desbloqueo se hace suspendiendo/activando la matrícula del alumno
en Moodle (`enrol_manual_enrol_users` con `suspend: 1/0`), **sin borrar** su
cuenta ni su historial de calificaciones — solo pierde acceso mientras esté
moroso.

## Paso 1: Habilitar el Web Service en cada Moodle del colegio

1. En Moodle: **Administración del sitio → Plugins → Servicios web → Habilitar servicios web**
2. Habilitar el protocolo **REST**
3. Crear un usuario de servicio (ej. `apipanel`) con rol que permita:
   - `core_user_get_users`
   - `core_enrol_get_users_courses`
   - `core_enrol_get_enrolled_users`
   - `enrol_manual_enrol_users`
4. Generar un **token** para ese usuario → este token va en la tabla `colegios.moodle_token`

## Paso 2: Configurar variables de entorno

Crear `.env`:
```
DATABASE_URL=postgres://usuario:password@host:5432/panel_admin
PORT=3000
```

## Paso 3: Crear la base de datos

```bash
psql $DATABASE_URL -f db/schema.sql
```

Luego insertar el colegio piloto:
```sql
INSERT INTO colegios (nombre, moodle_url, moodle_token)
VALUES ('Colegio Piloto', 'https://colegio1.midominio.com', 'TOKEN_AQUI');
```

## Paso 4: Instalar dependencias y correr

```bash
npm install
npm start
```

## Paso 5: Frontend (dashboard)

```bash
cd frontend
npm install
npm run dev
```

Esto levanta el panel en `http://localhost:5173` (proxy automático a la API en `:3000`).
Pantallas incluidas: **Resumen** (conteo de alumnos por estado), **Alumnos** (lista filtrable
por estado, detalle con historial/pagos y botones para generar constancia/reporte de pago),
**Profesores** (lista, reseñas, generación de informe docente).

> Nota: `COLEGIO_ID = 1` está fijo en el frontend por ahora (mono-colegio). Cuando haya
> login de `usuarios_admin`, esto se reemplaza por el colegio del usuario autenticado.

## Generación de PDFs

`server/services/pdfService.js` genera con `pdf-lib`:
- **Constancia de estudio** — `POST /api/reportes/constancia/:alumnoId`
- **Reporte de pagos** — `POST /api/reportes/reporte-pago/:alumnoId`
- **Informe docente** — `POST /api/reportes/informe-docente/:profesorId`

Los PDFs se guardan en `generated-pdfs/` y quedan registrados en `documentos_generados`
y en el historial del alumno. Son plantillas simples (texto + línea de firma); se pueden
enriquecer con logo del colegio y mejor maquetado más adelante.

## Pendiente (próximas iteraciones)

- [ ] Autenticación de `usuarios_admin` (login del panel, multi-colegio)
- [ ] Diseño de PDF con logo/membrete del colegio
- [ ] Formulario en el frontend para crear alumnos/profesores/pagos directamente (hoy es solo vía API)
- [ ] Endpoint de sincronización inicial (importar alumnos/profesores ya existentes en Moodle)
- [ ] Notificaciones automáticas (WhatsApp/email) antes de marcar moroso

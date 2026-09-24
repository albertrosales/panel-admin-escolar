-- ============================================================
-- PANEL ADMINISTRATIVO ESCOLAR - ulúa Media / Campus Virtual
-- Esquema de base de datos (PostgreSQL)
-- ============================================================

CREATE TYPE estado_pago AS ENUM ('al_dia', 'plan_pago', 'moroso');
CREATE TYPE tipo_evento_historial AS ENUM (
  'matricula', 'pago', 'cambio_estado', 'constancia_emitida',
  'reporte_generado', 'nota', 'suspension_moodle', 'activacion_moodle'
);

-- ------------------------------------------------------------
-- COLEGIOS (multi-tenant: cada colegio cliente es un tenant)
-- ------------------------------------------------------------
CREATE TABLE colegios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  moodle_url VARCHAR(255) NOT NULL,           -- ej: https://colegio1.midominio.com
  moodle_token VARCHAR(255) NOT NULL,         -- token del web service de Moodle
  activo BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------------------------
-- GRADOS / SECCIONES
-- ------------------------------------------------------------
CREATE TABLE grados (
  id SERIAL PRIMARY KEY,
  colegio_id INT REFERENCES colegios(id) ON DELETE CASCADE,
  nombre VARCHAR(50) NOT NULL,                -- ej: "7mo Grado A"
  moodle_category_id INT                      -- id de categoría en Moodle
);

-- ------------------------------------------------------------
-- PROFESORES
-- ------------------------------------------------------------
CREATE TABLE profesores (
  id SERIAL PRIMARY KEY,
  colegio_id INT REFERENCES colegios(id) ON DELETE CASCADE,
  nombre_completo VARCHAR(150) NOT NULL,
  correo VARCHAR(150),
  telefono VARCHAR(30),
  fecha_ingreso DATE NOT NULL,                -- para calcular antigüedad
  materias TEXT[],                            -- ej: {"Matemáticas","Física"}
  moodle_user_id INT,
  activo BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMP DEFAULT NOW()
);

-- Relación profesor <-> grado/materia (un profesor puede dar la misma materia a varios grados)
CREATE TABLE profesor_grado_materia (
  id SERIAL PRIMARY KEY,
  profesor_id INT REFERENCES profesores(id) ON DELETE CASCADE,
  grado_id INT REFERENCES grados(id) ON DELETE CASCADE,
  materia VARCHAR(100) NOT NULL,
  moodle_course_id INT
);

-- Reseñas / comentarios internos sobre el profesor (para informes)
CREATE TABLE profesor_resenas (
  id SERIAL PRIMARY KEY,
  profesor_id INT REFERENCES profesores(id) ON DELETE CASCADE,
  autor VARCHAR(150),                         -- quién hizo la observación (director, coordinador)
  comentario TEXT NOT NULL,
  fecha DATE DEFAULT CURRENT_DATE,
  creado_en TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------------------------
-- ALUMNOS
-- ------------------------------------------------------------
CREATE TABLE alumnos (
  id SERIAL PRIMARY KEY,
  colegio_id INT REFERENCES colegios(id) ON DELETE CASCADE,
  grado_id INT REFERENCES grados(id),
  nombre_completo VARCHAR(150) NOT NULL,
  nombre_encargado VARCHAR(150),
  telefono_encargado VARCHAR(30),
  correo_encargado VARCHAR(150),
  moodle_user_id INT,                         -- id de usuario en Moodle
  estado_pago estado_pago DEFAULT 'al_dia',
  fecha_matricula DATE DEFAULT CURRENT_DATE,
  activo BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------------------------
-- PAGOS
-- ------------------------------------------------------------
CREATE TABLE pagos (
  id SERIAL PRIMARY KEY,
  alumno_id INT REFERENCES alumnos(id) ON DELETE CASCADE,
  periodo VARCHAR(20) NOT NULL,                -- ej: "2026-09"
  monto NUMERIC(10,2) NOT NULL,
  fecha_pago DATE,
  fecha_vencimiento DATE NOT NULL,
  pagado BOOLEAN DEFAULT FALSE,
  metodo_pago VARCHAR(50),                     -- efectivo, transferencia, etc.
  notas TEXT,
  creado_en TIMESTAMP DEFAULT NOW()
);

-- Planes de pago (cuando un alumno moroso negocia cuotas)
CREATE TABLE planes_pago (
  id SERIAL PRIMARY KEY,
  alumno_id INT REFERENCES alumnos(id) ON DELETE CASCADE,
  monto_total NUMERIC(10,2) NOT NULL,
  num_cuotas INT NOT NULL,
  fecha_inicio DATE NOT NULL,
  activo BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMP DEFAULT NOW()
);

CREATE TABLE plan_pago_cuotas (
  id SERIAL PRIMARY KEY,
  plan_pago_id INT REFERENCES planes_pago(id) ON DELETE CASCADE,
  numero_cuota INT NOT NULL,
  monto NUMERIC(10,2) NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  pagada BOOLEAN DEFAULT FALSE,
  fecha_pago DATE
);

-- ------------------------------------------------------------
-- HISTORIAL DEL ALUMNO (línea de tiempo)
-- ------------------------------------------------------------
CREATE TABLE alumno_historial (
  id SERIAL PRIMARY KEY,
  alumno_id INT REFERENCES alumnos(id) ON DELETE CASCADE,
  tipo tipo_evento_historial NOT NULL,
  descripcion TEXT NOT NULL,
  fecha TIMESTAMP DEFAULT NOW(),
  metadata JSONB                               -- datos extra flexibles (monto, doc generado, etc.)
);

-- ------------------------------------------------------------
-- REPORTES Y CONSTANCIAS GENERADAS
-- ------------------------------------------------------------
CREATE TABLE documentos_generados (
  id SERIAL PRIMARY KEY,
  colegio_id INT REFERENCES colegios(id) ON DELETE CASCADE,
  alumno_id INT REFERENCES alumnos(id) ON DELETE SET NULL,
  profesor_id INT REFERENCES profesores(id) ON DELETE SET NULL,
  tipo VARCHAR(50) NOT NULL,                   -- 'constancia_estudio', 'reporte_pago', 'informe_docente'
  archivo_url VARCHAR(255),
  generado_por VARCHAR(150),
  creado_en TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------------------------
-- USUARIOS ADMINISTRATIVOS DEL PANEL (director, secretaria, etc.)
-- ------------------------------------------------------------
CREATE TABLE usuarios_admin (
  id SERIAL PRIMARY KEY,
  colegio_id INT REFERENCES colegios(id) ON DELETE CASCADE,
  nombre VARCHAR(150) NOT NULL,
  correo VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol VARCHAR(50) DEFAULT 'admin',             -- admin, secretaria, director
  activo BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------------------------
-- ÍNDICES ÚTILES
-- ------------------------------------------------------------
CREATE INDEX idx_alumnos_colegio ON alumnos(colegio_id);
CREATE INDEX idx_alumnos_estado_pago ON alumnos(estado_pago);
CREATE INDEX idx_pagos_alumno ON pagos(alumno_id);
CREATE INDEX idx_pagos_vencimiento ON pagos(fecha_vencimiento);
CREATE INDEX idx_historial_alumno ON alumno_historial(alumno_id);

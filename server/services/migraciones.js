const pool = require('../db');

// Idempotente: se ejecuta al arrancar el servidor
module.exports = async function migrar() {
  await pool.query(`
    ALTER TABLE alumnos
      ADD COLUMN IF NOT EXISTS descuento_pct NUMERIC(5,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS beca_pct NUMERIC(5,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS beca_motivo VARCHAR(200);
    ALTER TABLE colegios
      ADD COLUMN IF NOT EXISTS mora_tipo VARCHAR(10) DEFAULT 'porcentaje',
      ADD COLUMN IF NOT EXISTS mora_valor NUMERIC(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS mora_dias_gracia INT DEFAULT 0;
    ALTER TABLE pagos
      ADD COLUMN IF NOT EXISTS recargo NUMERIC(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS descuento_aplicado NUMERIC(10,2) DEFAULT 0;
    CREATE TABLE IF NOT EXISTS asistencia (
      id SERIAL PRIMARY KEY,
      colegio_id INT REFERENCES colegios(id) ON DELETE CASCADE,
      alumno_id INT REFERENCES alumnos(id) ON DELETE CASCADE,
      grado_id INT REFERENCES grados(id) ON DELETE CASCADE,
      fecha DATE NOT NULL,
      estado CHAR(1) NOT NULL,
      UNIQUE (alumno_id, grado_id, fecha)
    );
    CREATE TABLE IF NOT EXISTS eventos (
      id SERIAL PRIMARY KEY,
      colegio_id INT REFERENCES colegios(id) ON DELETE CASCADE,
      fecha DATE NOT NULL,
      titulo VARCHAR(200) NOT NULL,
      tipo VARCHAR(20) DEFAULT 'evento',
      descripcion TEXT,
      creado_en TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE colegios ADD COLUMN IF NOT EXISTS cuentas_destino TEXT;
    ALTER TABLE colegios ADD COLUMN IF NOT EXISTS conciliacion_monto_fecha BOOLEAN DEFAULT FALSE;
    ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS acceso_provisional BOOLEAN DEFAULT FALSE;
    CREATE TABLE IF NOT EXISTS comprobantes (
      id SERIAL PRIMARY KEY,
      colegio_id INT REFERENCES colegios(id) ON DELETE CASCADE,
      alumno_id INT REFERENCES alumnos(id) ON DELETE SET NULL,
      pago_id INT REFERENCES pagos(id) ON DELETE SET NULL,
      subido_tipo VARCHAR(10),
      subido_por VARCHAR(150),
      imagen BYTEA,
      mime VARCHAR(30),
      hash VARCHAR(64),
      banco VARCHAR(60),
      monto NUMERIC(10,2),
      fecha_transferencia DATE,
      hora VARCHAR(20),
      referencia VARCHAR(60),
      cuenta_origen VARCHAR(40),
      nombre_remitente VARCHAR(150),
      cuenta_destino VARCHAR(40),
      nombre_destinatario VARCHAR(150),
      estado_banco VARCHAR(80),
      flags JSONB DEFAULT '[]',
      estado VARCHAR(20) DEFAULT 'por_verificar',
      alumno_origen VARCHAR(20),
      nota TEXT,
      revisado_por VARCHAR(150),
      revisado_en TIMESTAMP,
      creado_en TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS movimientos_banco (
      id SERIAL PRIMARY KEY,
      colegio_id INT REFERENCES colegios(id) ON DELETE CASCADE,
      fecha DATE,
      referencia VARCHAR(60),
      monto NUMERIC(12,2) NOT NULL,
      descripcion TEXT,
      comprobante_id INT REFERENCES comprobantes(id) ON DELETE SET NULL,
      hash VARCHAR(40) NOT NULL,
      creado_en TIMESTAMP DEFAULT NOW(),
      UNIQUE (colegio_id, hash)
    );

    ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS deposito_probable JSONB;
    UPDATE movimientos_banco SET descripcion = NULL WHERE descripcion IS NOT NULL;
    DELETE FROM movimientos_banco WHERE comprobante_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_comprobantes_colegio ON comprobantes(colegio_id, estado);
    CREATE INDEX IF NOT EXISTS idx_comprobantes_hash ON comprobantes(colegio_id, hash);
    ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS texto_notas VARCHAR(300);
    CREATE INDEX IF NOT EXISTS idx_eventos_fecha ON eventos(colegio_id, fecha);
  `);

  // ---- Notificaciones por correo
  await pool.query(`
    ALTER TABLE colegios ADD COLUMN IF NOT EXISTS correo_color VARCHAR(9) DEFAULT '#2455e6';
    ALTER TABLE colegios ADD COLUMN IF NOT EXISTS correo_logo_url VARCHAR(300);
    ALTER TABLE colegios ADD COLUMN IF NOT EXISTS correo_pie VARCHAR(300);
    CREATE TABLE IF NOT EXISTS plantillas_correo (
      id SERIAL PRIMARY KEY,
      colegio_id INT REFERENCES colegios(id) ON DELETE CASCADE,
      clave VARCHAR(50) NOT NULL,
      asunto VARCHAR(250) NOT NULL,
      cuerpo TEXT NOT NULL,
      activa_auto BOOLEAN,
      parametro INT,
      UNIQUE (colegio_id, clave)
    );
    CREATE TABLE IF NOT EXISTS notificaciones_correo (
      id SERIAL PRIMARY KEY,
      colegio_id INT REFERENCES colegios(id) ON DELETE CASCADE,
      alumno_id INT REFERENCES alumnos(id) ON DELETE SET NULL,
      plantilla_clave VARCHAR(50),
      destinatario VARCHAR(150),
      asunto VARCHAR(250),
      cuerpo_texto TEXT,
      cuerpo_html TEXT,
      estado VARCHAR(12) DEFAULT 'pendiente',
      error VARCHAR(300),
      intentos INT DEFAULT 0,
      referencia VARCHAR(80),
      lote VARCHAR(30),
      enviado_por VARCHAR(150),
      creado_en TIMESTAMP DEFAULT NOW(),
      enviado_en TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_notif_colegio ON notificaciones_correo(colegio_id, creado_en DESC);
    CREATE INDEX IF NOT EXISTS idx_notif_ref ON notificaciones_correo(colegio_id, plantilla_clave, referencia);
  `);

  // ---- Código de alumno: AAAA + número correlativo por colegio (202601, 202602...)
  await pool.query(`ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS codigo VARCHAR(12)`);
  await pool.query(`
    WITH base AS (
      SELECT colegio_id, LEFT(codigo,4) AS y, MAX(SUBSTRING(codigo FROM 5)::int) AS m FROM alumnos WHERE codigo IS NOT NULL GROUP BY 1,2
    ), n AS (
      SELECT a.id, a.colegio_id, EXTRACT(YEAR FROM COALESCE(a.creado_en, NOW()))::int AS y,
             ROW_NUMBER() OVER (PARTITION BY a.colegio_id, EXTRACT(YEAR FROM COALESCE(a.creado_en, NOW())) ORDER BY a.id) AS rn
      FROM alumnos a WHERE a.codigo IS NULL
    )
    UPDATE alumnos a SET codigo = n.y::text || LPAD((n.rn + COALESCE(b.m,0))::text, 2, '0')
    FROM n LEFT JOIN base b ON b.colegio_id = n.colegio_id AND b.y = n.y::text WHERE a.id = n.id
  `);
  await pool.query(`
    CREATE OR REPLACE FUNCTION asignar_codigo_alumno() RETURNS trigger AS $f$
    DECLARE y text; m int;
    BEGIN
      IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
        PERFORM pg_advisory_xact_lock(NEW.colegio_id);
        y := to_char(NOW(), 'YYYY');
        SELECT COALESCE(MAX(SUBSTRING(codigo FROM 5)::int), 0) INTO m FROM alumnos WHERE colegio_id = NEW.colegio_id AND codigo LIKE y || '%';
        NEW.codigo := y || LPAD((m + 1)::text, 2, '0');
      END IF;
      RETURN NEW;
    END $f$ LANGUAGE plpgsql
  `);
  await pool.query(`DROP TRIGGER IF EXISTS trg_codigo_alumno ON alumnos`);
  await pool.query(`CREATE TRIGGER trg_codigo_alumno BEFORE INSERT ON alumnos FOR EACH ROW EXECUTE FUNCTION asignar_codigo_alumno()`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_alumnos_codigo ON alumnos(colegio_id, codigo)`);
  await pool.query(`ALTER TABLE alumnos ALTER COLUMN codigo SET NOT NULL`);
  await pool.query(`
    ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS telefono VARCHAR(30);
    ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS direccion VARCHAR(250);
    CREATE TABLE IF NOT EXISTS periodos_matricula (
      id SERIAL PRIMARY KEY,
      colegio_id INT REFERENCES colegios(id) ON DELETE CASCADE,
      anio_escolar INT NOT NULL,
      fecha_inicio DATE NOT NULL,
      fecha_fin DATE NOT NULL,
      monto NUMERIC(10,2),
      instrucciones TEXT,
      aprobacion_automatica BOOLEAN DEFAULT FALSE,
      bloquear_morosos BOOLEAN DEFAULT TRUE,
      creado_en TIMESTAMP DEFAULT NOW(),
      UNIQUE (colegio_id, anio_escolar)
    );
    CREATE TABLE IF NOT EXISTS solicitudes_matricula (
      id SERIAL PRIMARY KEY,
      colegio_id INT REFERENCES colegios(id) ON DELETE CASCADE,
      alumno_id INT REFERENCES alumnos(id) ON DELETE CASCADE,
      periodo_id INT REFERENCES periodos_matricula(id) ON DELETE CASCADE,
      grado_id INT REFERENCES grados(id) ON DELETE SET NULL,
      nombre_encargado VARCHAR(150),
      telefono_encargado VARCHAR(30),
      correo_encargado VARCHAR(150),
      telefono VARCHAR(30),
      direccion VARCHAR(250),
      observaciones VARCHAR(500),
      estado VARCHAR(12) NOT NULL DEFAULT 'pendiente',
      motivo_rechazo VARCHAR(300),
      revisado_por VARCHAR(150),
      revisado_en TIMESTAMP,
      creado_en TIMESTAMP DEFAULT NOW(),
      UNIQUE (alumno_id, periodo_id)
    );
    CREATE INDEX IF NOT EXISTS idx_solic_matricula_periodo ON solicitudes_matricula(periodo_id, estado);
  `);
  // Sección (grado + letra) a la que pertenece cada clase. Se rellena una sola vez a partir del nombre ("... 7.º Grado "A"")
  const { rows: [c] } = await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name='grados' AND column_name='seccion'`);
  await pool.query(`ALTER TABLE grados ADD COLUMN IF NOT EXISTS seccion VARCHAR(80)`);
  await pool.query(`ALTER TABLE solicitudes_matricula ADD COLUMN IF NOT EXISTS seccion VARCHAR(80)`);
  await pool.query(`ALTER TABLE solicitudes_matricula ADD COLUMN IF NOT EXISTS clases_agregadas INT[]`);
  if (!c) {
    await pool.query(`
      UPDATE grados g SET seccion = x.m[1] || '.º Grado ' || UPPER(x.m[2])
      FROM (SELECT id, regexp_match(nombre, '(\\d+)\\S*\\s+[Gg]rado\\s+"?([A-Za-z])"?\\s*$') AS m FROM grados) x
      WHERE x.id = g.id AND x.m IS NOT NULL`);
  }
};

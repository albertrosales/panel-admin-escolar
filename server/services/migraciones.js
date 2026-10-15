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
    CREATE INDEX IF NOT EXISTS idx_eventos_fecha ON eventos(colegio_id, fecha);
  `);
};

-- Crea tabla de configuración clave-valor
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value)
VALUES ('store_locked', 'false')
ON CONFLICT (key) DO NOTHING;

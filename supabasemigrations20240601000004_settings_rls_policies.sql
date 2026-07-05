-- Arregla "Error al cambiar estado" en el botón de bloqueo de tienda
-- Causa: RLS bloqueando el UPDATE/INSERT en "settings"

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura publica de settings" ON settings;
DROP POLICY IF EXISTS "Permitir escritura a usuarios autenticados" ON settings;

-- Lectura pública: la tienda pública (index.html) necesita saber si está bloqueada
CREATE POLICY "Permitir lectura publica de settings"
ON settings
FOR SELECT
TO anon, authenticated
USING (true);

-- Escritura: solo usuarios logueados (admin)
CREATE POLICY "Permitir escritura a usuarios autenticados"
ON settings
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

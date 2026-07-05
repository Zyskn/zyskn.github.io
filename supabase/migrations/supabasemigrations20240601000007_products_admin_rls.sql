-- ============================================================
-- ZYSKN — Corrección de políticas RLS para la tabla "products"
-- Deja lectura pública, pero solo el admin puede crear/editar/borrar
-- ============================================================

DROP POLICY IF EXISTS "Productos públicos" ON public.products;
DROP POLICY IF EXISTS "Admin gestiona productos" ON public.products;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.products;
DROP POLICY IF EXISTS "Public read products" ON public.products;
DROP POLICY IF EXISTS "Admin lee productos" ON public.products;
DROP POLICY IF EXISTS "Admin actualiza productos" ON public.products;
DROP POLICY IF EXISTS "Admin crea productos" ON public.products;
DROP POLICY IF EXISTS "Admin borra productos" ON public.products;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.products;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.products;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.products;

CREATE POLICY "cualquiera_lee_productos"
ON public.products
FOR SELECT
TO public
USING (true);

CREATE POLICY "solo_admin_crea_productos"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (auth.jwt() ->> 'email' = 'zyskn.vtg@gmail.com');

CREATE POLICY "solo_admin_edita_productos"
ON public.products
FOR UPDATE
TO authenticated
USING (auth.jwt() ->> 'email' = 'zyskn.vtg@gmail.com')
WITH CHECK (auth.jwt() ->> 'email' = 'zyskn.vtg@gmail.com');

CREATE POLICY "solo_admin_borra_productos"
ON public.products
FOR DELETE
TO authenticated
USING (auth.jwt() ->> 'email' = 'zyskn.vtg@gmail.com');

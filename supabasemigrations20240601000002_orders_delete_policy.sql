-- Permite borrar órdenes a cualquier usuario autenticado
CREATE POLICY "Allow delete orders for authenticated"
ON orders FOR DELETE
TO authenticated
USING (true);

-- Agrega columna de orden manual para productos
ALTER TABLE products ADD COLUMN sort_order integer DEFAULT 0;
UPDATE products SET sort_order = 0;

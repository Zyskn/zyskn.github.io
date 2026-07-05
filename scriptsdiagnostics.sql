-- Queries sueltas de chequeo / diagnóstico (no son migraciones, no cambian el schema)

-- Contar productos
select count(*) from products;

-- Verificar fila de settings
SELECT * FROM settings WHERE key = 'store_locked';

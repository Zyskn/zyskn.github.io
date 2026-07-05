-- Migra category (singular) a categories (array), copiando el valor existente
UPDATE products SET categories = ARRAY[category];

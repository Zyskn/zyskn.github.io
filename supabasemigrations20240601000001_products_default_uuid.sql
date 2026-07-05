-- Asigna generación automática de UUID al id de products
ALTER TABLE products ALTER COLUMN id SET DEFAULT gen_random_uuid();

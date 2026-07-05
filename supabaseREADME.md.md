# ZYSKN — Base de datos (Supabase)

Este repo versiona el historial de cambios de la base de datos de Supabase (Postgres + RLS)
usando migraciones SQL, en vez de manejarlos sueltos desde el SQL Editor.

Supabase **sigue siendo el backend real**. Este repo no lo reemplaza: es el registro
ordenado de qué se cambió y cuándo, para no perder el historial como pasaba antes.

## Estructura

```
supabase/
  migrations/     ← cada archivo es un cambio real aplicado a la base, en orden cronológico
scripts/
  diagnostics.sql ← queries sueltas de consulta/chequeo (no son migraciones)
```

## Paso 1: Subir este repo a GitHub

1. Creá un repo vacío en https://github.com/new (sin README, sin .gitignore).
2. Desde esta carpeta, en tu terminal:

```bash
git init
git add .
git commit -m "Historial inicial de migraciones de Supabase"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/zyskn-db.git
git push -u origin main
```

## Paso 2 (opcional, recomendado): conectar con la CLI de Supabase

Esto te permite en el futuro aplicar cambios con `supabase db push` en vez de
copiar/pegar en el SQL Editor.

```bash
npm install -g supabase
supabase login
supabase link --project-ref TU_PROJECT_REF   # el ref sale de la URL de tu proyecto en supabase.com
```

Como estos 7 cambios ya están aplicados en tu base real (los corriste manualmente),
marcalos como aplicados sin re-ejecutarlos:

```bash
supabase migration repair --status applied 20240601000001
supabase migration repair --status applied 20240601000002
supabase migration repair --status applied 20240601000003
supabase migration repair --status applied 20240601000004
supabase migration repair --status applied 20240601000005
supabase migration repair --status applied 20240601000006
supabase migration repair --status applied 20240601000007
```

De ahí en más, cada cambio nuevo se guarda como archivo `.sql` en `supabase/migrations/`
con formato `AAAAMMDDHHMMSS_descripcion.sql`, y se aplica con:

```bash
supabase db push
```

## Nota de seguridad

El email de admin (`zyskn.vtg@gmail.com`) está hardcodeado en las políticas RLS de
`products`. Si más adelante cambian de admin o necesitan varios, conviene mover esto
a una tabla `admins` o a un custom claim en el JWT en vez de tenerlo fijo en el SQL.

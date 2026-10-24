# cimapp

Panel administrativo (Next.js) + migraciones Supabase para CIM.

## Estructura

- `spappweb/` — aplicación web
- `supabase/migrations/` — esquema de base de datos

## Setup

1. Configurar URL y anon key de Supabase en `spappweb/src/lib/supabase/public-env.ts`.
2. Cuando exista el proyecto de Vercel: `cd spappweb && vercel link`.
3. Configurar credenciales GPS en `spappweb/src/lib/gps/` (ahora vacías).
4. Completar datos legales en `EMPRESA_PROPIETARIA` (`contrato-renting-clausulas.ts`).
5. `cd spappweb && npm install && npm run dev`

Este clon no incluye secretos ni apunta al Supabase o Vercel de origen. El logo de la empresa es CIM; el de Bera se conserva.

-- ══════════════════════════════════════════════════════════════════════
--  All Cancún · 06 — DIAGNÓSTICO: ¿por qué no aparecen los viajes?
--
--  NO CAMBIA NADA. Solo informa. Pega este archivo en Supabase → SQL
--  Editor → Run y revisa la tabla de resultados.
--
--  Sirve para comprobar, sin adivinar, que:
--    1. existe la tabla viajes y tiene los estados que usa la app
--    2. las políticas de SELECT dejan ver los viajes libres
--    3. la función tomar_viaje está instalada
--    4. hay conductores aprobados
--    5. Realtime (replicación) está activo en public.viajes
-- ══════════════════════════════════════════════════════════════════════

-- 1) ¿Existe la tabla y qué columnas tiene?
select 'tabla viajes' as revision,
       case when to_regclass('public.viajes') is not null
            then 'OK' else 'FALTA' end as estado,
       (select count(*)
          from information_schema.columns
         where table_schema = 'public' and table_name = 'viajes')::text
         || ' columnas' as detalle;

-- 2) ¿La columna estado admite 'solicitado'?
select 'estado admite solicitado' as revision,
       case when exists (
              select 1
                from information_schema.columns
               where table_schema = 'public'
                 and table_name   = 'viajes'
                 and column_name  = 'estado')
            then 'revisar abajo' else 'FALTA COLUMNA' end as estado,
       coalesce(
         (select pg_get_constraintdef(oid)
            from pg_constraint
           where conrelid = 'public.viajes'::regclass
             and contype  = 'c'
             and pg_get_constraintdef(oid) ilike '%estado%'
           limit 1),
         '(sin check: usa enum)'
       ) as detalle;

-- 3) Políticas de SELECT sobre viajes
select 'politicas select' as revision,
       case when count(*) > 0 then 'OK' else 'SIN POLITICAS' end as estado,
       string_agg(policyname, ' | ') as detalle
  from pg_policies
 where schemaname = 'public' and tablename = 'viajes' and cmd = 'SELECT';

-- 4) ¿Existe la que deja ver los libres?
select 'politica viajes libres' as revision,
       case when exists (
              select 1 from pg_policies
               where schemaname = 'public'
                 and tablename  = 'viajes'
                 and policyname = 'Conductor ve viajes libres')
            then 'OK' else 'FALTA (corre 05-FIX)' end as estado,
       '' as detalle;

-- 5) ¿Está tomar_viaje?
select 'tomar_viaje' as revision,
       case when to_regprocedure('public.tomar_viaje(uuid)') is not null
            then 'OK' else 'FALTA (corre 04-FIX)' end as estado,
       '' as detalle;

-- 6) ¿Hay conductores aprobados?
select 'conductores aprobados' as revision,
       case when count(*) > 0 then 'OK' else 'NINGUNO' end as estado,
       count(*)::text || ' con estado aprobado' as detalle
  from public.conductores
 where estado = 'aprobado';

-- 7) ¿Cuántos viajes solicitados hay ahora mismo?
select 'viajes solicitados' as revision,
       'INFO' as estado,
       count(*)::text || ' en estado solicitado sin conductor' as detalle
  from public.viajes
 where estado = 'solicitado' and conductor_id is null;

-- 8) ¿Realtime está activo en public.viajes?
select 'realtime en viajes' as revision,
       case when exists (
              select 1 from pg_publication_tables
               where pubname  = 'supabase_realtime'
                 and schemaname = 'public'
                 and tablename  = 'viajes')
            then 'OK' else 'NO (hay polling de 4s igual)' end as estado,
       '' as detalle;

-- 9) ¿El cliente puede INSERTAR un viaje? (sin esto, pedir no funciona)
select 'cliente puede insertar' as revision,
       case when exists (
              select 1 from pg_policies
               where schemaname = 'public'
                 and tablename  = 'viajes'
                 and cmd        = 'INSERT')
            then 'OK' else 'FALTA (corre 07-FIX)' end as estado,
       coalesce(
         (select string_agg(policyname, ' | ')
            from pg_policies
           where schemaname = 'public'
             and tablename  = 'viajes'
             and cmd        = 'INSERT'),
         'ninguna'
       ) as detalle;

-- ══════════════════════════════════════════════════════════════════════
--  ALL CANCÚN · ¿Por qué sale 0 viajes solicitados?
--
--  No cambia nada: solo informa. Pégalo en SQL Editor → Run.
-- ══════════════════════════════════════════════════════════════════════

-- 1) ¿Existe la tabla y tiene ALGUNA fila, de cualquier estado?
select
  'total de viajes en la tabla' as revision,
  count(*)::text                 as valor,
  case when count(*) = 0
       then 'NUNCA se ha guardado un viaje: el cliente no ha pedido, o el insert falla'
       else 'la tabla si recibe viajes' end as interpretacion
from public.viajes;

-- 2) Reparto por estado: ¿en qué se quedan los viajes?
select
  coalesce(estado, '(sin estado)') as estado,
  count(*)                         as cuantos
from public.viajes
group by estado
order by cuantos desc;

-- 3) Los últimos 10 viajes, para ver si el último llegó bien
select
  id,
  estado,
  conductor_id is null as sin_conductor,
  origen_texto,
  destino_texto,
  precio_centavos,
  solicitado_en
from public.viajes
order by solicitado_en desc nulls last
limit 10;

-- 4) El INSERT del cliente está permitido?
select
  policyname,
  cmd,
  case when cmd = 'INSERT' then 'OK' else '' end as es_insert
from pg_policies
where schemaname = 'public' and tablename = 'viajes'
order by cmd;

-- 5) ¿Hay conductores aprobados? (con 0 nadie puede recibir nada)
select
  coalesce(estado, '(sin estado)') as estado_conductor,
  count(*)                         as cuantos
from public.conductores
group by estado;

-- 6) ¿Cuántos usuarios hay registrados? (para saber si hay clientes)
select count(*) as usuarios_registrados from auth.users;

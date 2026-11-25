-- ══════════════════════════════════════════════════════════════════════
--  All Cancún · 05 — FIX: el conductor debe PODER VER los viajes libres
--
--  QUÉ HACE: agrega una política de SELECT para que un conductor aprobado
--  pueda leer los viajes en estado 'solicitado' (que aún no tienen dueño).
--
--  POR QUÉ HACE FALTA:
--  La política "viajes_leer_propios" dice:
--      using (conductor_id = auth.uid() or cliente_id = auth.uid())
--
--  Un viaje recién pedido tiene conductor_id = NULL y cliente_id del
--  cliente. Para el conductor eso es falso por los dos lados, así que
--  Postgres NI SIQUIERA LE ENTREGA LA FILA. Resultado: listarSolicitados()
--  y el canal de Realtime devolvían vacío siempre, y el viaje pedido en
--  All Cancún nunca aparecía en la app del conductor.
--
--  El 04-FIX arregló el UPDATE (tomar el viaje) pero no el SELECT.
--  Sin ver el viaje, no hay nada que tomar.
--
--  CÓMO USARLO:
--  Pega este archivo completo en Supabase → SQL Editor → Run.
--  Es idempotente: puedes correrlo varias veces sin problema.
-- ══════════════════════════════════════════════════════════════════════

-- Las políticas de SELECT se suman con OR: basta con que una deje pasar
-- la fila. Esta deja ver SOLO los viajes libres, y solo a quien tiene
-- ficha de conductor aprobada. No expone viajes ajenos ya tomados.

drop policy if exists "Conductor ve viajes libres" on public.viajes;
create policy "Conductor ve viajes libres"
  on public.viajes for select
  to authenticated
  using (
    estado = 'solicitado'
    and conductor_id is null
    and exists (
      select 1
        from public.conductores c
       where c.perfil_id = auth.uid()
         and c.estado = 'aprobado'
    )
  );

-- ──────────────────────────────────────────────────────────────────────
--  Verificación
-- ──────────────────────────────────────────────────────────────────────
select
  case when exists (
         select 1 from pg_policies
          where schemaname = 'public'
            and tablename  = 'viajes'
            and policyname = 'Conductor ve viajes libres')
       then 'OK' else 'FALTA' end as politica_select_libres,
  case when to_regprocedure('public.tomar_viaje(uuid)') is not null
       then 'OK' else 'FALTA' end as funcion_tomar_viaje,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'viajes'
      and cmd = 'SELECT')          as total_politicas_select;

-- ══════════════════════════════════════════════════════════════════════
--  All Cancún · 07 — FIX: el cliente debe PODER PEDIR un viaje
--
--  QUÉ HACE: agrega la política de INSERT que deja a un usuario con
--  sesión crear un viaje propio en estado 'solicitado'.
--
--  POR QUÉ HACE FALTA:
--  El pedido de mototaxi en All Cancún hace un INSERT en public.viajes
--  (features/mototaxis/viajes.js → crearViaje). Si la tabla no tiene
--  política de INSERT para 'authenticated', PostgREST rechaza la fila
--  con 42501 y crearViaje devuelve null. La app lo interpreta como
--  "sin sesión" y cae al modo demo: el viaje NUNCA se crea en la base,
--  así que nunca puede aparecerle a ningún conductor.
--
--  CÓMO USARLO:
--  Pega este archivo completo en Supabase → SQL Editor → Run.
--  Es idempotente. Puedes correrlo varias veces sin problema.
-- ══════════════════════════════════════════════════════════════════════

drop policy if exists "Cliente crea su viaje" on public.viajes;
create policy "Cliente crea su viaje"
  on public.viajes for insert
  to authenticated
  with check (
    -- Solo se puede crear un viaje a nombre propio...
    cliente_id = auth.uid()
    -- ...y siempre naciendo libre, sin conductor asignado. Así nadie
    -- se autoasigna un viaje ni se salta el flujo de aceptación.
    and conductor_id is null
    and estado = 'solicitado'
  );

-- El cliente puede cancelar su propio viaje mientras siga libre.
drop policy if exists "Cliente cancela su viaje" on public.viajes;
create policy "Cliente cancela su viaje"
  on public.viajes for update
  to authenticated
  using (
    cliente_id = auth.uid()
    and estado = 'solicitado'
  )
  with check (
    cliente_id = auth.uid()
    and estado = 'cancelado'
  );

-- ──────────────────────────────────────────────────────────────────────
--  Verificación
-- ──────────────────────────────────────────────────────────────────────
select
  case when exists (
         select 1 from pg_policies
          where schemaname='public' and tablename='viajes'
            and policyname='Cliente crea su viaje')
       then 'OK' else 'FALTA' end as politica_insert_cliente,
  case when exists (
         select 1 from pg_policies
          where schemaname='public' and tablename='viajes'
            and policyname='Conductor ve viajes libres')
       then 'OK' else 'FALTA (corre 05)' end as conductor_ve_libres,
  case when to_regprocedure('public.tomar_viaje(uuid)') is not null
       then 'OK' else 'FALTA (corre 04)' end as conductor_puede_tomar;

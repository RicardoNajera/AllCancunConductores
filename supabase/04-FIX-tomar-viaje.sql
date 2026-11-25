-- ══════════════════════════════════════════════════════════════════════
--  All Cancún · 04 — FIX: los conductores deben poder ACEPTAR viajes
--
--  QUÉ HACE: agrega la función public.tomar_viaje(uuid) y una política
--  de UPDATE que permiten a un conductor aprobado tomar un viaje libre.
--
--  POR QUÉ HACE FALTA:
--  La política "Actualizar viaje" (del archivo 03-PASO-2) solo deja
--  modificar filas donde conductor_id YA eres tú. Pero cuando un viaje
--  está libre, conductor_id está en NULL... y es justo el valor que hay
--  que escribir al aceptarlo. Resultado: NINGÚN conductor podía aceptar
--  viajes; el update siempre tocaba 0 filas y el viaje se quedaba en
--  'solicitado' para siempre.
--
--  CÓMO USARLO:
--  Pega este archivo completo en Supabase → SQL Editor → Run.
--  Es idempotente: puedes correrlo varias veces sin problema.
-- ══════════════════════════════════════════════════════════════════════

-- La función valida que quien llama sea un conductor aprobado y hace el
-- update condicional. La condición "estado = 'solicitado'" es la que
-- resuelve la carrera: si otro llegó primero, no se toca ninguna fila.
-- Corre como security definer para poder escribir conductor_id, que la
-- política RLS no dejaría tocar directamente.
create or replace function public.tomar_viaje(p_viaje_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conductor_id uuid;
  v_filas        int;
begin
  select c.id into v_conductor_id
    from public.conductores c
   where c.perfil_id = auth.uid()
     and c.estado = 'aprobado'::public.estado_conductor
   limit 1;

  -- Sin ficha aprobada no se puede tomar nada.
  if v_conductor_id is null then
    return false;
  end if;

  update public.viajes
     set conductor_id = v_conductor_id,
         estado       = 'aceptado'::public.estado_viaje,
         aceptado_en  = now()
   where id = p_viaje_id
     and estado = 'solicitado'::public.estado_viaje
     and conductor_id is null;

  -- 1 fila = ganaste la carrera. 0 = otro llegó primero.
  get diagnostics v_filas = row_count;
  return v_filas = 1;
end;
$$;

comment on function public.tomar_viaje(uuid) is
  'Un conductor aprobado toma un viaje solicitado. Devuelve true si ganó la carrera.';

grant execute on function public.tomar_viaje(uuid) to authenticated;

-- Política complementaria: permite el update directo del conductor
-- aprobado sobre un viaje libre (no sustituye la función, la acompaña).
drop policy if exists "Conductor toma viaje libre" on public.viajes;
create policy "Conductor toma viaje libre"
  on public.viajes for update
  to authenticated
  using (
    estado = 'solicitado'::public.estado_viaje
    and conductor_id is null
    and exists (
      select 1 from public.conductores c
      where c.perfil_id = auth.uid()
        and c.estado = 'aprobado'::public.estado_conductor
    )
  );

-- ──────────────────────────────────────────────────────────────────────
--  Verificación
-- ──────────────────────────────────────────────────────────────────────
select
  case when to_regprocedure('public.tomar_viaje(uuid)') is not null
       then 'OK' else 'FALTA' end as funcion_tomar_viaje,
  case when exists (
         select 1 from pg_policies
          where schemaname = 'public'
            and tablename  = 'viajes'
            and policyname = 'Conductor toma viaje libre')
       then 'OK' else 'FALTA' end as politica_update;

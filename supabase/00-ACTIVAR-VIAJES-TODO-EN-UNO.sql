-- ══════════════════════════════════════════════════════════════════════
--  ALL CANCÚN · ACTIVAR EL CIRCUITO DE VIAJES
--  Que un pedido hecho en All Cancún le llegue y le funcione al conductor
--
--  CÓMO USARLO:
--  1. Abre tu proyecto en https://supabase.com/dashboard
--  2. Menú izquierdo → SQL Editor → "+ New query"
--  3. Pega TODO este archivo
--  4. Pulsa RUN (o Cmd/Ctrl + Enter)
--  5. Al final sale una tabla con 3 columnas: deben decir OK las 3.
--
--  Es idempotente: puedes correrlo las veces que quieras, no rompe nada.
--  No borra datos ni cambia la estructura de la tabla.
-- ══════════════════════════════════════════════════════════════════════


-- ──────────────────────────────────────────────────────────────────────
--  1) EL CONDUCTOR VE LOS VIAJES LIBRES
--
--  Por qué: la política que había era
--      using (conductor_id = auth.uid() or cliente_id = auth.uid())
--  Un viaje recién pedido tiene conductor_id = NULL y el cliente_id de
--  otra persona, así que para el conductor las dos comparaciones son
--  falsas y Postgres NO le entrega la fila. Por eso el pedido nunca
--  aparecía en su app.
--
--  Esta política deja ver SOLO los viajes libres, y solo a quien tiene
--  ficha de conductor aprobada. No expone viajes ajenos ya tomados.
-- ──────────────────────────────────────────────────────────────────────

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
--  2) EL CLIENTE PUEDE PEDIR EL VIAJE
--
--  Por qué: sin política de INSERT, crearViaje() recibía el error
--  42501 ("permission denied"), devolvía null y la app lo tomaba como
--  "no hay sesión", cayendo al modo demo. El viaje nunca se guardaba.
--
--  El viaje siempre nace libre y a nombre propio: nadie puede
--  autoasignarse uno ni saltarse el flujo de aceptación.
-- ──────────────────────────────────────────────────────────────────────

drop policy if exists "Cliente crea su viaje" on public.viajes;

create policy "Cliente crea su viaje"
  on public.viajes for insert
  to authenticated
  with check (
    cliente_id = auth.uid()
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
--  3) EL CONDUCTOR PUEDE ACEPTAR EL VIAJE
--
--  Por qué: la política de UPDATE solo dejaba tocar filas donde
--  conductor_id YA era tuyo, pero al aceptar está en NULL — justo el
--  valor que hay que escribir. Ningún conductor podía aceptar.
--
--  La función corre como security definer, valida que quien llama sea
--  conductor aprobado y hace el update condicional ('estado =
--  solicitado'), así que el primero que llega gana y no hay carreras.
-- ──────────────────────────────────────────────────────────────────────

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
     and c.estado = 'aprobado'
   limit 1;

  -- Sin ficha aprobada no se puede tomar nada.
  if v_conductor_id is null then
    return false;
  end if;

  update public.viajes
     set conductor_id = v_conductor_id,
         estado       = 'aceptado',
         aceptado_en  = now()
   where id = p_viaje_id
     and estado = 'solicitado'
     and conductor_id is null;

  -- 1 fila = ganaste la carrera. 0 = otro llegó primero.
  get diagnostics v_filas = row_count;
  return v_filas = 1;
end;
$$;

grant execute on function public.tomar_viaje(uuid) to authenticated;

-- Política complementaria para el update directo del conductor.
drop policy if exists "Conductor toma viaje libre" on public.viajes;

create policy "Conductor toma viaje libre"
  on public.viajes for update
  to authenticated
  using (
    estado = 'solicitado'
    and conductor_id is null
    and exists (
      select 1 from public.conductores c
       where c.perfil_id = auth.uid()
         and c.estado = 'aprobado'
    )
  );


-- ──────────────────────────────────────────────────────────────────────
--  4) ALERTA INSTANTÁNEA (opcional)
--
--  Sin esto, el conductor igual recibe los viajes por el sondeo cada
--  4 segundos que trae la app. Con esto, la alerta salta al instante.
--
--  Si tu proyecto no tiene la publicación supabase_realtime, el bloque
--  se salta solo y no da error.
-- ──────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'viajes')
  then
    alter publication supabase_realtime add table public.viajes;
  end if;
exception
  when others then
    raise notice 'Realtime no se pudo activar: %', sqlerrm;
end $$;


-- ══════════════════════════════════════════════════════════════════════
--  VERIFICACIÓN — esto es lo que verás al final
--  Las 3 filas deben decir OK.
-- ══════════════════════════════════════════════════════════════════════

select 'conductor ve viajes libres' as revision,
       case when exists (
              select 1 from pg_policies
               where schemaname = 'public'
                 and tablename  = 'viajes'
                 and policyname = 'Conductor ve viajes libres')
            then 'OK' else 'FALTA' end as estado;

select 'cliente puede pedir viaje' as revision,
       case when exists (
              select 1 from pg_policies
               where schemaname = 'public'
                 and tablename  = 'viajes'
                 and policyname = 'Cliente crea su viaje')
            then 'OK' else 'FALTA' end as estado;

select 'conductor puede aceptar' as revision,
       case when to_regprocedure('public.tomar_viaje(uuid)') is not null
            then 'OK' else 'FALTA' end as estado;


-- ──────────────────────────────────────────────────────────────────────
--  EXTRA: datos útiles si algo no llega
-- ──────────────────────────────────────────────────────────────────────

-- ¿Hay conductores aprobados? Si sale 0, nadie puede recibir viajes.
select count(*) as conductores_aprobados
  from public.conductores
 where estado = 'aprobado';

-- ¿Hay viajes esperando conductor ahora mismo?
select count(*) as viajes_solicitados
  from public.viajes
 where estado = 'solicitado'
   and conductor_id is null;


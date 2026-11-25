-- All Cancún Conductores — esquema mínimo
--
-- Ejecuta esto en Supabase → SQL Editor. Es idempotente: puedes correrlo
-- varias veces sin romper nada. NO crea usuarios ni asigna roles: las
-- cuentas se crean solas desde la app (Authentication) y el permiso de
-- conducir se otorga desde la central.

-- 1) Permiso de conducir
--    La tabla public.permisos ya existe (tipo_permiso incluye 'conducir').
--    Aquí solo se deja listo el helper que usa el RLS.

-- 2) Tabla de viajes
create table if not exists public.viajes (
  id               uuid primary key default gen_random_uuid(),
  folio            text,
  estado           text not null default 'asignado'
                   check (estado in ('asignado','aceptado','en_curso','completado','cancelado')),
  conductor_id     uuid references public.perfiles(id) on delete set null,
  cliente_id       uuid references public.perfiles(id) on delete set null,
  cliente_nombre   text,
  cliente_telefono text,
  origen           text,
  destino          text,
  precio_centavos  integer not null default 0,
  distancia_km     numeric(8,2),
  programado_para  timestamptz,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);

comment on table public.viajes is 'Viajes de All Cancún. Un conductor solo ve y toca los que tiene asignados.';

create index if not exists viajes_conductor_idx on public.viajes (conductor_id, creado_en desc);
create index if not exists viajes_estado_idx    on public.viajes (estado);

-- 3) Marca de actualización automática
create or replace function public.tocar_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists viajes_tocar_fecha on public.viajes;
create trigger viajes_tocar_fecha
  before update on public.viajes
  for each row execute function public.tocar_actualizado_en();

-- 4) RLS: cada quien ve lo suyo
alter table public.viajes enable row level security;

-- El conductor ve sus viajes; el cliente ve los suyos.
drop policy if exists viajes_leer_propios on public.viajes;
create policy viajes_leer_propios on public.viajes
  for select to authenticated
  using (conductor_id = auth.uid() or cliente_id = auth.uid());

-- Solo el conductor asignado cambia el estado, y solo a estados válidos
-- para él. Rechazar equivale a cancelar. No puede reasignarse el viaje.
drop policy if exists viajes_conductor_actualiza on public.viajes;
create policy viajes_conductor_actualiza on public.viajes
  for update to authenticated
  using (conductor_id = auth.uid())
  with check (
    conductor_id = auth.uid()
    and estado in ('aceptado','en_curso','completado','cancelado')
  );

grant select, update on public.viajes to authenticated;

-- 5) El conductor solo puede tener el permiso 'conducir' si la central se
--    lo otorgó. La app consulta public.permisos; nadie puede autoasignárselo
--    desde el navegador porque esa tabla no tiene política de INSERT para
--    usuarios autenticados.

-- Ingresos programados: un ingreso que sabes que va a llegar (sueldo, bono…), con monto aproximado.
-- Viven aparte de movimientos para que nunca sumen a los saldos por sí solos: solo al confirmarlos se vuelven un ingreso real.

create table if not exists public.ingresos_programados (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null default public.mi_hogar() references public.hogares(id) on delete cascade,
  creado_por uuid not null default auth.uid(),
  fecha date not null,                                   -- próxima fecha esperada
  monto numeric not null check (monto > 0),              -- aproximado; al confirmar se usa el real
  cuenta_id uuid references public.cuentas(id) on delete set null,
  categoria_id uuid references public.categorias(id) on delete set null,
  descripcion text not null,
  repetir text check (repetir in ('catorcena', 'mes')),  -- null: una sola vez
  created_at timestamptz not null default now()
);

create index if not exists ingresos_programados_creado_fecha on public.ingresos_programados (creado_por, fecha);

alter table public.ingresos_programados enable row level security;

drop policy if exists ingresos_programados_todo on public.ingresos_programados;
create policy ingresos_programados_todo on public.ingresos_programados for all
  using (hogar_id = public.mi_hogar() and creado_por = (select auth.uid()))
  with check (hogar_id = public.mi_hogar() and creado_por = (select auth.uid())
    and (cuenta_id is null or public.cuenta_usable(cuenta_id))
    and (categoria_id is null or public.categoria_usable(categoria_id)));

-- Confirma un ingreso programado en un solo paso: crea el ingreso real con el monto y la fecha en que llegó y,
-- si se repite, pasa la programación a la siguiente fecha (con este monto como nuevo aproximado); si no, la borra.
-- Corre con los permisos de quien la llama, así que aplican las mismas reglas de seguridad que al registrar un ingreso.
create or replace function public.confirmar_ingreso(p_id uuid, p_monto numeric, p_fecha date, p_cuenta uuid)
 returns uuid
 language plpgsql
 set search_path to ''
as $function$
declare
  ip public.ingresos_programados%rowtype;
  nuevo uuid;
begin
  select * into ip from public.ingresos_programados where id = p_id and creado_por = auth.uid() for update;
  if not found then raise exception 'Ese ingreso programado ya no existe.'; end if;
  if not (p_monto > 0) then raise exception 'Escribe un monto mayor a cero.'; end if;

  insert into public.movimientos (tipo, monto, fecha, cuenta_id, categoria_id, descripcion)
  values ('ingreso', p_monto, p_fecha, coalesce(p_cuenta, ip.cuenta_id), ip.categoria_id, ip.descripcion)
  returning id into nuevo;

  if ip.repetir = 'catorcena' then
    update public.ingresos_programados set fecha = ip.fecha + 14, monto = p_monto where id = ip.id;
  elsif ip.repetir = 'mes' then
    update public.ingresos_programados set fecha = (ip.fecha + interval '1 month')::date, monto = p_monto where id = ip.id;
  else
    delete from public.ingresos_programados where id = ip.id;
  end if;
  return nuevo;
end
$function$;

-- Solo con sesión iniciada (como las demás funciones); también para reparto_compartido, que había quedado abierta a anon
revoke execute on function public.reparto_compartido(date, date) from public, anon;
grant execute on function public.reparto_compartido(date, date) to authenticated;
revoke execute on function public.confirmar_ingreso(uuid, numeric, date, uuid) from public, anon;
grant execute on function public.confirmar_ingreso(uuid, numeric, date, uuid) to authenticated;

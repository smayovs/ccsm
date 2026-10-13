-- Color de cada miembro en la marca (rosa o gris) y reparto de los gastos compartidos de un periodo,
-- para la barra "Gastos compartidos" del resumen de Inicio.

alter table public.miembros add column if not exists color text check (color in ('rosa', 'gris'));

-- Datos de este hogar, aplicados aparte (no forman parte del esquema): Cristhel rosa, Sergio gris.
--   update public.miembros set color = 'rosa' where nombre = 'Cristhel';
--   update public.miembros set color = 'gris' where nombre = 'Sergio';

-- Parte de cada miembro del hogar en los gastos compartidos (los que tienen reparto) del periodo [p_desde, p_hasta).
-- Quien pagó carga el monto menos lo repartido (y menos las partes de otras personas); cada quien más, su reparto.
create or replace function public.reparto_compartido(p_desde date, p_hasta date)
 returns table(user_id uuid, nombre text, color text, es_yo boolean, parte numeric)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with compartidos as (
    select m.id, m.creado_por, m.monto
    from public.movimientos m
    where m.hogar_id = public.mi_hogar() and m.tipo = 'gasto' and m.familiar_id is null
      and coalesce(m.origen, '') <> 'Saldo inicial'
      and m.fecha >= p_desde and m.fecha < p_hasta
      and exists (select 1 from public.repartos r where r.movimiento_id = m.id)),
  partes as (
    select c.creado_por as u,
      c.monto - coalesce((select sum(r.monto) from public.repartos r where r.movimiento_id = c.id), 0)
              - coalesce((select sum(p.monto) from public.partes_personas p where p.movimiento_id = c.id), 0) as v
    from compartidos c
    union all
    select r.user_id, r.monto from public.repartos r join compartidos c on c.id = r.movimiento_id)
  select mi.user_id, mi.nombre, mi.color, mi.user_id = auth.uid(), coalesce(sum(p.v), 0)
  from public.miembros mi left join partes p on p.u = mi.user_id
  where mi.hogar_id = public.mi_hogar()
  group by mi.user_id, mi.nombre, mi.color
$function$;

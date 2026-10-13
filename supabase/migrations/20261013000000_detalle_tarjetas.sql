-- El detalle de todas tus tarjetas en una sola consulta (13 oct 2026).
-- Antes Inicio pedía detalle_cuenta una vez por tarjeta, después de esperar los saldos.
-- Devuelve {cuenta_id: detalle_cuenta(cuenta_id)} de las tarjetas activas que puedes usar (tuyas y conjuntas),
-- las mismas que Inicio mostraba. Corre con tus permisos y detalle_cuenta sigue validando cada cuenta.
create or replace function public.detalle_tarjetas()
 returns jsonb
 language sql
 stable
 security invoker
 set search_path to ''
as $function$
  select coalesce(jsonb_object_agg(c.id, public.detalle_cuenta(c.id)), '{}'::jsonb)
  from public.cuentas c
  where c.hogar_id = public.mi_hogar() and (c.propietario_id = auth.uid() or c.propietario_id is null)
    and c.activa and c.tipo = 'credito'
$function$;
revoke execute on function public.detalle_tarjetas() from public, anon;
grant execute on function public.detalle_tarjetas() to authenticated;

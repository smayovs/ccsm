-- Recordatorios con notificaciones (Web Push): cada día a las 9:00 de Cancún la función de servidor "recordatorios"
-- avisa de los pagos de tarjeta que vencen hoy o mañana y de los ingresos programados que llegan hoy.
-- Las claves (VAPID) y el secreto del cron viven en la bóveda (vault), no aquí:
--   ccsm_vapid_publica, ccsm_vapid_privada, ccsm_cron_secreto

create extension if not exists pg_cron;

-- Un registro por dispositivo donde activaste las notificaciones
create table if not exists public.push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_suscripciones enable row level security;
drop policy if exists push_suscripciones_propias on public.push_suscripciones;
create policy push_suscripciones_propias on public.push_suscripciones for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Qué avisos quieres (los dos encendidos si no has elegido)
alter table public.preferencias add column if not exists notificaciones jsonb not null default '{}'::jsonb;

-- Los recordatorios de hoy para quienes tienen notificaciones activadas.
-- Calcula las tarjetas de cada persona con sus propios permisos (como si ella abriera la app).
create or replace function public.recordatorios_hoy()
 returns table(user_id uuid, titulo text, cuerpo text, url text)
 language plpgsql
 security definer
 set search_path to ''
as $function$
#variable_conflict use_column
declare
  u record; t record; dia date := public.hoy(); falta numeric; f date;
begin
  for u in select distinct s.user_id as uid, coalesce(p.notificaciones, '{}'::jsonb) as prefs
           from public.push_suscripciones s left join public.preferencias p on p.user_id = s.user_id loop
    perform set_config('request.jwt.claims', json_build_object('sub', u.uid, 'role', 'authenticated')::text, true);
    if coalesce((u.prefs->>'pagos')::boolean, true) then
      for t in select c.id, c.nombre, d.value as det
               from jsonb_each(public.detalle_tarjetas()) d join public.cuentas c on c.id::text = d.key loop
        f := (t.det->>'fecha_pago')::date;
        falta := greatest(0, coalesce((t.det->>'pago_corte')::numeric, 0) - coalesce((t.det->>'pagado_desde_corte')::numeric, 0));
        if f is not null and falta > 0.5 and f in (dia, dia + 1) then
          user_id := u.uid;
          titulo := (case when f = dia then 'Hoy vence tu pago de ' else 'Mañana vence tu pago de ' end) || t.nombre;
          cuerpo := 'Faltan $' || to_char(falta, 'FM999,999,990.00') || ' para no generar intereses.';
          url := '#/cuenta/' || t.id;
          return next;
        end if;
      end loop;
    end if;
    if coalesce((u.prefs->>'ingresos')::boolean, true) then
      for t in select i.id, i.descripcion, i.monto from public.ingresos_programados i where i.creado_por = u.uid and i.fecha = dia loop
        user_id := u.uid;
        titulo := '¿Ya llegó tu ' || t.descripcion || '?';
        cuerpo := 'Confírmalo con el monto real (aprox. $' || to_char(t.monto, 'FM999,999,990.00') || ').';
        url := '#/ingreso-programado/' || t.id;
        return next;
      end loop;
    end if;
  end loop;
end
$function$;

-- Claves y secreto para la función de servidor
create or replace function public.config_recordatorios()
 returns jsonb
 language sql
 security definer
 set search_path to ''
as $function$
  select jsonb_build_object(
    'vapid_publica', (select decrypted_secret from vault.decrypted_secrets where name = 'ccsm_vapid_publica'),
    'vapid_privada', (select decrypted_secret from vault.decrypted_secrets where name = 'ccsm_vapid_privada'),
    'secreto', (select decrypted_secret from vault.decrypted_secrets where name = 'ccsm_cron_secreto'))
$function$;

-- Solo la función de servidor (service_role) puede usarlas
revoke execute on function public.recordatorios_hoy() from public, anon, authenticated;
revoke execute on function public.config_recordatorios() from public, anon, authenticated;
grant execute on function public.recordatorios_hoy() to service_role;
grant execute on function public.config_recordatorios() to service_role;

-- Todos los días a las 14:00 UTC (9:00 en Cancún)
select cron.unschedule('ccsm-recordatorios') where exists (select 1 from cron.job where jobname = 'ccsm-recordatorios');
select cron.schedule('ccsm-recordatorios', '0 14 * * *', $cron$
  select net.http_post(
    url := 'https://nvmzmlefywssikkyamyk.supabase.co/functions/v1/recordatorios',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-secreto', (select decrypted_secret from vault.decrypted_secrets where name = 'ccsm_cron_secreto')),
    body := '{}'::jsonb)
$cron$);

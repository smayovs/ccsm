-- Tarjetas: deuda calculada con lo que registras, reglas de fecha de pago y cuadres con el banco.
--
-- 1) Deuda calculada (cuentas.saldo_calculado). Ya no hay "deuda inicial": la tarjeta empieza al corriente
--    el día siguiente a un corte (fecha_saldo_inicial) y su deuda es lo que registras desde ahí, más lo que falta
--    de las compras a meses de antes de esa fecha. Cada tarjeta se cambia al cuadrarla con el flujo nuevo;
--    las que no, siguen con su deuda inicial como antes.
-- 2) Fecha límite de pago: día fijo del mes, N días después del corte o el día del siguiente corte, y si cae en
--    fin de semana se puede recorrer al día hábil anterior o siguiente. Un estado de cuenta puede fijar la fecha
--    de un corte en particular (fechas_corte).
-- 3) Cuadres: cada comparación con el banco (saldo de hoy o estado de cuenta) queda guardada; no cambia la deuda.

alter table public.cuentas
  add column if not exists saldo_calculado boolean not null default false,
  add column if not exists pago_regla text not null default 'fijo',
  add column if not exists pago_dias smallint,
  add column if not exists pago_habil text not null default 'no',
  add column if not exists banco_incluye_msi boolean not null default false;
alter table public.cuentas drop constraint if exists cuentas_pago_regla_check;
alter table public.cuentas add constraint cuentas_pago_regla_check check (pago_regla in ('fijo', 'dias', 'corte'));
alter table public.cuentas drop constraint if exists cuentas_pago_dias_check;
alter table public.cuentas add constraint cuentas_pago_dias_check check (pago_dias between 1 and 60);
alter table public.cuentas drop constraint if exists cuentas_pago_habil_check;
alter table public.cuentas add constraint cuentas_pago_habil_check check (pago_habil in ('no', 'antes', 'despues'));

-- Tarjeta tuya o conjunta de tu hogar (para las políticas de las tablas nuevas)
create or replace function public._tarjeta_mia(p_cuenta uuid)
 returns boolean language sql stable security definer set search_path to ''
as $$ select exists (select 1 from public.cuentas where id = p_cuenta and hogar_id = public.mi_hogar()
  and (propietario_id = auth.uid() or propietario_id is null)) $$;

create table if not exists public.fechas_corte (
  cuenta_id uuid not null references public.cuentas(id) on delete cascade,
  corte date not null,
  fecha_pago date not null,
  primary key (cuenta_id, corte)
);
alter table public.fechas_corte enable row level security;
drop policy if exists fc_todo on public.fechas_corte;
create policy fc_todo on public.fechas_corte for all using (public._tarjeta_mia(cuenta_id)) with check (public._tarjeta_mia(cuenta_id));

create table if not exists public.cuadres (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas(id) on delete cascade,
  creado_por uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  tipo text not null check (tipo in ('saldo', 'estado')),
  fuente text not null default 'manual' check (fuente in ('manual', 'pdf')),
  corte date,           -- estado de cuenta: su fecha de corte
  saldo_banco numeric,  -- saldo: lo que muestra hoy la app del banco; estado: saldo al corte
  saldo_app numeric,
  pago_banco numeric,   -- estado: pago para no generar intereses
  pago_app numeric,
  datos jsonb           -- lo leído del PDF y las compras a meses comparadas
);
create index if not exists cuadres_cuenta on public.cuadres (cuenta_id, created_at desc);
alter table public.cuadres enable row level security;
drop policy if exists cuadres_todo on public.cuadres;
create policy cuadres_todo on public.cuadres for all using (public._tarjeta_mia(cuenta_id)) with check (public._tarjeta_mia(cuenta_id));

-- Último corte que ya ocurrió (hoy cuenta si es día de corte); misma regla que detalle_cuenta
create or replace function public._ultimo_corte(p_dia integer, p_hoy date)
 returns date language sql immutable set search_path to ''
as $$
  select case when p_dia is null then null
    when extract(day from p_hoy) >= least(p_dia, public._ultimo_dia(p_hoy))
      then date_trunc('month', p_hoy)::date + least(p_dia, public._ultimo_dia(p_hoy)) - 1
    else (date_trunc('month', p_hoy) - interval '1 month')::date
      + least(p_dia, public._ultimo_dia((date_trunc('month', p_hoy) - interval '1 month')::date)) - 1 end
$$;

-- Fecha límite de pago del corte p_corte según la regla de la tarjeta (o la que fijó su estado de cuenta)
create or replace function public._fecha_pago(c public.cuentas, p_corte date)
 returns date language plpgsql stable security definer set search_path to ''
as $$
declare f date;
begin
  if p_corte is null then return null; end if;
  select fecha_pago into f from public.fechas_corte where cuenta_id = c.id and corte = p_corte;
  if f is not null then return f; end if;
  f := case c.pago_regla
    when 'dias' then p_corte + coalesce(c.pago_dias, 20)
    when 'corte' then public._proxima_fecha(c.dia_corte, p_corte + 1)
    else public._proxima_fecha(c.dia_pago, p_corte + 1) end;
  if f is null then return null; end if;
  if c.pago_habil = 'antes' then f := f - case extract(isodow from f)::int when 6 then 1 when 7 then 2 else 0 end;
  elsif c.pago_habil = 'despues' then f := f + case extract(isodow from f)::int when 6 then 2 when 7 then 1 else 0 end;
  end if;
  return f;
end $$;

-- Deuda calculada: lo que faltaba de las compras a meses de antes del inicio (las de contado ya estaban pagadas)
create or replace function public._previas(c public.cuentas)
 returns numeric language sql stable set search_path to ''
as $$
  select coalesce(sum(m.monto - public._msi_cobrado(m.monto, m.meses_msi,
      public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, c.fecha_saldo_inicial - 1))), 0)
  from public.movimientos m
  where c.saldo_calculado and m.cuenta_id = c.id and m.tipo = 'gasto' and m.meses_msi is not null and m.fecha < c.fecha_saldo_inicial
$$;

-- Qué movimientos cuentan en el saldo: con deuda calculada, todo desde el inicio (sin banderas de saldo inicial)
create or replace function public._cuenta_cuenta_mov(m public.movimientos, c public.cuentas)
 returns boolean language sql stable set search_path to ''
as $$ select (case when c.saldo_calculado then m.fecha >= c.fecha_saldo_inicial
  else (m.fecha >= c.fecha_saldo_inicial and not m.en_saldo_inicial) or m.sumar_a_saldo end) and m.fecha <= public.hoy() $$;

-- Cambia una tarjeta a deuda calculada: al corriente al corte anterior a p_desde; desde ahí cuenta lo que registres
create or replace function public.iniciar_deuda_calculada(p_cuenta uuid, p_desde date)
 returns void language plpgsql security definer set search_path to ''
as $$
declare c public.cuentas;
begin
  select * into c from public.cuentas where id = p_cuenta and hogar_id = public.mi_hogar()
    and (propietario_id = auth.uid() or propietario_id is null);
  if not found or c.tipo <> 'credito' then raise exception 'Tarjeta no encontrada'; end if;
  if c.dia_corte is null then raise exception 'Primero escribe el día de corte'; end if;
  if p_desde is null or p_desde > public.hoy() then raise exception 'La fecha de inicio no puede ser futura'; end if;
  update public.cuentas set saldo_calculado = true, saldo_inicial = 0, fecha_saldo_inicial = p_desde,
    pago_corte_manual = null, pago_corte_de = null where id = p_cuenta;
  -- Las banderas del saldo inicial ya no aplican: cada movimiento cuenta por su fecha
  update public.movimientos set en_saldo_inicial = false, sumar_a_saldo = false
  where cuenta_id = p_cuenta and (en_saldo_inicial or sumar_a_saldo);
end $$;

-- detalle_cuenta: deuda calculada, fecha de pago por regla y el último cuadre
create or replace function public.detalle_cuenta(p_cuenta uuid)
 returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare
  c public.cuentas; hoy date := public.hoy(); ult date; prox date; ini_mes date := date_trunc('month', public.hoy())::date;
  saldo numeric; saldo_corte numeric; msi_corte numeric; pagado numeric; conocido boolean; manual boolean; r jsonb; previas numeric;
begin
  select * into c from public.cuentas where id = p_cuenta and hogar_id = public.mi_hogar()
    and (propietario_id = auth.uid() or propietario_id is null);
  if not found then raise exception 'Cuenta no encontrada'; end if;
  previas := public._previas(c);

  select c.saldo_inicial - previas + coalesce(sum(public._efecto_mov(m, c.id)), 0) into saldo
  from public.movimientos m where (m.cuenta_id = c.id or m.cuenta_destino_id = c.id) and public._cuenta_cuenta_mov(m, c);

  r := jsonb_build_object('saldo', saldo, 'tipo', c.tipo, 'nombre', c.nombre, 'limite', c.limite_credito,
    'dia_corte', c.dia_corte, 'dia_pago', c.dia_pago, 'fecha_saldo_inicial', c.fecha_saldo_inicial,
    'saldo_calculado', c.saldo_calculado, 'pago_regla', c.pago_regla, 'pago_dias', c.pago_dias, 'pago_habil', c.pago_habil,
    'banco_incluye_msi', c.banco_incluye_msi,
    'mes_gastos', (select coalesce(sum(m.monto), 0) from public.movimientos m where m.cuenta_id = c.id and m.tipo = 'gasto' and not m.en_saldo_inicial and m.fecha >= ini_mes and m.fecha <= hoy),
    'mes_ingresos', (select coalesce(sum(m.monto), 0) from public.movimientos m where m.cuenta_id = c.id and m.tipo in ('ingreso','reembolso') and m.fecha >= ini_mes and m.fecha <= hoy),
    'mes_entradas', (select coalesce(sum(m.monto), 0) from public.movimientos m where m.cuenta_destino_id = c.id and m.tipo in ('transferencia','liquidacion') and m.fecha >= ini_mes and m.fecha <= hoy),
    'mes_salidas', (select coalesce(sum(m.monto), 0) from public.movimientos m where m.cuenta_id = c.id and m.tipo in ('transferencia','liquidacion') and m.fecha >= ini_mes and m.fecha <= hoy),
    'aplazados', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'fecha', m.fecha, 'fecha_compra', m.fecha_compra, 'monto', m.monto,
        'meses', m.meses_msi, 'descripcion', coalesce(m.descripcion, m.comercio, 'Cargo')) order by m.fecha)
      from public.movimientos m where m.cuenta_id = c.id and m.tipo = 'gasto' and m.fecha > hoy), '[]'::jsonb),
    'cuadre', (select to_jsonb(q) - 'datos' from public.cuadres q where q.cuenta_id = c.id order by q.created_at desc limit 1));

  if c.tipo <> 'credito' or c.dia_corte is null then return r; end if;

  ult := public._ultimo_corte(c.dia_corte, hoy);
  prox := public._proxima_fecha(c.dia_corte, ult + 1);
  -- Con deuda calculada se empieza al corriente el día siguiente a un corte, así que ese corte ya se conoce
  conocido := c.fecha_saldo_inicial <= ult + case when c.saldo_calculado then 1 else 0 end;
  manual := not conocido and c.pago_corte_de = ult and c.pago_corte_manual is not null;

  select c.saldo_inicial - previas + coalesce(sum(public._efecto_mov(m, c.id)), 0) into saldo_corte
  from public.movimientos m where (m.cuenta_id = c.id or m.cuenta_destino_id = c.id) and public._cuenta_cuenta_mov(m, c) and m.fecha <= ult;

  select coalesce(sum(m.monto - public._msi_cobrado(m.monto, m.meses_msi, public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, ult))), 0) into msi_corte
  from public.movimientos m where m.cuenta_id = c.id and m.tipo = 'gasto' and m.meses_msi is not null and (m.fecha <= ult or m.en_saldo_inicial);

  select coalesce(sum(public._efecto_mov(m, c.id)), 0) into pagado
  from public.movimientos m where (m.cuenta_id = c.id or m.cuenta_destino_id = c.id) and public._cuenta_cuenta_mov(m, c)
    and m.fecha > ult and m.cuenta_destino_id = c.id and m.tipo in ('transferencia', 'liquidacion');

  return r || jsonb_build_object(
    'ultimo_corte', ult, 'proximo_corte', prox,
    'fecha_pago', public._fecha_pago(c, ult),
    'fecha_pago_siguiente', public._fecha_pago(c, prox),
    'fecha_pago_fijada', exists (select 1 from public.fechas_corte f where f.cuenta_id = c.id and f.corte = ult),
    'corte_conocido', conocido, 'pago_manual', manual,
    'pago_corte', case when manual then c.pago_corte_manual else greatest(0, -saldo_corte - msi_corte) end,
    -- Lo que dijo el estado de cuenta de este corte, si lo cuadraste
    'cuadre_corte', (select to_jsonb(q) - 'datos' from public.cuadres q where q.cuenta_id = c.id and q.tipo = 'estado' and q.corte = ult order by q.created_at desc limit 1),
    'pagado_desde_corte', pagado,
    'msi_por_facturar', (select coalesce(sum(m.monto - public._msi_cobrado(m.monto, m.meses_msi, public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, hoy))), 0)
      from public.movimientos m where m.cuenta_id = c.id and m.tipo = 'gasto' and m.meses_msi is not null and m.fecha <= hoy),
    'periodo_contado', (select coalesce(sum(m.monto), 0) from public.movimientos m where m.cuenta_id = c.id and m.tipo = 'gasto' and m.meses_msi is null and m.fecha > ult and m.fecha <= hoy and not m.en_saldo_inicial),
    'periodo_msi_nuevas', (select coalesce(sum(m.monto), 0) from public.movimientos m where m.cuenta_id = c.id and m.tipo = 'gasto' and m.meses_msi is not null and m.fecha > ult and m.fecha <= hoy and not m.en_saldo_inicial),
    'periodo_devoluciones', (select coalesce(sum(m.monto), 0) from public.movimientos m where m.cuenta_id = c.id and m.tipo in ('ingreso','reembolso') and m.fecha > ult and m.fecha <= hoy and not m.en_saldo_inicial),
    'mensualidades_proximo', (select coalesce(sum(public._msi_cobrado(m.monto, m.meses_msi, public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, prox)) - public._msi_cobrado(m.monto, m.meses_msi, public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, ult))), 0)
      from public.movimientos m where m.cuenta_id = c.id and m.tipo = 'gasto' and m.meses_msi is not null),
    'msi', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'descripcion', coalesce(m.descripcion, m.comercio, 'Compra'), 'meses', m.meses_msi,
        'mensualidad', round(m.monto / m.meses_msi, 2), 'facturadas', x.f, 'restantes', m.meses_msi - x.f) order by m.meses_msi - x.f desc)
      from public.movimientos m cross join lateral (select public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, hoy) f) x
      where m.cuenta_id = c.id and m.tipo = 'gasto' and m.meses_msi is not null and m.fecha <= hoy and x.f < m.meses_msi), '[]'::jsonb));
end $function$;

-- saldos_cuentas: el mismo saldo que detalle_cuenta y la fecha de pago por regla
create or replace function public.saldos_cuentas()
 returns table(id uuid, nombre text, tipo text, propietario_id uuid, propietario_nombre text, mia boolean, conjunta boolean, visibilidad text, activa boolean, saldo numeric, limite_credito numeric, disponible numeric, dia_corte smallint, dia_pago smallint, proximo_pago date, msi_por_facturar numeric)
 language sql stable security definer set search_path to ''
as $function$
  select c.id, c.nombre, c.tipo, c.propietario_id, mb.nombre, c.propietario_id = auth.uid(), c.propietario_id is null,
    c.visibilidad, c.activa,
    c.saldo_inicial - public._previas(c) + coalesce((select sum(public._efecto_mov(m, c.id))
      from public.movimientos m where (m.cuenta_id = c.id or m.cuenta_destino_id = c.id) and public._cuenta_cuenta_mov(m, c)), 0),
    c.limite_credito, null::numeric, c.dia_corte, c.dia_pago,
    case when c.tipo = 'credito' and c.dia_corte is not null then
      (select case when x.f >= public.hoy() then x.f
         else public._fecha_pago(c, public._proxima_fecha(c.dia_corte, public._ultimo_corte(c.dia_corte, public.hoy()) + 1)) end
       from (select public._fecha_pago(c, public._ultimo_corte(c.dia_corte, public.hoy())) f) x)
    else public._proxima_fecha(c.dia_pago, public.hoy()) end,
    coalesce((select sum(m.monto - public._msi_cobrado(m.monto, m.meses_msi, public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, public.hoy())))
      from public.movimientos m where m.cuenta_id = c.id and m.tipo = 'gasto' and m.meses_msi is not null), 0)
  from public.cuentas c left join public.miembros mb on mb.user_id = c.propietario_id
  where c.hogar_id = public.mi_hogar()
    and (c.propietario_id = auth.uid() or c.propietario_id is null or c.visibilidad <> 'privada')
  order by (c.propietario_id = auth.uid()) desc nulls last, c.orden, c.nombre
$function$;

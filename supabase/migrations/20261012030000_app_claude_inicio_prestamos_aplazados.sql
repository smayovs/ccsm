-- Cambios hechos desde la app de Claude (no desde Code) entre el 7 y el 12 de oct de 2026.
-- Ya están aplicados en la base de producción; este archivo los deja por escrito para que no se pisen.
-- Las funciones son copia EXACTA de la definición que había en la base al guardar este archivo
-- (verificada con md5 de pg_get_functiondef), así que ya incluyen los parches de 20261012010000 y 20261012020000.
-- Regla para cualquier sesión: antes de cambiar una función, parte de su definición actual en la base
-- (pg_get_functiondef), no de un archivo viejo.

-- ---------- Cuentas: tipo "prestamo" (deudas y préstamos) con pago mensual ----------
alter table public.cuentas drop constraint if exists cuentas_tipo_check;
alter table public.cuentas add constraint cuentas_tipo_check check (tipo = any (array['debito','credito','ahorro','efectivo','inversion','prestamo']));
alter table public.cuentas add column if not exists pago_mensual numeric;

-- ---------- Cargos aplazados: el movimiento vive en la fecha de cobro; fecha_compra guarda cuándo compraste ----------
-- Todo movimiento con fecha futura no afecta saldos ni pagos hasta su fecha (_cuenta_cuenta_mov, saldos_cuentas, detalle_cuenta).
alter table public.movimientos add column if not exists fecha_compra date;

-- ---------- Preferencias por usuario: secciones de Inicio y apariencia (colores, letra) ----------
create table if not exists public.preferencias (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  inicio jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.preferencias add column if not exists apariencia jsonb not null default '{}'::jsonb;
alter table public.preferencias enable row level security;
drop policy if exists preferencias_propias on public.preferencias;
create policy preferencias_propias on public.preferencias for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on public.preferencias to authenticated;

-- ---------- Funciones ----------

-- _cuenta_cuenta_mov
CREATE OR REPLACE FUNCTION public._cuenta_cuenta_mov(m movimientos, c cuentas)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select ((m.fecha >= c.fecha_saldo_inicial and not m.en_saldo_inicial) or m.sumar_a_saldo) and m.fecha <= public.hoy() $function$
;

-- saldos_cuentas
CREATE OR REPLACE FUNCTION public.saldos_cuentas()
 RETURNS TABLE(id uuid, nombre text, tipo text, propietario_id uuid, propietario_nombre text, mia boolean, conjunta boolean, visibilidad text, activa boolean, saldo numeric, limite_credito numeric, disponible numeric, dia_corte smallint, dia_pago smallint, proximo_pago date, msi_por_facturar numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.id, c.nombre, c.tipo, c.propietario_id, mb.nombre, c.propietario_id = auth.uid(), c.propietario_id is null,
    c.visibilidad, c.activa,
    c.saldo_inicial + coalesce((select sum(case
        when m.cuenta_id = c.id and m.tipo in ('ingreso','reembolso') then m.monto
        when m.cuenta_id = c.id and m.tipo in ('gasto','transferencia','liquidacion') then -m.monto
        when m.cuenta_destino_id = c.id and m.tipo in ('transferencia','liquidacion') then m.monto else 0 end)
      from public.movimientos m where (m.cuenta_id = c.id or m.cuenta_destino_id = c.id)
        and ((m.fecha >= c.fecha_saldo_inicial and not m.en_saldo_inicial) or m.sumar_a_saldo) and m.fecha <= public.hoy()), 0),
    c.limite_credito, null::numeric, c.dia_corte, c.dia_pago, public._proxima_fecha(c.dia_pago, public.hoy()),
    coalesce((select sum(m.monto - public._msi_cobrado(m.monto, m.meses_msi, public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, public.hoy())))
      from public.movimientos m where m.cuenta_id = c.id and m.tipo = 'gasto' and m.meses_msi is not null), 0)
  from public.cuentas c left join public.miembros mb on mb.user_id = c.propietario_id
  where c.hogar_id = public.mi_hogar()
    and (c.propietario_id = auth.uid() or c.propietario_id is null or c.visibilidad <> 'privada')
  order by (c.propietario_id = auth.uid()) desc nulls last, c.orden, c.nombre
$function$
;

-- detalle_cuenta
CREATE OR REPLACE FUNCTION public.detalle_cuenta(p_cuenta uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c public.cuentas; hoy date := public.hoy(); ult date; prox date; ini_mes date := date_trunc('month', public.hoy())::date;
  saldo numeric; saldo_corte numeric; msi_corte numeric; pagado numeric; conocido boolean; manual boolean; r jsonb;
begin
  select * into c from public.cuentas where id = p_cuenta and hogar_id = public.mi_hogar()
    and (propietario_id = auth.uid() or propietario_id is null);
  if not found then raise exception 'Cuenta no encontrada'; end if;

  select c.saldo_inicial + coalesce(sum(public._efecto_mov(m, c.id)), 0) into saldo
  from public.movimientos m where (m.cuenta_id = c.id or m.cuenta_destino_id = c.id) and public._cuenta_cuenta_mov(m, c);

  r := jsonb_build_object('saldo', saldo, 'tipo', c.tipo, 'nombre', c.nombre, 'limite', c.limite_credito,
    'dia_corte', c.dia_corte, 'dia_pago', c.dia_pago, 'fecha_saldo_inicial', c.fecha_saldo_inicial,
    'mes_gastos', (select coalesce(sum(m.monto), 0) from public.movimientos m where m.cuenta_id = c.id and m.tipo = 'gasto' and not m.en_saldo_inicial and m.fecha >= ini_mes and m.fecha <= hoy),
    'mes_ingresos', (select coalesce(sum(m.monto), 0) from public.movimientos m where m.cuenta_id = c.id and m.tipo in ('ingreso','reembolso') and m.fecha >= ini_mes and m.fecha <= hoy),
    'mes_entradas', (select coalesce(sum(m.monto), 0) from public.movimientos m where m.cuenta_destino_id = c.id and m.tipo in ('transferencia','liquidacion') and m.fecha >= ini_mes and m.fecha <= hoy),
    'mes_salidas', (select coalesce(sum(m.monto), 0) from public.movimientos m where m.cuenta_id = c.id and m.tipo in ('transferencia','liquidacion') and m.fecha >= ini_mes and m.fecha <= hoy),
    'aplazados', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'fecha', m.fecha, 'fecha_compra', m.fecha_compra, 'monto', m.monto,
        'meses', m.meses_msi, 'descripcion', coalesce(m.descripcion, m.comercio, 'Cargo')) order by m.fecha)
      from public.movimientos m where m.cuenta_id = c.id and m.tipo = 'gasto' and m.fecha > hoy), '[]'::jsonb));

  if c.tipo <> 'credito' or c.dia_corte is null then return r; end if;

  ult := case when extract(day from hoy) >= least(c.dia_corte, public._ultimo_dia(hoy))
    then (date_trunc('month', hoy) + (least(c.dia_corte, public._ultimo_dia(hoy)) - 1) * interval '1 day')::date
    else (date_trunc('month', hoy) - interval '1 month'
      + (least(c.dia_corte, public._ultimo_dia((date_trunc('month', hoy) - interval '1 month')::date)) - 1) * interval '1 day')::date end;
  prox := public._proxima_fecha(c.dia_corte, ult + 1);
  conocido := c.fecha_saldo_inicial <= ult;
  manual := not conocido and c.pago_corte_de = ult and c.pago_corte_manual is not null;

  select c.saldo_inicial + coalesce(sum(public._efecto_mov(m, c.id)), 0) into saldo_corte
  from public.movimientos m where (m.cuenta_id = c.id or m.cuenta_destino_id = c.id) and public._cuenta_cuenta_mov(m, c) and m.fecha <= ult;

  select coalesce(sum(m.monto - public._msi_cobrado(m.monto, m.meses_msi, public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, ult))), 0) into msi_corte
  from public.movimientos m where m.cuenta_id = c.id and m.tipo = 'gasto' and m.meses_msi is not null and (m.fecha <= ult or m.en_saldo_inicial);

  select coalesce(sum(public._efecto_mov(m, c.id)), 0) into pagado
  from public.movimientos m where (m.cuenta_id = c.id or m.cuenta_destino_id = c.id) and public._cuenta_cuenta_mov(m, c)
    and m.fecha > ult and m.cuenta_destino_id = c.id and m.tipo in ('transferencia', 'liquidacion');

  return r || jsonb_build_object(
    'ultimo_corte', ult, 'proximo_corte', prox,
    'fecha_pago', public._proxima_fecha(c.dia_pago, ult + 1),
    'fecha_pago_siguiente', public._proxima_fecha(c.dia_pago, prox + 1),
    'corte_conocido', conocido, 'pago_manual', manual,
    'pago_corte', case when manual then c.pago_corte_manual else greatest(0, -saldo_corte - msi_corte) end,
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
end $function$
;

-- cuadrar_tarjeta
CREATE OR REPLACE FUNCTION public.cuadrar_tarjeta(p_cuenta uuid, p_cambios jsonb, p_deuda numeric, p_pago numeric, p_corte date, p_quitar uuid[] DEFAULT NULL::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.cuentas; hoy date := public.hoy(); x jsonb; ajuste numeric;
begin
  select * into c from public.cuentas where id = p_cuenta and hogar_id = public.mi_hogar()
    and (propietario_id = auth.uid() or propietario_id is null);
  if not found or c.tipo <> 'credito' then raise exception 'Tarjeta no encontrada'; end if;
  if p_deuda is null or p_deuda < 0 then raise exception 'La deuda no puede ser negativa'; end if;

  -- Compras a meses que quitaste de la lista: solo las tuyas, de esta tarjeta
  if p_quitar is not null then
    delete from public.movimientos
    where id = any(p_quitar) and cuenta_id = p_cuenta and creado_por = auth.uid() and tipo = 'gasto' and meses_msi is not null;
  end if;

  for x in select * from jsonb_array_elements(coalesce(p_cambios, '[]'::jsonb)) loop
    if coalesce((x->>'meses')::int, 2) < 2 then raise exception 'Una compra a meses necesita al menos 2 meses'; end if;
    if nullif(x->>'id', '') is not null then
      update public.movimientos set
        monto = coalesce((x->>'monto')::numeric, monto), meses_msi = coalesce((x->>'meses')::int, meses_msi),
        fecha = coalesce((x->>'fecha')::date, fecha), descripcion = coalesce(x->>'descripcion', descripcion),
        en_saldo_inicial = true, sumar_a_saldo = false
      where id = (x->>'id')::uuid and cuenta_id = p_cuenta and creado_por = auth.uid();
    else
      insert into public.movimientos (hogar_id, creado_por, tipo, monto, meses_msi, fecha, descripcion, cuenta_id, origen, en_saldo_inicial, sumar_a_saldo)
      values (c.hogar_id, auth.uid(), 'gasto', (x->>'monto')::numeric, (x->>'meses')::int, (x->>'fecha')::date,
        coalesce(nullif(x->>'descripcion', ''), 'Compra a meses'), p_cuenta, 'Saldo inicial', true, false);
    end if;
  end loop;

  update public.movimientos set sumar_a_saldo = false
  where cuenta_id = p_cuenta and tipo in ('gasto', 'ingreso', 'reembolso') and fecha < hoy and sumar_a_saldo;
  -- Los cargos aplazados (fecha futura) no vienen en el saldo del banco: se quedan fuera
  update public.movimientos set en_saldo_inicial = true
  where cuenta_id = p_cuenta and tipo = 'gasto' and meses_msi is not null and not en_saldo_inicial and fecha <= hoy;

  select coalesce(sum(public._efecto_mov(m, p_cuenta)), 0) into ajuste
  from public.movimientos m where (m.cuenta_id = p_cuenta or m.cuenta_destino_id = p_cuenta)
    and ((m.fecha = hoy and not m.en_saldo_inicial) or (m.sumar_a_saldo and m.fecha <= hoy));

  update public.cuentas set saldo_inicial = -p_deuda - ajuste, fecha_saldo_inicial = hoy,
    pago_corte_manual = p_pago, pago_corte_de = case when p_pago is null then null else p_corte end
  where id = p_cuenta;
end $function$
;

-- msi_partes
CREATE OR REPLACE FUNCTION public.msi_partes()
 RETURNS TABLE(movimiento_id uuid, persona text, clave text, parte numeric, cobro_completo boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select m.id, f.nombre, 'f:' || f.id, m.monto, coalesce(m.cobro_completo, false)
  from public.movimientos m join public.familiares f on f.id = m.familiar_id
  where m.creado_por = auth.uid() and m.tipo = 'gasto' and m.meses_msi is not null
  union all
  select m.id, f.nombre, 'f:' || f.id, pp.monto, coalesce(m.cobro_completo, false)
  from public.partes_personas pp join public.movimientos m on m.id = pp.movimiento_id
  join public.familiares f on f.id = pp.familiar_id
  where m.creado_por = auth.uid() and m.tipo = 'gasto' and m.meses_msi is not null
  union all
  select m.id, coalesce(mb.nombre, 'Tu pareja'), 'u:' || r.user_id, r.monto, false
  from public.repartos r join public.movimientos m on m.id = r.movimiento_id
  left join public.miembros mb on mb.user_id = r.user_id
  where m.creado_por = auth.uid() and m.tipo = 'gasto' and m.meses_msi is not null and r.user_id <> auth.uid()
$function$
;

-- gastos_detalle
CREATE OR REPLACE FUNCTION public.gastos_detalle(p_desde date, p_hasta date)
 RETURNS TABLE(mes date, categoria_id uuid, categoria text, icono text, sub_id uuid, sub text, sub_icono text, cuenta_id uuid, cuenta text, cuenta_tipo text, monto numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select date_trunc('month', g.fecha)::date, p.id, coalesce(p.nombre, 'Sin categoría'), p.icono,
    case when cat.padre_id is not null then cat.id end,
    case when cat.padre_id is not null then cat.nombre end,
    case when cat.padre_id is not null then cat.icono end,
    case when c.propietario_id = auth.uid() or c.propietario_id is null then c.id end,
    case when c.id is null then 'Sin cuenta' when c.propietario_id = auth.uid() or c.propietario_id is null then c.nombre else 'Pagado por tu pareja' end,
    case when c.propietario_id = auth.uid() or c.propietario_id is null then c.tipo end,
    sum(g.monto)
  from public._gastos_personales(auth.uid(), p_desde, p_hasta) g
  join public.movimientos m on m.id = g.movimiento_id
  left join public.cuentas c on c.id = m.cuenta_id
  left join public.categorias cat on cat.id = g.categoria_id
  left join public.categorias p on p.id = coalesce(cat.padre_id, cat.id)
  group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
$function$
;

-- gastos_lista
CREATE OR REPLACE FUNCTION public.gastos_lista(p_desde date, p_hasta date)
 RETURNS TABLE(movimiento_id uuid, fecha date, monto numeric, categoria_id uuid, categoria text, icono text, sub_id uuid, sub text, cuenta_id uuid, cuenta text, cuenta_tipo text, texto text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select g.movimiento_id, g.fecha, g.monto, p.id, coalesce(p.nombre, 'Sin categoría'), p.icono,
    case when cat.padre_id is not null then cat.id end, case when cat.padre_id is not null then cat.nombre end,
    case when c.propietario_id = auth.uid() or c.propietario_id is null then c.id end,
    case when c.id is null then 'Sin cuenta' when c.propietario_id = auth.uid() or c.propietario_id is null then c.nombre else 'Pagado por tu pareja' end,
    case when c.propietario_id = auth.uid() or c.propietario_id is null then c.tipo end,
    coalesce(nullif(trim(m.comercio), ''), nullif(trim(m.descripcion), ''), 'Sin descripción')
  from public._gastos_personales(auth.uid(), p_desde, p_hasta) g
  join public.movimientos m on m.id = g.movimiento_id
  left join public.cuentas c on c.id = m.cuenta_id
  left join public.categorias cat on cat.id = g.categoria_id
  left join public.categorias p on p.id = coalesce(cat.padre_id, cat.id)
$function$
;

-- flujo_meses
CREATE OR REPLACE FUNCTION public.flujo_meses(p_desde date, p_hasta date)
 RETURNS TABLE(mes date, ingresos numeric, gastos numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with meses as (select generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta - 1), interval '1 month')::date as mes)
  select x.mes,
    coalesce((select sum(m.monto) from public.movimientos m join public.cuentas c on c.id = m.cuenta_id
      where m.creado_por = auth.uid() and m.tipo = 'ingreso' and c.propietario_id is not null
        and m.fecha >= x.mes and m.fecha < (x.mes + interval '1 month')::date), 0),
    coalesce((select sum(g.monto) from public._gastos_personales(auth.uid(), x.mes, (x.mes + interval '1 month')::date) g), 0)
  from meses x order by 1
$function$
;

-- _atajo_catalogos_base
CREATE OR REPLACE FUNCTION public._atajo_catalogos_base(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid := public._atajo_usuario(p_token); h uuid; cats jsonb; otro text;
begin
  if u is null then return jsonb_build_object('ok', false, 'mensaje', 'Llave inválida o revocada'); end if;
  select hogar_id into h from public.miembros where user_id = u;
  select jsonb_build_object(
    'Gasto', coalesce((select jsonb_object_agg(p.nombre, coalesce(
        (select jsonb_agg(s.nombre order by s.orden) from public.categorias s where s.padre_id = p.id and not s.archivada),
        '["(general)"]'::jsonb) order by p.propietario_id nulls last, p.orden)
      from public.categorias p where p.hogar_id = h and p.tipo = 'gasto' and p.padre_id is null and not p.archivada
        and (p.propietario_id = u or p.propietario_id is null)), '{}'::jsonb),
    'Ingreso', coalesce((select jsonb_object_agg(p.nombre, coalesce(
        (select jsonb_agg(s.nombre order by s.orden) from public.categorias s where s.padre_id = p.id and not s.archivada),
        '["(general)"]'::jsonb) order by p.orden)
      from public.categorias p where p.hogar_id = h and p.tipo = 'ingreso' and p.padre_id is null and not p.archivada
        and (p.propietario_id = u or p.propietario_id is null)), '{}'::jsonb)) into cats;
  select nombre into otro from public.miembros where hogar_id = h and user_id <> u limit 1;
  return jsonb_build_object(
    'ok', true,
    'tipos', '["Gasto","Ingreso","Transferencia","Reembolso"]'::jsonb,
    'cuentas', coalesce((select jsonb_agg(nombre order by propietario_id nulls last, orden, nombre) from public.cuentas
      where hogar_id = h and activa and (propietario_id = u or propietario_id is null)), '[]'::jsonb),
    'categorias', cats,
    'personas', coalesce((select jsonb_agg(nombre order by nombre) from public.familiares where propietario_id = u and activo), '[]'::jsonb)
      || case when otro is not null then jsonb_build_array(otro) else '[]'::jsonb end,
    'paraQuien', jsonb_build_array('Para mí') || coalesce((select jsonb_agg(nombre order by nombre) from public.familiares
      where propietario_id = u and activo), '[]'::jsonb),
    'compartido', case when otro is null then '["No"]'::jsonb
      else jsonb_build_array('No', '50/50', 'Porcentaje', 'Monto', 'Todo de ' || otro) end,
    'gastos', coalesce((select jsonb_agg(x.t order by x.o1, x.o2, x.pn, x.o3) from (
        select p.nombre as t, (p.propietario_id is null)::int as o1, p.orden as o2, p.nombre as pn, -1 as o3
        from public.categorias p where p.hogar_id = h and p.tipo = 'gasto' and p.padre_id is null and not p.archivada
          and (p.propietario_id = u or p.propietario_id is null)
        union all
        select p.nombre || ' › ' || s2.nombre, (p.propietario_id is null)::int, p.orden, p.nombre, s2.orden
        from public.categorias p join public.categorias s2 on s2.padre_id = p.id and not s2.archivada
        where p.hogar_id = h and p.tipo = 'gasto' and p.padre_id is null and not p.archivada
          and (p.propietario_id = u or p.propietario_id is null)) x), '[]'::jsonb),
    'formaPago', '["Contado","A meses","Aplazado"]'::jsonb,
    'meses', '["Sin meses","3","6","9","12","18","24"]'::jsonb);
end $function$
;

-- atajo_registrar
CREATE OR REPLACE FUNCTION public.atajo_registrar(p_token text, d jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  u uuid := public._atajo_usuario(p_token);
  h uuid; otro_id uuid; otro_nombre text;
  v_tipo text; v_monto numeric; v_cuenta uuid; v_cuenta_nombre text; v_destino uuid; v_destino_nombre text;
  v_cat uuid; v_cat_nombre text; v_sub_nombre text; v_padre uuid; v_familiar uuid; v_familiar_nombre text;
  v_meses int; v_fecha date; v_desc text; v_comercio text; v_texto text; v_revisar boolean := false;
  v_pct numeric; v_modo text; v_valor numeric; comp text;
  susc public.suscripciones; regla public.reglas; avisos text[] := '{}'; msg text; mid uuid; parte numeric;
  pres numeric; gastado numeric; v_cobro date; v_div text; persona text; tarjeta text;
begin
  if u is null then return jsonb_build_object('ok', false, 'mensaje', 'Llave inválida o revocada'); end if;
  select hogar_id into h from public.miembros where user_id = u;
  select user_id, nombre into otro_id, otro_nombre from public.miembros where hogar_id = h and user_id <> u limit 1;

  v_tipo := case lower(trim(coalesce(d ->> 'tipo', 'gasto')))
    when 'gasto' then 'gasto' when 'ingreso' then 'ingreso' when 'transferencia' then 'transferencia'
    when 'reembolso' then 'reembolso' else null end;
  if v_tipo is null then return jsonb_build_object('ok', false, 'mensaje', 'Tipo no válido: ' || coalesce(d ->> 'tipo', '')); end if;

  v_monto := public._parse_monto(d ->> 'monto');
  if v_monto is null or v_monto <= 0 then
    return jsonb_build_object('ok', false, 'mensaje', 'Monto no válido: ' || coalesce(d ->> 'monto', '')); end if;

  v_fecha := case when coalesce(d ->> 'fecha', '') ~ '^\d{4}-\d{2}-\d{2}' then left(d ->> 'fecha', 10)::date else public.hoy() end;
  v_comercio := nullif(trim(coalesce(d ->> 'comercio', '')), '');
  v_desc := coalesce(nullif(trim(coalesce(d ->> 'descripcion', '')), ''), v_comercio);
  v_texto := upper(coalesce(v_comercio, '') || ' ' || coalesce(v_desc, ''));

  -- Cuenta: por nombre exacto o por nombre en Wallet
  select id, nombre into v_cuenta, v_cuenta_nombre from public.cuentas
  where hogar_id = h and (propietario_id = u or propietario_id is null) and lower(nombre) = lower(trim(coalesce(d ->> 'cuenta', '')));
  if v_cuenta is null and coalesce(d ->> 'tarjeta', '') <> '' then
    tarjeta := lower(d ->> 'tarjeta');
    select id, nombre into v_cuenta, v_cuenta_nombre from public.cuentas
    where hogar_id = h and (propietario_id = u or propietario_id is null) and coalesce(nombre_wallet, '') <> ''
      and position(lower(nombre_wallet) in tarjeta) > 0
    order by length(nombre_wallet) desc limit 1;
  end if;
  if v_cuenta is null then
    if v_tipo = 'gasto' then
      v_revisar := true;
      avisos := avisos || ('Cuenta no reconocida ("' || coalesce(nullif(d ->> 'cuenta', ''), d ->> 'tarjeta', '?') || '"): quedó en Pendientes. Revisa "Nombre en Wallet" en Ajustes.');
    else
      return jsonb_build_object('ok', false, 'mensaje', 'Cuenta no reconocida: ' || coalesce(d ->> 'cuenta', ''));
    end if;
  end if;

  -- Persona (familiar o tu pareja)
  persona := nullif(trim(coalesce(d ->> 'porCuentaDe', '')), '');
  if persona is not null and lower(persona) <> 'para mí' and lower(persona) <> 'para mi' then
    select id, nombre into v_familiar, v_familiar_nombre from public.familiares where propietario_id = u and lower(nombre) = lower(persona);
    if v_familiar is null and otro_id is not null and lower(persona) = lower(otro_nombre) then
      if v_tipo = 'gasto' then comp := 'todo';
      elsif v_tipo = 'reembolso' then
        -- tu pareja te pagó: es una liquidación
        insert into public.movimientos (hogar_id, creado_por, fecha, tipo, monto, cuenta_destino_id, descripcion, liq_de, liq_para, origen)
        values (h, u, v_fecha, 'liquidacion', v_monto, v_cuenta, coalesce(v_desc, 'Liquidación'), otro_id, u, coalesce(d ->> 'origen', 'Atajo'));
        return jsonb_build_object('ok', true, 'mensaje', otro_nombre || ' te pagó ' || public._fmt(v_monto) || ' (' || v_cuenta_nombre || ')');
      end if;
    elsif v_familiar is null then
      avisos := avisos || ('"' || persona || '" no está en tu lista de personas (Más › Personas); se registró como tuyo.');
    end if;
  end if;
  if v_tipo = 'reembolso' and v_familiar is null then return jsonb_build_object('ok', false, 'mensaje', 'Indica quién te pagó'); end if;
  if v_tipo not in ('gasto', 'reembolso') then v_familiar := null; end if;

  -- Transferencia
  if v_tipo = 'transferencia' then
    select id, nombre into v_destino, v_destino_nombre from public.cuentas
    where hogar_id = h and (propietario_id = u or propietario_id is null) and lower(nombre) = lower(trim(coalesce(d ->> 'cuentaDestino', '')));
    if v_destino is null then return jsonb_build_object('ok', false, 'mensaje', 'Falta o no reconozco la cuenta destino'); end if;
    if v_destino = v_cuenta then return jsonb_build_object('ok', false, 'mensaje', 'Origen y destino son la misma cuenta'); end if;
  end if;

  -- MSI
  v_meses := nullif(regexp_replace(coalesce(d ->> 'meses', ''), '\D', '', 'g'), '')::int;
  if v_tipo <> 'gasto' or v_meses is null or v_meses < 2 or v_meses > 48 then v_meses := null; end if;

  -- Cargo aplazado: compras hoy y el banco lo cobra en otra fecha (fechaCobro = AAAA-MM-DD)
  if v_tipo = 'gasto' and coalesce(d ->> 'fechaCobro', '') ~ '^\d{4}-\d{2}-\d{2}' then
    v_cobro := left(d ->> 'fechaCobro', 10)::date;
    if v_cobro <= v_fecha then v_cobro := null; end if;
  end if;

  if position('›' in coalesce(d ->> 'categoria', '')) > 0 then
    d := d || jsonb_build_object('categoria', trim(split_part(d ->> 'categoria', '›', 1)),
      'subcategoria', trim(split_part(d ->> 'categoria', '›', 2)));
  end if;

  -- Categoría indicada
  if v_tipo in ('gasto', 'ingreso') and coalesce(d ->> 'categoria', '') <> '' then
    select id, nombre into v_padre, v_cat_nombre from public.categorias
    where hogar_id = h and (propietario_id = u or propietario_id is null) and tipo = v_tipo and padre_id is null
      and lower(nombre) = lower(trim(d ->> 'categoria'))
    order by propietario_id nulls last limit 1;
    v_cat := v_padre;
    if v_padre is not null and coalesce(d ->> 'subcategoria', '') not in ('', '(general)') then
      select id, nombre into v_cat, v_sub_nombre from public.categorias where padre_id = v_padre and lower(nombre) = lower(trim(d ->> 'subcategoria'));
      if v_cat is null then v_cat := v_padre; v_sub_nombre := null; end if;
    end if;
  end if;

  -- Suscripciones y reglas (solo gastos)
  if v_tipo = 'gasto' and trim(v_texto) <> '' then
    select s.* into susc from public.suscripciones s
    where s.hogar_id = h and (s.propietario_id = u or s.propietario_id is null) and s.activa
      and coalesce(s.palabra_clave, '') <> '' and position(upper(s.palabra_clave) in v_texto) > 0 limit 1;
    if susc.id is not null then
      if v_cat is null then v_cat := susc.categoria_id; end if;
      if abs(v_monto - susc.monto) >= 1 then
        avisos := avisos || (susc.servicio || ' cobró ' || public._fmt(v_monto) || ' y tenías registrado ' || public._fmt(susc.monto) || '. Actualiza la suscripción si el precio cambió.');
      end if;
    end if;
    select r.* into regla from public.reglas r
    where r.hogar_id = h and (r.propietario_id = u or r.propietario_id is null)
      and position(upper(r.palabra_clave) in v_texto) > 0
    order by r.prioridad, length(r.palabra_clave) desc limit 1;
    if regla.id is not null then
      if v_cat is null then v_cat := regla.categoria_id; end if;
      v_pct := regla.compartir_pct;
    end if;
  end if;

  if v_tipo = 'gasto' and v_cat is null then
    select s.id into v_cat from public.categorias p join public.categorias s on s.padre_id = p.id
    where p.propietario_id = u and p.tipo = 'gasto' and p.nombre = 'Otros' and s.nombre = 'Por clasificar';
    v_revisar := true;
  end if;
  if v_tipo = 'ingreso' and v_cat is null then
    select s.id into v_cat from public.categorias p join public.categorias s on s.padre_id = p.id
    where p.propietario_id = u and p.tipo = 'ingreso' and p.nombre = 'Otros ingresos' limit 1;
  end if;
  if v_tipo not in ('gasto', 'ingreso') then v_cat := null; end if;

  -- Reparto
  if v_tipo = 'gasto' and otro_id is not null and v_familiar is null then
    comp := coalesce(comp, lower(trim(coalesce(d ->> 'compartido', ''))));
    v_valor := public._parse_monto(d ->> 'compartidoValor');
    if comp in ('50/50', '50') then v_modo := 'porcentaje'; v_valor := 50;
    elsif comp = 'porcentaje' and v_valor > 0 then v_modo := 'porcentaje';
    elsif comp = 'monto' and v_valor > 0 then v_modo := 'monto';
    elsif comp = 'todo' or comp like 'todo de%' then v_modo := 'porcentaje'; v_valor := 100;
    elsif comp in ('', 'no') and v_pct is not null and d ->> 'compartido' is null then v_modo := 'porcentaje'; v_valor := v_pct;
    end if;
    if v_modo = 'porcentaje' and v_valor > 100 then v_valor := 100; end if;
    if v_modo = 'monto' and v_valor > v_monto then v_valor := v_monto; end if;
  end if;
  if v_modo is not null and exists (select 1 from public.cuentas where id = v_cuenta and propietario_id is null) then
    v_modo := null;
    avisos := avisos || 'Se pagó con la cuenta conjunta: ya es de los dos, no se comparte.'::text;
  end if;

  insert into public.movimientos (hogar_id, creado_por, fecha, tipo, monto, cuenta_id, cuenta_destino_id, categoria_id,
    descripcion, comercio, meses_msi, familiar_id, origen, revisar, fecha_compra)
  values (h, u, coalesce(v_cobro, v_fecha), v_tipo, v_monto, v_cuenta, v_destino, v_cat, v_desc, v_comercio, v_meses, v_familiar,
    coalesce(nullif(d ->> 'origen', ''), 'Atajo'), v_revisar, case when v_cobro is not null then v_fecha end)
  returning id into mid;

  if v_modo is not null then
    insert into public.repartos (movimiento_id, user_id, modo, valor) values (mid, otro_id, v_modo, v_valor)
    returning monto into parte;
  end if;

  if susc.id is not null and v_familiar is null and v_tipo = 'gasto' and susc.monto > 0 then
    insert into public.partes_personas (movimiento_id, familiar_id, monto)
    select mid, sp.familiar_id, round(sp.monto * v_monto / susc.monto, 2) from public.suscripcion_partes sp
    join public.familiares f on f.id = sp.familiar_id and f.propietario_id = u where sp.suscripcion_id = susc.id;
    select string_agg(f.nombre || ' ' || public._fmt(p.monto), ', ') into v_div
    from public.partes_personas p join public.familiares f on f.id = p.familiar_id where p.movimiento_id = mid;
  end if;

  -- Mensaje
  select coalesce(p.nombre || ' › ' || c.nombre, c.nombre), coalesce(c.padre_id, c.id)
    into v_cat_nombre, v_padre
  from public.categorias c left join public.categorias p on p.id = c.padre_id where c.id = v_cat;

  if v_tipo = 'gasto' then
    msg := public._fmt(v_monto) || coalesce(' en ' || v_cat_nombre, '') || coalesce(' (' || v_cuenta_nombre || ')', '');
    if v_meses is not null then msg := msg || ', a ' || v_meses || ' MSI de ' || public._fmt(round(v_monto / v_meses, 2)); end if;
    if v_cobro is not null then msg := msg || '. Cargo aplazado: se cobra el ' || to_char(v_cobro, 'DD/MM/YYYY') || ' y hasta entonces no suma a tu deuda'; end if;
    if parte is not null then
      msg := msg || '. Compartido: a ' || otro_nombre || ' le tocan ' || public._fmt(parte);
    end if;
    if v_div is not null then msg := msg || '. Dividido: ' || v_div; end if;
    if v_familiar is not null then
      msg := msg || '. Por cuenta de ' || v_familiar_nombre || '. Este mes le llevas ' || public._fmt(
        (select coalesce(sum(monto), 0) from public.movimientos where familiar_id = v_familiar and tipo = 'gasto' and meses_msi is null
          and fecha >= date_trunc('month', v_fecha) and fecha < date_trunc('month', v_fecha) + interval '1 month')) || ' en compras';
    elsif v_revisar then
      msg := msg || '. Quedó en Pendientes para clasificar';
    else
      select presupuesto_mensual, propietario_id into pres from public.categorias where id = v_padre and propietario_id = u;
      if pres > 0 then
        select coalesce(sum(g.monto), 0) into gastado
        from public._gastos_personales(u, date_trunc('month', v_fecha)::date, (date_trunc('month', v_fecha) + interval '1 month')::date) g
        join public.categorias c on c.id = g.categoria_id where coalesce(c.padre_id, c.id) = v_padre;
        msg := msg || '. Llevas ' || public._fmt(gastado) || ' de ' || public._fmt(pres) || ' este mes'
          || case when gastado > pres then ', te pasaste' else '' end;
      end if;
    end if;
  elsif v_tipo = 'ingreso' then
    msg := 'Ingreso de ' || public._fmt(v_monto) || ' a ' || v_cuenta_nombre;
  elsif v_tipo = 'reembolso' then
    msg := v_familiar_nombre || ' te pagó ' || public._fmt(v_monto) || ' (' || v_cuenta_nombre || ')';
  else
    msg := 'Transferencia de ' || public._fmt(v_monto) || ': ' || v_cuenta_nombre || ' → ' || v_destino_nombre;
  end if;
  msg := msg || '.';
  if array_length(avisos, 1) > 0 then msg := msg || ' ' || array_to_string(avisos, ' '); end if;

  return jsonb_build_object('ok', true, 'mensaje', msg, 'id', mid);
end $function$
;

revoke all on function public.msi_partes() from public, anon;
grant execute on function public.msi_partes() to authenticated;
revoke all on function public.gastos_detalle(date, date) from public, anon;
grant execute on function public.gastos_detalle(date, date) to authenticated;
revoke all on function public.gastos_lista(date, date) from public, anon;
grant execute on function public.gastos_lista(date, date) to authenticated;
revoke all on function public.flujo_meses(date, date) from public, anon;
grant execute on function public.flujo_meses(date, date) to authenticated;

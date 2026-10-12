-- Revisión de la lógica de dinero (12 oct 2026)
-- Las funciones largas se corrigen reemplazando solo el fragmento que cambia; cada reemplazo
-- debe encontrar su fragmento exactamente una vez o la migración entera se cancela.

create or replace function pg_temp.parchar(f regprocedure, viejo text, nuevo text) returns void
language plpgsql as $$
declare d text := pg_get_functiondef(f); n int;
begin
  n := (length(d) - length(replace(d, viejo, ''))) / length(viejo);
  if n <> 1 then raise exception 'Fragmento encontrado % veces en %: %', n, f, left(viejo, 80); end if;
  execute replace(d, viejo, nuevo);
end $$;


-- D. Centavos de las compras a meses ---------------------------------------------------------
-- Lo cobrado tras n mensualidades. El banco cobra mensualidades redondeadas y la primera absorbe
-- los centavos (así ya lo calcula el pago de la tarjeta), de modo que al final se cobra el total exacto.
create or replace function public._msi_cobrado(p_monto numeric, p_meses integer, p_n integer)
 returns numeric
 language sql
 immutable
 set search_path to ''
as $function$
  select case when p_n <= 0 then 0 when p_n >= p_meses then p_monto
    else p_monto - round(p_monto / p_meses, 2) * (p_meses - p_n) end
$function$;
revoke execute on function public._msi_cobrado(numeric, integer, integer) from public, anon;
grant execute on function public._msi_cobrado(numeric, integer, integer) to authenticated, service_role;

select pg_temp.parchar('public.detalle_cuenta(uuid)',
  'select coalesce(sum(round(m.monto / m.meses_msi, 2) * (m.meses_msi - public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, ult))), 0) into msi_corte',
  'select coalesce(sum(m.monto - public._msi_cobrado(m.monto, m.meses_msi, public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, ult))), 0) into msi_corte');
select pg_temp.parchar('public.detalle_cuenta(uuid)',
  '''msi_por_facturar'', (select coalesce(sum(round(m.monto / m.meses_msi, 2) * (m.meses_msi - public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, hoy))), 0)',
  '''msi_por_facturar'', (select coalesce(sum(m.monto - public._msi_cobrado(m.monto, m.meses_msi, public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, hoy))), 0)');
select pg_temp.parchar('public.detalle_cuenta(uuid)',
  '''mensualidades_proximo'', (select coalesce(sum(round(m.monto / m.meses_msi, 2) * (public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, prox) - public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, ult))), 0)',
  '''mensualidades_proximo'', (select coalesce(sum(public._msi_cobrado(m.monto, m.meses_msi, public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, prox)) - public._msi_cobrado(m.monto, m.meses_msi, public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, ult))), 0)');

select pg_temp.parchar('public.saldos_cuentas()',
  'coalesce((select sum(round(m.monto / m.meses_msi, 2) * (m.meses_msi - public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, public.hoy())))',
  'coalesce((select sum(m.monto - public._msi_cobrado(m.monto, m.meses_msi, public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, public.hoy())))');

select pg_temp.parchar('public.msi_detalle()',
  'x.fact, m.meses_msi - x.fact, round(m.monto / m.meses_msi, 2) * (m.meses_msi - x.fact),',
  'x.fact, m.meses_msi - x.fact, m.monto - public._msi_cobrado(m.monto, m.meses_msi, x.fact),');

select pg_temp.parchar('public.balance_hogar()',
  'else round(r.monto * public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, public.hoy()) / m.meses_msi, 2) end as v',
  'else public._msi_cobrado(r.monto, m.meses_msi, public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, public.hoy())) end as v');

select pg_temp.parchar('public.cobros_familiares(date)',
  'msi as (select m.familiar_id, round(m.monto / m.meses_msi, 2) as mens, m.meses_msi,',
  'msi as (select m.familiar_id, m.monto, round(m.monto / m.meses_msi, 2) as mens, m.meses_msi,');
select pg_temp.parchar('public.cobros_familiares(date)',
  'select sum(mens) from msi, r where',
  'select sum(public._msi_cobrado(msi.monto, meses_msi, ((extract(year from r.d) - extract(year from primer)) * 12 + extract(month from r.d) - extract(month from primer))::int + 1)'
    || ' - public._msi_cobrado(msi.monto, meses_msi, ((extract(year from r.d) - extract(year from primer)) * 12 + extract(month from r.d) - extract(month from primer))::int)) from msi, r where');
select pg_temp.parchar('public.cobros_familiares(date)',
  'select sum(mens * fact) from msi where',
  'select sum(public._msi_cobrado(msi.monto, meses_msi, fact)) from msi where');
select pg_temp.parchar('public.cobros_familiares(date)',
  'select sum(mens * (meses_msi - fact)) from msi where',
  'select sum(msi.monto - public._msi_cobrado(msi.monto, meses_msi, fact)) from msi where');


-- A. Cuenta conjunta: sus gastos ya son de los dos, no se comparten ---------------------------
select pg_temp.parchar('public.tg_repartos()',
  E'  if new.user_id = m.creado_por then raise exception ''La parte debe ser de otra persona''; end if;',
  E'  if exists (select 1 from public.cuentas where id = m.cuenta_id and propietario_id is null) then\n'
  || E'    raise exception ''Este gasto se pagó con la cuenta conjunta: ya es de los dos, no se comparte'';\n'
  || E'  end if;\n'
  || E'  if new.user_id = m.creado_por then raise exception ''La parte debe ser de otra persona''; end if;');

select pg_temp.parchar('public.tg_mov_compartido()',
  E'  select array_agg(user_id) into inv from public.repartos where movimiento_id = new.id;',
  E'  if new.cuenta_id is distinct from old.cuenta_id and exists (select 1 from public.repartos where movimiento_id = new.id)\n'
  || E'     and exists (select 1 from public.cuentas where id = new.cuenta_id and propietario_id is null) then\n'
  || E'    raise exception ''Los gastos de la cuenta conjunta ya son de los dos; quita el reparto antes de pasarlo a esa cuenta'';\n'
  || E'  end if;\n'
  || E'  select array_agg(user_id) into inv from public.repartos where movimiento_id = new.id;');

select pg_temp.parchar('public.tg_cuentas_dueno()',
  E'  if old.propietario_id is not null and new.propietario_id is not null and new.propietario_id <> old.propietario_id then',
  E'  if old.propietario_id is not null and new.propietario_id is null and exists (\n'
  || E'      select 1 from public.movimientos m join public.repartos r on r.movimiento_id = m.id where m.cuenta_id = new.id) then\n'
  || E'    raise exception ''Esta cuenta tiene gastos compartidos con tu pareja; no puede volverse conjunta'';\n'
  || E'  end if;\n'
  || E'  if old.propietario_id is not null and new.propietario_id is not null and new.propietario_id <> old.propietario_id then');

-- El atajo no comparte un gasto de la cuenta conjunta (antes fallaba al crear el reparto)
select pg_temp.parchar('public.atajo_registrar(text, jsonb)',
  E'    if v_modo = ''monto'' and v_valor > v_monto then v_valor := v_monto; end if;\n  end if;',
  E'    if v_modo = ''monto'' and v_valor > v_monto then v_valor := v_monto; end if;\n  end if;\n'
  || E'  if v_modo is not null and exists (select 1 from public.cuentas where id = v_cuenta and propietario_id is null) then\n'
  || E'    v_modo := null;\n'
  || E'    avisos := avisos || ''Se pagó con la cuenta conjunta: ya es de los dos, no se comparte.''::text;\n'
  || E'  end if;');


-- C. Guardar un movimiento en un solo paso: o se guarda todo o no se guarda nada -------------
-- Corre con los permisos de quien llama (las reglas de seguridad aplican igual que antes).
-- p_partes: [{familiar_id, monto}] o null (sin división). p_reparto: {user_id, modo, valor} o null
-- (no compartido). p_ajuste_saldo: solo al crear; lo que se suma a la deuda de la tarjeta.
create or replace function public.guardar_movimiento(p_id uuid, p_mov jsonb, p_partes jsonb default null,
  p_reparto jsonb default null, p_ajuste_saldo numeric default null)
 returns uuid
 language plpgsql
 security invoker
 set search_path to ''
as $function$
declare v_id uuid := p_id; v_monto numeric := (p_mov ->> 'monto')::numeric; antes numeric; reparto_primero boolean;
begin
  if v_id is not null then
    select monto into antes from public.movimientos where id = v_id;
    if not found then raise exception 'No encontré ese movimiento'; end if;
    -- Lo que ya no aplica se quita antes de cambiar el movimiento
    delete from public.partes_personas where movimiento_id = v_id;
    if p_reparto is null then delete from public.repartos where movimiento_id = v_id; end if;
    -- Si el monto baja, el reparto nuevo va antes para que el viejo no exceda el monto nuevo
    reparto_primero := p_reparto is not null and v_monto < antes;
    if reparto_primero then
      insert into public.repartos (movimiento_id, user_id, modo, valor)
      values (v_id, (p_reparto ->> 'user_id')::uuid, p_reparto ->> 'modo', (p_reparto ->> 'valor')::numeric)
      on conflict (movimiento_id, user_id) do update set modo = excluded.modo, valor = excluded.valor;
    end if;
    update public.movimientos set
      tipo = p_mov ->> 'tipo', monto = v_monto, fecha = (p_mov ->> 'fecha')::date,
      cuenta_id = (p_mov ->> 'cuenta_id')::uuid, cuenta_destino_id = (p_mov ->> 'cuenta_destino_id')::uuid,
      categoria_id = (p_mov ->> 'categoria_id')::uuid, descripcion = p_mov ->> 'descripcion',
      familiar_id = (p_mov ->> 'familiar_id')::uuid, meses_msi = (p_mov ->> 'meses_msi')::smallint,
      cobro_completo = coalesce((p_mov ->> 'cobro_completo')::boolean, false), revisar = coalesce((p_mov ->> 'revisar')::boolean, false),
      en_saldo_inicial = coalesce((p_mov ->> 'en_saldo_inicial')::boolean, false),
      sumar_a_saldo = coalesce((p_mov ->> 'sumar_a_saldo')::boolean, false), fecha_compra = (p_mov ->> 'fecha_compra')::date
    where id = v_id;
  else
    reparto_primero := false;
    insert into public.movimientos (tipo, monto, fecha, cuenta_id, cuenta_destino_id, categoria_id, descripcion, familiar_id,
      meses_msi, cobro_completo, revisar, en_saldo_inicial, sumar_a_saldo, fecha_compra, origen)
    values (p_mov ->> 'tipo', v_monto, (p_mov ->> 'fecha')::date, (p_mov ->> 'cuenta_id')::uuid, (p_mov ->> 'cuenta_destino_id')::uuid,
      (p_mov ->> 'categoria_id')::uuid, p_mov ->> 'descripcion', (p_mov ->> 'familiar_id')::uuid, (p_mov ->> 'meses_msi')::smallint,
      coalesce((p_mov ->> 'cobro_completo')::boolean, false), coalesce((p_mov ->> 'revisar')::boolean, false),
      coalesce((p_mov ->> 'en_saldo_inicial')::boolean, false), coalesce((p_mov ->> 'sumar_a_saldo')::boolean, false),
      (p_mov ->> 'fecha_compra')::date, coalesce(p_mov ->> 'origen', 'App'))
    returning id into v_id;
    -- Compra a meses que no estaba en la deuda al dar de alta la tarjeta
    if coalesce(p_ajuste_saldo, 0) <> 0 then
      update public.cuentas set saldo_inicial = saldo_inicial - p_ajuste_saldo where id = (p_mov ->> 'cuenta_id')::uuid;
      if not found then raise exception 'No pude sumar la compra a la deuda de la tarjeta'; end if;
    end if;
  end if;

  if p_reparto is not null and not reparto_primero then
    insert into public.repartos (movimiento_id, user_id, modo, valor)
    values (v_id, (p_reparto ->> 'user_id')::uuid, p_reparto ->> 'modo', (p_reparto ->> 'valor')::numeric)
    on conflict (movimiento_id, user_id) do update set modo = excluded.modo, valor = excluded.valor;
  end if;
  -- Las partes de familiares van al final: el reparto con tu pareja se recalcula sobre lo que queda
  if p_partes is not null and jsonb_array_length(p_partes) > 0 then
    insert into public.partes_personas (movimiento_id, familiar_id, monto)
    select v_id, (x ->> 'familiar_id')::uuid, (x ->> 'monto')::numeric from jsonb_array_elements(p_partes) x;
  end if;
  return v_id;
end $function$;
revoke execute on function public.guardar_movimiento(uuid, jsonb, jsonb, jsonb, numeric) from public, anon;
grant execute on function public.guardar_movimiento(uuid, jsonb, jsonb, jsonb, numeric) to authenticated;

-- Guardados en un solo paso (12 oct 2026): o se guarda todo o no se guarda nada

-- 3. Suscripción con su división entre personas
-- Corre con los permisos de quien llama (las reglas de seguridad aplican igual que antes).
create or replace function public.guardar_suscripcion(p_id uuid, p_fila jsonb, p_partes jsonb default null)
 returns uuid
 language plpgsql
 security invoker
 set search_path to ''
as $function$
declare v_id uuid := p_id;
begin
  if v_id is not null then
    update public.suscripciones set
      servicio = p_fila ->> 'servicio', monto = (p_fila ->> 'monto')::numeric,
      frecuencia_meses = (p_fila ->> 'frecuencia_meses')::smallint, cuenta_id = (p_fila ->> 'cuenta_id')::uuid,
      categoria_id = (p_fila ->> 'categoria_id')::uuid, fecha_referencia = (p_fila ->> 'fecha_referencia')::date,
      palabra_clave = p_fila ->> 'palabra_clave', activa = coalesce((p_fila ->> 'activa')::boolean, true),
      propietario_id = (p_fila ->> 'propietario_id')::uuid
    where id = v_id;
    if not found then raise exception 'No encontré esa suscripción'; end if;
    delete from public.suscripcion_partes where suscripcion_id = v_id;
  else
    insert into public.suscripciones (servicio, monto, frecuencia_meses, cuenta_id, categoria_id, fecha_referencia, palabra_clave, activa, propietario_id)
    values (p_fila ->> 'servicio', (p_fila ->> 'monto')::numeric, coalesce((p_fila ->> 'frecuencia_meses')::smallint, 1),
      (p_fila ->> 'cuenta_id')::uuid, (p_fila ->> 'categoria_id')::uuid, (p_fila ->> 'fecha_referencia')::date,
      p_fila ->> 'palabra_clave', coalesce((p_fila ->> 'activa')::boolean, true), (p_fila ->> 'propietario_id')::uuid)
    returning id into v_id;
  end if;
  if p_partes is not null and jsonb_array_length(p_partes) > 0 then
    insert into public.suscripcion_partes (suscripcion_id, familiar_id, monto)
    select v_id, (x ->> 'familiar_id')::uuid, (x ->> 'monto')::numeric from jsonb_array_elements(p_partes) x;
  end if;
  return v_id;
end $function$;
revoke execute on function public.guardar_suscripcion(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_suscripcion(uuid, jsonb, jsonb) to authenticated;


-- 4. Cuadrar tarjeta: las compras a meses que quitaste se borran en el mismo paso que el cuadre.
-- p_quitar es opcional, así que la versión anterior de la app sigue funcionando igual.
drop function public.cuadrar_tarjeta(uuid, jsonb, numeric, numeric, date);
create function public.cuadrar_tarjeta(p_cuenta uuid, p_cambios jsonb, p_deuda numeric, p_pago numeric, p_corte date, p_quitar uuid[] default null)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
end $function$;
revoke execute on function public.cuadrar_tarjeta(uuid, jsonb, numeric, numeric, date, uuid[]) from public, anon;
grant execute on function public.cuadrar_tarjeta(uuid, jsonb, numeric, numeric, date, uuid[]) to authenticated;

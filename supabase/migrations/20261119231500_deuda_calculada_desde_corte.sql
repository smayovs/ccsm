-- Deuda calculada: el punto de partida es un corte (fecha_saldo_inicial = fecha de ese corte), no el día siguiente.
-- - Cuenta lo que registres después del corte y lo que falta de las compras a meses hechas hasta ese corte.
-- - Si al empezar aún no pagabas ese estado de cuenta, su pago para no generar intereses queda como un cargo
--   visible en la fecha del corte (origen 'Saldo inicial', sin meses): así ese corte pide el pago correcto y,
--   cuando registras el pago, se cancelan. Las compras de contado de antes ya venían en ese estado de cuenta.

create or replace function public._previas(c public.cuentas)
 returns numeric language sql stable set search_path to ''
as $$
  select coalesce(sum(m.monto - public._msi_cobrado(m.monto, m.meses_msi,
      public._msi_facturadas(m.fecha, c.dia_corte, m.meses_msi, c.fecha_saldo_inicial))), 0)
  from public.movimientos m
  where c.saldo_calculado and m.cuenta_id = c.id and m.tipo = 'gasto' and m.meses_msi is not null and m.fecha <= c.fecha_saldo_inicial
$$;

create or replace function public._cuenta_cuenta_mov(m public.movimientos, c public.cuentas)
 returns boolean language sql stable set search_path to ''
as $$ select (case when c.saldo_calculado
    then m.fecha > c.fecha_saldo_inicial
      or (m.fecha = c.fecha_saldo_inicial and m.origen = 'Saldo inicial' and m.meses_msi is null)
    else (m.fecha >= c.fecha_saldo_inicial and not m.en_saldo_inicial) or m.sumar_a_saldo end) and m.fecha <= public.hoy() $$;

drop function if exists public.iniciar_deuda_calculada(uuid, date);
create or replace function public.iniciar_deuda_calculada(p_cuenta uuid, p_corte date, p_pendiente numeric default 0)
 returns void language plpgsql security definer set search_path to ''
as $$
declare c public.cuentas;
begin
  select * into c from public.cuentas where id = p_cuenta and hogar_id = public.mi_hogar()
    and (propietario_id = auth.uid() or propietario_id is null);
  if not found or c.tipo <> 'credito' then raise exception 'Tarjeta no encontrada'; end if;
  if c.dia_corte is null then raise exception 'Primero escribe el día de corte'; end if;
  if p_corte is null or p_corte > public.hoy() then raise exception 'El corte no puede ser futuro'; end if;
  if coalesce(p_pendiente, 0) < 0 then raise exception 'Lo pendiente no puede ser negativo'; end if;
  update public.cuentas set saldo_calculado = true, saldo_inicial = 0, fecha_saldo_inicial = p_corte,
    pago_corte_manual = null, pago_corte_de = null where id = p_cuenta;
  -- Las banderas del saldo inicial ya no aplican: cada movimiento cuenta por su fecha
  update public.movimientos set en_saldo_inicial = false, sumar_a_saldo = false
  where cuenta_id = p_cuenta and (en_saldo_inicial or sumar_a_saldo);
  -- Un solo cargo de lo pendiente del estado de cuenta (si cuadras otra vez, se reemplaza)
  delete from public.movimientos where cuenta_id = p_cuenta and origen = 'Saldo inicial' and meses_msi is null and tipo = 'gasto';
  if coalesce(p_pendiente, 0) > 0 then
    insert into public.movimientos (hogar_id, creado_por, tipo, monto, fecha, descripcion, cuenta_id, origen)
    values (c.hogar_id, auth.uid(), 'gasto', p_pendiente, p_corte,
      'Pendiente del estado de cuenta del ' || to_char(p_corte, 'DD/MM/YYYY'), p_cuenta, 'Saldo inicial');
  end if;
end $$;

-- detalle_cuenta: el corte de partida cuenta como conocido
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
  -- Con deuda calculada el corte de partida ya se conoce: su pago es lo pendiente que registraste
  conocido := c.fecha_saldo_inicial <= ult;
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

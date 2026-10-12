-- Revisión de seguridad (12 oct 2026)

-- 1. Una liquidación que ya cuenta en el balance no se puede borrar: borrarla cambiaría lo que
--    la otra persona debe, sin dejar rastro. Solo se puede borrar un "le pagué" que tu pareja
--    aún no confirma (todavía no cuenta en el balance).
drop policy if exists mov_borrar on public.movimientos;
create policy mov_borrar on public.movimientos for delete to authenticated
  using (
    creado_por = (select auth.uid())
    and (tipo <> 'liquidacion' or (creado_por <> liq_para and cuenta_destino_id is null))
  );

-- 7. Un hogar es de dos personas: una invitación no puede sumar a una tercera.
create or replace function public.aceptar_invitacion(p_codigo text, p_mi_nombre text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare uid uuid := auth.uid(); inv record;
begin
  if uid is null then raise exception 'Inicia sesión'; end if;
  if exists (select 1 from public.miembros where user_id = uid) then raise exception 'Ya perteneces a un hogar'; end if;
  select * into inv from public.invitaciones where codigo = upper(trim(p_codigo)) and aceptada_por is null and expira > now();
  if inv.codigo is null then raise exception 'Código inválido o vencido'; end if;
  perform 1 from public.hogares where id = inv.hogar_id for update;
  if (select count(*) from public.miembros where hogar_id = inv.hogar_id) >= 2 then
    raise exception 'Este hogar ya tiene dos personas';
  end if;
  insert into public.miembros (hogar_id, user_id, nombre, rol, color) values (inv.hogar_id, uid, trim(p_mi_nombre), 'miembro', '#3A6B5B');
  update public.invitaciones set aceptada_por = uid where codigo = inv.codigo;
  perform public._sembrar_personales(inv.hogar_id, uid);
  return inv.hogar_id;
end $function$;

import { sb } from "./supabase";
import { cobroEnMes, conDia, fmt, hoyISO, mesISO, sumarMes } from "./util";
import { mensualidadesMsi } from "./dinero";
import type { DetalleMsi } from "./msi";

// "mes": mes del estado de cuenta en que entra (tarjetas de crédito según su corte; lo demás, el mes de la fecha).
// "futuro": aún no se cobra (mensualidad que el banco no ha facturado o cargo con fecha futura).
// "origen": el módulo al que pertenece (gasto de contado, compra a meses o suscripción)
export type Origen = "gasto" | "msi" | "suscripcion";
export type Cargo = { id: string; mov: string; fecha: string; mes: string; texto: string; monto: number; pendiente: number; origen: Origen; cuenta: string | null; marcado?: boolean; futuro?: boolean };
// cargos: lo que te debe hoy; venir: lo pendiente que aún no se cobra; todos: también lo ya pagado (para las cuentas de cada corte)
export type Persona = { cargos: Cargo[]; venir: Cargo[]; marcados: Cargo[]; todos?: Cargo[]; total: number; porVenir: number; proxima: number; pagado: number };
export type EstadoMov = { familiar_id: string; cobrado: number; pendiente: number; porVenir: number; completo: boolean };
export type Cobros = { personas: Record<string, Persona>; movs: Record<string, EstadoMov[]> };

// Periodo que se cobra: cortes de un mes (cada tarjeta con su día de corte), mes calendario, fechas o lo por venir
export type Periodo = { tipo: "corte" | "mes"; mes: string } | { tipo: "rango"; desde: string; hasta: string } | { tipo: "venir" };

// Mes del estado de cuenta de una compra: lo comprado después del corte entra al del mes siguiente
export const mesDeCorte = (fecha: string, diaCorte: number | null) =>
  diaCorte && fecha > conDia(mesISO(fecha), diaCorte) ? sumarMes(mesISO(fecha), 1) : mesISO(fecha);

export function enPeriodo(c: Cargo, p: Periodo) {
  if (p.tipo === "corte") return c.mes === p.mes;
  if (p.tipo === "mes") return mesISO(c.fecha) === p.mes;
  if (p.tipo === "rango") return c.fecha >= p.desde && c.fecha <= p.hasta;
  return !!c.futuro;
}
// Pendiente de antes del periodo (para mostrarlo aparte)
export function antesDe(c: Cargo, p: Periodo) {
  if (p.tipo === "corte") return c.mes < p.mes;
  if (p.tipo === "mes") return c.fecha < p.mes;
  if (p.tipo === "rango") return c.fecha < p.desde;
  return !c.futuro;
}

// Cargos de cada persona: compras de contado, compras a meses que se cobran completas,
// y mensualidades MSI ya facturadas. Los pagos se aplican a lo más antiguo primero.
// "msiDetalle": la respuesta de msi_detalle si ya se pidió (Inicio la comparte con cargarMsi)
export async function cargarCobros(msiDetalle?: DetalleMsi): Promise<Cobros> {
  const hoy = hoyISO();
  const [c, pp, d, r, mk, ct, su] = await Promise.all([
    sb.from("movimientos").select("id, fecha, descripcion, comercio, monto, familiar_id, meses_msi, cobro_completo, cuenta_id").eq("tipo", "gasto").not("familiar_id", "is", null),
    sb.from("partes_personas").select("monto, familiar_id, movimiento:movimientos(id, fecha, descripcion, comercio, meses_msi, cobro_completo, cuenta_id)"),
    msiDetalle ?? sb.rpc("msi_detalle"),
    sb.from("movimientos").select("monto, familiar_id").eq("tipo", "reembolso").not("familiar_id", "is", null),
    sb.from("cobros_marcados").select("clave"),
    sb.from("cuentas").select("id, tipo, dia_corte"),
    sb.from("suscripciones").select("id, servicio, monto, frecuencia_meses, fecha_referencia, cuenta_id, palabra_clave, cobros_desde, partes:suscripcion_partes(familiar_id, monto)").eq("activa", true),
  ]);
  const corteDe: Record<string, number | null> = Object.fromEntries(((ct.data ?? []) as any[]).map((x) => [x.id, x.tipo === "credito" ? x.dia_corte : null]));
  const marcados = new Set(((mk.data ?? []) as any[]).map((x) => x.clave as string));
  // Compras completas de una persona y partes de compras divididas, con el mismo formato
  const compras = [
    ...((c.data ?? []) as any[]).map((m) => ({ ...m, mov: m.id, parte: false })),
    ...((pp.data ?? []) as any[]).filter((x) => x.movimiento).map((x) => ({ ...x.movimiento, mov: x.movimiento.id, monto: x.monto, familiar_id: x.familiar_id, parte: true })),
  ];
  compras.push(...await comprasSuscripciones((su.data ?? []) as any[], compras, hoy));
  const detalle = Object.fromEntries(((d.data ?? []) as any[]).map((x) => [x.movimiento_id, x]));
  const pagos: Record<string, number> = {};
  for (const x of (r.data ?? []) as any[]) pagos[x.familiar_id] = (pagos[x.familiar_id] ?? 0) + Number(x.monto);

  const porPersona: Record<string, Cargo[]> = {};
  const movs: Record<string, EstadoMov[]> = {};
  const estado: Record<string, EstadoMov> = {};
  const proxima: Record<string, number> = {};
  for (const m of compras) {
    const lista = (porPersona[m.familiar_id] ??= []);
    const texto = (m.descripcion || m.comercio || "Compra") + (m.parte ? " (su parte)" : "");
    const x = m.meses_msi ? detalle[m.mov] : null;
    const clave = `${m.mov}|${m.familiar_id}`;
    const dia = corteDe[m.cuenta_id] ?? null;
    const sus = String(m.mov).startsWith("sus:");
    const origen: Origen = m.sus ? "suscripcion" : m.meses_msi ? "msi" : "gasto";
    estado[clave] = { familiar_id: m.familiar_id, cobrado: 0, pendiente: 0, porVenir: 0, completo: !m.meses_msi || m.cobro_completo };
    if (!sus) (movs[m.mov] ??= []).push(estado[clave]);
    if (!m.meses_msi || m.cobro_completo || !x) {
      lista.push({ id: clave, mov: sus ? "" : m.mov, fecha: m.fecha, mes: mesDeCorte(m.fecha, dia), texto: m.meses_msi ? `${texto} (a ${m.meses_msi} meses, cobro completo)` : texto,
        monto: Number(m.monto), pendiente: Number(m.monto), origen, cuenta: m.cuenta_id ?? null, futuro: m.fecha > hoy });
    } else {
      // La primera mensualidad absorbe los centavos, igual que el banco y la base de datos (_msi_cobrado)
      const mens = mensualidadesMsi(Number(m.monto), x.meses);
      // Todas las mensualidades, con la fecha de su corte; las que el banco aún no factura quedan por venir
      for (let k = 1; k <= x.meses; k++) {
        const mes = sumarMes(x.primer_mes, k - 1);
        lista.push({ id: `${clave}|${k}`, mov: m.mov, fecha: dia ? conDia(mes, dia) : mes, mes, texto: `${texto} (MSI ${k} de ${x.meses})`,
          monto: mens[k - 1], pendiente: mens[k - 1], origen, cuenta: m.cuenta_id ?? null, futuro: k > x.facturadas });
      }
      if (x.restantes > 0) proxima[m.familiar_id] = (proxima[m.familiar_id] ?? 0) + mens[x.facturadas];
    }
  }

  const personas: Record<string, Persona> = {};
  for (const [fam, lista] of Object.entries(porPersona)) {
    // Lo ya cobrado primero y luego lo que viene, cada parte de lo más antiguo a lo más nuevo
    lista.sort((a, b) => Number(!!a.futuro) - Number(!!b.futuro) || a.fecha.localeCompare(b.fecha));
    // Los cargos que marcaste como pagados no esperan dinero: no se les aplican los pagos registrados
    for (const g of lista) if (marcados.has(g.id)) { g.marcado = true; g.pendiente = 0; }
    let resto = pagos[fam] ?? 0;
    for (const g of lista) {
      const usa = Math.min(resto, g.pendiente);
      g.pendiente = Math.round((g.pendiente - usa) * 100) / 100; resto -= usa;
      const e = estado[g.id.split("|").slice(0, 2).join("|")];
      if (g.futuro) e.porVenir += g.pendiente;
      else { e.cobrado += g.monto; e.pendiente += g.pendiente; }
    }
    // Lo pagado por adelantado cubre lo que viene, así que "por venir" es lo que falta de eso
    const cargos = lista.filter((g) => g.pendiente > 0.004 && !g.futuro);
    const venir = lista.filter((g) => g.pendiente > 0.004 && g.futuro);
    personas[fam] = { cargos, venir, marcados: lista.filter((g) => g.marcado), todos: lista, total: cargos.reduce((s, g) => s + g.pendiente, 0),
      porVenir: venir.reduce((s, g) => s + g.pendiente, 0), proxima: proxima[fam] ?? 0, pagado: pagos[fam] ?? 0 };
  }
  for (const [fam, total] of Object.entries(pagos)) personas[fam] ??= { cargos: [], venir: [], marcados: [], total: 0, porVenir: 0, proxima: 0, pagado: total };
  return { personas, movs };
}

// Cargos de suscripciones divididas con otras personas, como compras de cada persona (su parte):
// - el cargo ya se registró pero sin dividir: su parte según la suscripción, en proporción al monto que llegó
// - el cargo aún no se registra (desde "cobros_desde" hasta el próximo cobro): su parte del monto de la suscripción
async function comprasSuscripciones(subs: any[], compras: any[], hoy: string) {
  subs = subs.filter((s) => s.partes?.length && s.fecha_referencia);
  if (!subs.length) return [];
  const desde = subs.flatMap((s) => [s.fecha_referencia, s.cobros_desde]).sort()[0];
  const { data } = await sb.from("movimientos").select("id, fecha, monto, descripcion, comercio, familiar_id, cuenta_id").eq("tipo", "gasto").gte("fecha", desde);
  // Misma regla que Movimientos para saber si un gasto es el cargo de una suscripción
  const esDe = (m: any, s: any) => {
    const t = `${m.comercio ?? ""} ${m.descripcion ?? ""}`.toUpperCase();
    return (s.palabra_clave && t.includes(String(s.palabra_clave).toUpperCase())) || (m.descripcion ?? "").trim().toLowerCase() === String(s.servicio).trim().toLowerCase();
  };
  const conPartes = new Set(compras.filter((x) => x.parte).map((x) => x.mov));
  const r: any[] = [];
  for (const s of subs) {
    const registrados = ((data ?? []) as any[]).filter((m) => esDe(m, s) && m.fecha >= s.fecha_referencia);
    const base = { descripcion: s.servicio, comercio: null, meses_msi: null, cobro_completo: false, cuenta_id: s.cuenta_id, parte: true, sus: true };
    for (const m of registrados) {
      if (m.familiar_id || conPartes.has(m.id)) continue;
      const f = Number(m.monto) / Number(s.monto);
      for (const p of s.partes) r.push({ ...base, mov: m.id, fecha: m.fecha, cuenta_id: m.cuenta_id, monto: Math.round(Number(p.monto) * f * 100) / 100, familiar_id: p.familiar_id });
    }
    for (let k = 0, mes = mesISO(s.cobros_desde); k < 60; k++, mes = sumarMes(mes, 1)) {
      const f = cobroEnMes(s.fecha_referencia, s.frecuencia_meses, mes);
      if (!f || f < s.fecha_referencia) continue;
      if (!registrados.some((m) => mesISO(m.fecha) === mes))
        for (const p of s.partes) r.push({ ...base, mov: `sus:${s.id}:${f}`, fecha: f, monto: Number(p.monto), familiar_id: p.familiar_id });
      if (f > hoy) break;
    }
  }
  return r;
}

// Lo que te debe cada persona de un módulo (o de todo, sin origen): hoy y lo que aún no se cobra
export function deudasDe(personas: Record<string, Persona>, origen?: Origen) {
  const suma = (l: Cargo[]) => l.filter((c) => !origen || c.origen === origen).reduce((a, c) => a + c.pendiente, 0);
  return Object.entries(personas).map(([id, p]) => ({ id, hoy: origen ? suma(p.cargos) : p.total, despues: origen ? suma(p.venir) : p.porVenir }))
    .filter((x) => x.hoy > 0.5 || x.despues > 0.5);
}

// Lo de cada persona en un corte de una tarjeta ("mes": el mes de ese corte): cuánto le tocó, cuánto ya pagó y cuánto falta
export function cuentasDelCorte(personas: Record<string, Persona>, cuenta: string, mes: string) {
  return Object.entries(personas).flatMap(([id, p]) => {
    const l = (p.todos ?? []).filter((c) => c.cuenta === cuenta && c.mes === mes);
    const total = l.reduce((a, c) => a + c.monto, 0);
    const falta = l.reduce((a, c) => a + c.pendiente, 0);
    return total > 0.004 ? [{ id, total, falta, pagado: total - falta, cargos: l }] : [];
  }).sort((a, b) => b.total - a.total);
}

// Texto corto del estado de un cargo de otra persona
export function textoEstado(e: EstadoMov | undefined): { t: string; listo: boolean } | null {
  if (!e) return null;
  if (e.pendiente > 0.004) return { t: `te debe ${fmt(e.pendiente, false)}`, listo: false };
  if (e.porVenir > 0.004) return { t: e.cobrado > 0 ? "al corriente" : "sin mensualidades aún", listo: false };
  return { t: "ya te pagó", listo: true };
}

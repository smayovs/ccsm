import { sb } from "./supabase";
import { sumarMes } from "./util";

export type Cargo = { id: string; mov: string; fecha: string; texto: string; monto: number; pendiente: number };
export type Persona = { cargos: Cargo[]; total: number; porVenir: number; proxima: number; pagado: number };
export type EstadoMov = { familiar_id: string; cobrado: number; pendiente: number; porVenir: number; completo: boolean };
export type Cobros = { personas: Record<string, Persona>; movs: Record<string, EstadoMov[]> };

// Cargos de cada persona: compras de contado, compras a meses que se cobran completas,
// y mensualidades MSI ya facturadas. Los pagos se aplican a lo más antiguo primero.
export async function cargarCobros(): Promise<Cobros> {
  const [c, pp, d, r] = await Promise.all([
    sb.from("movimientos").select("id, fecha, descripcion, comercio, monto, familiar_id, meses_msi, cobro_completo").eq("tipo", "gasto").not("familiar_id", "is", null),
    sb.from("partes_personas").select("monto, familiar_id, movimiento:movimientos(id, fecha, descripcion, comercio, meses_msi, cobro_completo)"),
    sb.rpc("msi_detalle"),
    sb.from("movimientos").select("monto, familiar_id").eq("tipo", "reembolso").not("familiar_id", "is", null),
  ]);
  // Compras completas de una persona y partes de compras divididas, con el mismo formato
  const compras = [
    ...((c.data ?? []) as any[]).map((m) => ({ ...m, mov: m.id, parte: false })),
    ...((pp.data ?? []) as any[]).filter((x) => x.movimiento).map((x) => ({ ...x.movimiento, mov: x.movimiento.id, monto: x.monto, familiar_id: x.familiar_id, parte: true })),
  ];
  const detalle = Object.fromEntries(((d.data ?? []) as any[]).map((x) => [x.movimiento_id, x]));
  const pagos: Record<string, number> = {};
  for (const x of (r.data ?? []) as any[]) pagos[x.familiar_id] = (pagos[x.familiar_id] ?? 0) + Number(x.monto);

  const porPersona: Record<string, Cargo[]> = {};
  const movs: Record<string, EstadoMov[]> = {};
  const estado: Record<string, EstadoMov> = {};
  const porVenir: Record<string, number> = {};
  const proxima: Record<string, number> = {};
  for (const m of compras) {
    const lista = (porPersona[m.familiar_id] ??= []);
    const texto = (m.descripcion || m.comercio || "Compra") + (m.parte ? " (su parte)" : "");
    const x = m.meses_msi ? detalle[m.mov] : null;
    const clave = `${m.mov}|${m.familiar_id}`;
    estado[clave] = { familiar_id: m.familiar_id, cobrado: 0, pendiente: 0, porVenir: 0, completo: !m.meses_msi || m.cobro_completo };
    (movs[m.mov] ??= []).push(estado[clave]);
    if (!m.meses_msi || m.cobro_completo || !x) {
      lista.push({ id: clave, mov: m.mov, fecha: m.fecha, texto: m.meses_msi ? `${texto} (a ${m.meses_msi} meses, cobro completo)` : texto, monto: Number(m.monto), pendiente: Number(m.monto) });
    } else {
      const mensual = Math.round((Number(m.monto) / x.meses) * 100) / 100;
      for (let k = 1; k <= x.facturadas; k++) {
        lista.push({ id: `${clave}|${k}`, mov: m.mov, fecha: sumarMes(x.primer_mes, k - 1), texto: `${texto} (MSI ${k} de ${x.meses})`, monto: mensual, pendiente: mensual });
      }
      const venir = mensual * x.restantes;
      estado[clave].porVenir = venir;
      porVenir[m.familiar_id] = (porVenir[m.familiar_id] ?? 0) + venir;
      if (x.restantes > 0) proxima[m.familiar_id] = (proxima[m.familiar_id] ?? 0) + mensual;
    }
  }

  const personas: Record<string, Persona> = {};
  for (const [fam, lista] of Object.entries(porPersona)) {
    lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
    let resto = pagos[fam] ?? 0;
    for (const g of lista) {
      const usa = Math.min(resto, g.pendiente);
      g.pendiente = Math.round((g.pendiente - usa) * 100) / 100; resto -= usa;
      const e = estado[g.id.split("|").slice(0, 2).join("|")];
      e.cobrado += g.monto; e.pendiente += g.pendiente;
    }
    const cargos = lista.filter((g) => g.pendiente > 0.004);
    personas[fam] = { cargos, total: cargos.reduce((s, g) => s + g.pendiente, 0), porVenir: porVenir[fam] ?? 0, proxima: proxima[fam] ?? 0, pagado: pagos[fam] ?? 0 };
  }
  for (const [fam, total] of Object.entries(pagos)) personas[fam] ??= { cargos: [], total: 0, porVenir: 0, proxima: 0, pagado: total };
  return { personas, movs };
}

// Texto corto del estado de un cargo de otra persona
export function textoEstado(e: EstadoMov | undefined): { t: string; listo: boolean } | null {
  if (!e) return null;
  if (e.pendiente > 0.004) return { t: `te debe ${Math.round(e.pendiente).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })}`, listo: false };
  if (e.porVenir > 0.004) return { t: e.cobrado > 0 ? "al corriente" : "sin mensualidades aún", listo: false };
  return { t: "ya te pagó", listo: true };
}

import { sb } from "./supabase";
import { sumarMes } from "./util";

export type Cargo = { id: string; mov: string; fecha: string; texto: string; monto: number; pendiente: number };
export type Persona = { cargos: Cargo[]; total: number; porVenir: number; proxima: number; pagado: number };
export type EstadoMov = { familiar_id: string; cobrado: number; pendiente: number; porVenir: number; completo: boolean };
export type Cobros = { personas: Record<string, Persona>; movs: Record<string, EstadoMov> };

// Cargos de cada persona: compras de contado, compras a meses que se cobran completas,
// y mensualidades MSI ya facturadas. Los pagos se aplican a lo más antiguo primero.
export async function cargarCobros(): Promise<Cobros> {
  const [c, d, r] = await Promise.all([
    sb.from("movimientos").select("id, fecha, descripcion, comercio, monto, familiar_id, meses_msi, cobro_completo").eq("tipo", "gasto").not("familiar_id", "is", null),
    sb.rpc("msi_detalle"),
    sb.from("movimientos").select("monto, familiar_id").eq("tipo", "reembolso").not("familiar_id", "is", null),
  ]);
  const compras = (c.data ?? []) as any[];
  const detalle = Object.fromEntries(((d.data ?? []) as any[]).map((x) => [x.movimiento_id, x]));
  const pagos: Record<string, number> = {};
  for (const x of (r.data ?? []) as any[]) pagos[x.familiar_id] = (pagos[x.familiar_id] ?? 0) + Number(x.monto);

  const porPersona: Record<string, Cargo[]> = {};
  const movs: Record<string, EstadoMov> = {};
  const porVenir: Record<string, number> = {};
  const proxima: Record<string, number> = {};
  for (const m of compras) {
    const lista = (porPersona[m.familiar_id] ??= []);
    const texto = m.descripcion || m.comercio || "Compra";
    const x = m.meses_msi ? detalle[m.id] : null;
    movs[m.id] = { familiar_id: m.familiar_id, cobrado: 0, pendiente: 0, porVenir: 0, completo: !m.meses_msi || m.cobro_completo };
    if (!m.meses_msi || m.cobro_completo || !x) {
      lista.push({ id: m.id, mov: m.id, fecha: m.fecha, texto: m.meses_msi ? `${texto} (a ${m.meses_msi} meses, cobro completo)` : texto, monto: Number(m.monto), pendiente: Number(m.monto) });
    } else {
      for (let k = 1; k <= x.facturadas; k++) {
        lista.push({ id: `${m.id}-${k}`, mov: m.id, fecha: sumarMes(x.primer_mes, k - 1), texto: `${texto} (MSI ${k} de ${x.meses})`,
          monto: Number(x.mensualidad), pendiente: Number(x.mensualidad) });
      }
      movs[m.id].porVenir = Number(x.por_facturar);
      porVenir[m.familiar_id] = (porVenir[m.familiar_id] ?? 0) + Number(x.por_facturar);
      if (x.restantes > 0) proxima[m.familiar_id] = (proxima[m.familiar_id] ?? 0) + Number(x.mensualidad);
    }
  }

  const personas: Record<string, Persona> = {};
  for (const [fam, lista] of Object.entries(porPersona)) {
    lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
    let resto = pagos[fam] ?? 0;
    for (const g of lista) {
      const usa = Math.min(resto, g.pendiente);
      g.pendiente = Math.round((g.pendiente - usa) * 100) / 100; resto -= usa;
      movs[g.mov].cobrado += g.monto; movs[g.mov].pendiente += g.pendiente;
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

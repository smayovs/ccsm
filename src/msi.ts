import { sb } from "./supabase";
import { sumarMes } from "./util";

export type ParteMsi = { persona: string; clave: string; parte: number; cobro_completo: boolean };
export type CompraMsi = {
  movimiento_id: string; fecha: string; descripcion: string | null; cuenta: string | null; familiar: string | null;
  monto: number; meses: number; mensualidad: number; primer_mes: string; ultimo_mes: string;
  facturadas: number; restantes: number; por_facturar: number; parte_otros: number; estado: string;
  partes: ParteMsi[]; fraccionOtros: number;
};

// Compras a meses con la parte que corresponde a otras personas (familiares, divisiones y tu pareja)
export async function cargarMsi(): Promise<CompraMsi[]> {
  const [d, p] = await Promise.all([sb.rpc("msi_detalle"), sb.rpc("msi_partes")]);
  const partes: Record<string, ParteMsi[]> = {};
  for (const x of (p.data ?? []) as any[]) (partes[x.movimiento_id] ??= []).push({ ...x, parte: Number(x.parte) });
  return ((d.data ?? []) as any[]).map((x) => {
    const monto = Number(x.monto);
    const ps = partes[x.movimiento_id] ?? [];
    const otros = Math.min(monto, ps.reduce((a, y) => a + y.parte, 0));
    return {
      ...x, monto, mensualidad: Number(x.mensualidad), por_facturar: Number(x.por_facturar), parte_otros: Number(x.parte_otros),
      partes: ps, fraccionOtros: monto > 0 ? otros / monto : 0,
    } as CompraMsi;
  });
}

export const activaEn = (x: CompraMsi, mes: string) => x.primer_mes <= mes && x.ultimo_mes >= mes;

export type MesMsi = { mes: string; total: number; otros: number };
export function proyeccionMsi(lista: CompraMsi[], desde: string, n = 12): MesMsi[] {
  return Array.from({ length: n }, (_, k) => sumarMes(desde, k)).map((mes) => {
    const del = lista.filter((x) => x.estado === "Activa" && activaEn(x, mes));
    return { mes, total: del.reduce((a, x) => a + x.mensualidad, 0), otros: del.reduce((a, x) => a + x.mensualidad * x.fraccionOtros, 0) };
  });
}

export type PersonaMsi = { persona: string; clave: string; mensual: number; falta: number; compras: number; completo: boolean };
// Por persona: su parte de la mensualidad de este mes y lo que falta de sus compras a meses
export function personasMsi(lista: CompraMsi[], mes: string): PersonaMsi[] {
  const r: Record<string, PersonaMsi> = {};
  for (const x of lista) {
    if (x.estado !== "Activa" || x.monto <= 0) continue;
    for (const p of x.partes) {
      const f = p.parte / x.monto;
      const e = (r[p.clave] ??= { persona: p.persona, clave: p.clave, mensual: 0, falta: 0, compras: 0, completo: false });
      if (activaEn(x, mes)) e.mensual += x.mensualidad * f;
      e.falta += x.por_facturar * f;
      e.compras += 1;
      if (p.cobro_completo) e.completo = true;
    }
  }
  return Object.values(r).sort((a, b) => b.falta - a.falta);
}

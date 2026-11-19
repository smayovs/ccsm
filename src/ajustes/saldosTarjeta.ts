import { sb } from "../supabase";
import { conDia, hoyISO, masDias, mesISO, sumarMes } from "../util";

// ---------- Fechas de corte (misma regla que la base de datos) ----------
// Fecha del último corte que ya ocurrió (hoy cuenta si es día de corte)
export function ultimoCorte(corte: number, hoy = hoyISO()) {
  const mes = mesISO(hoy);
  const f = conDia(mes, corte);
  return f <= hoy ? f : conDia(sumarMes(mes, -1), corte);
}

// Mensualidades ya cobradas (facturadas) de una compra, igual que _msi_facturadas en la base
export function facturadas(fecha: string, corte: number, meses: number, hoy = hoyISO()) {
  const primer = fecha <= conDia(mesISO(fecha), corte) ? mesISO(fecha) : sumarMes(mesISO(fecha), 1);
  const ult = mesISO(ultimoCorte(corte, hoy));
  const [y1, m1] = primer.split("-").map(Number), [y2, m2] = ult.split("-").map(Number);
  return Math.max(0, Math.min(meses, (y2 - y1) * 12 + (m2 - m1) + 1));
}

// Fecha que hace que la compra lleve exactamente n mensualidades cobradas al último corte
export function fechaParaPago(corte: number, n: number, hoy = hoyISO()) {
  const ult = ultimoCorte(corte, hoy);
  if (n <= 0) return masDias(ult, 1);
  return sumarMes(mesISO(ult), -(n - 1));
}

// ---------- Compras a meses en el formato del estado de cuenta ("pago N de M") ----------
export type FilaMsi = { id?: string; descripcion: string; mensualidad: string; n: string; m: string; fecha?: string; monto?: number;
  orig?: { descripcion: string; mensualidad: string; n: string; m: string } };

// Carga las compras a meses activas de una tarjeta en el formato del estado de cuenta
export async function cargarMensualidades(cuentaId: string, corte: number): Promise<FilaMsi[]> {
  const { data } = await sb.from("movimientos").select("id, fecha, descripcion, comercio, monto, meses_msi")
    .eq("cuenta_id", cuentaId).eq("tipo", "gasto").not("meses_msi", "is", null).order("fecha");
  return ((data ?? []) as any[]).map((x) => {
    const v = { descripcion: x.descripcion || x.comercio || "", mensualidad: String(Math.round((Number(x.monto) / x.meses_msi) * 100) / 100),
      m: String(x.meses_msi), n: String(facturadas(x.fecha, corte, x.meses_msi)) };
    return { id: x.id, fecha: x.fecha, monto: Number(x.monto), ...v, orig: { ...v } };
  }).filter((f) => Number(f.n) < Number(f.m));
}

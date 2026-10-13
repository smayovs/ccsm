// Ingresos programados: lo que sabes que va a llegar (sueldo, bono…) con monto aproximado.
// No suman a ningún saldo hasta que los confirmas (confirmar_ingreso en la base crea el ingreso real).
import { sb } from "./supabase";
import { conDia, masDias, mesISO, sumarMes } from "./util";

export type Repetir = "catorcena" | "mes" | null;
export type IngresoProgramado = {
  id: string; fecha: string; monto: number; cuenta_id: string | null; categoria_id: string | null; descripcion: string; repetir: Repetir;
};

export async function cargarProgramados(): Promise<IngresoProgramado[]> {
  const { data, error } = await sb.from("ingresos_programados").select("id, fecha, monto, cuenta_id, categoria_id, descripcion, repetir").order("fecha");
  if (error) throw error;
  return (data ?? []).map((x: any) => ({ ...x, monto: Number(x.monto) }));
}

// Siguiente fecha según cómo se repite (el mes conserva el día original, ajustado a meses cortos)
export const siguienteFecha = (f: string, repetir: Repetir, diaOriginal = Number(f.slice(8, 10))) =>
  repetir === "catorcena" ? masDias(f, 14) : repetir === "mes" ? conDia(sumarMes(mesISO(f), 1), diaOriginal) : null;

// Fechas en que cae un ingreso programado dentro de [desde, hasta): la próxima y, si se repite, las siguientes
export function fechasEn(ip: Pick<IngresoProgramado, "fecha" | "repetir">, desde: string, hasta: string, max = 60) {
  const r: string[] = [];
  const dia = Number(ip.fecha.slice(8, 10));
  for (let f: string | null = ip.fecha; f && f < hasta && r.length < max; f = siguienteFecha(f, ip.repetir, dia)) if (f >= desde) r.push(f);
  return r;
}

export const TEXTO_REPETIR: Record<string, string> = { catorcena: "Cada catorcena", mes: "Cada mes" };

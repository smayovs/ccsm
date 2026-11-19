import { conDia, masDias, mesISO, sumarMes } from "./util";

// Fecha límite de pago de una tarjeta: misma regla que _fecha_pago en la base de datos.
// - "fijo": el día dia_pago del mes, después del corte
// - "dias": pago_dias días naturales después del corte
// - "corte": el día del siguiente corte
// Si cae en fin de semana, "antes" la recorre al viernes y "despues" al lunes.
export type ReglaPago = { pago_regla: "fijo" | "dias" | "corte"; dia_pago: number | null; pago_dias: number | null; pago_habil: "no" | "antes" | "despues"; dia_corte: number | null };

// Primer día "dia" (ajustado al último del mes) en o después de "desde"; como _proxima_fecha
export function proximaFecha(dia: number, desde: string) {
  const f = conDia(mesISO(desde), dia);
  return f >= desde ? f : conDia(sumarMes(mesISO(desde), 1), dia);
}

const diaSemana = (f: string) => new Date(f + "T12:00:00Z").getUTCDay(); // 0 domingo … 6 sábado

export function fechaPago(r: ReglaPago, corte: string): string | null {
  let f: string | null =
    r.pago_regla === "dias" ? masDias(corte, r.pago_dias ?? 20)
    : r.pago_regla === "corte" ? (r.dia_corte ? proximaFecha(r.dia_corte, masDias(corte, 1)) : null)
    : r.dia_pago ? proximaFecha(r.dia_pago, masDias(corte, 1)) : null;
  if (!f) return null;
  const d = diaSemana(f);
  if (r.pago_habil === "antes") f = masDias(f, d === 6 ? -1 : d === 0 ? -2 : 0);
  else if (r.pago_habil === "despues") f = masDias(f, d === 6 ? 2 : d === 0 ? 1 : 0);
  return f;
}

// Texto corto de la regla, para el detalle de la tarjeta
export function textoRegla(r: ReglaPago) {
  const base = r.pago_regla === "dias" ? `${r.pago_dias ?? 20} días después del corte`
    : r.pago_regla === "corte" ? "el día del siguiente corte" : `el día ${r.dia_pago ?? "?"} de cada mes`;
  return base + (r.pago_habil === "antes" ? "; en fin de semana, el viernes antes" : r.pago_habil === "despues" ? "; en fin de semana, el lunes después" : "");
}

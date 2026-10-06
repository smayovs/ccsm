export const fmt = (n: number | null | undefined, decimales = true) =>
  Number(n ?? 0).toLocaleString("es-MX", {
    style: "currency", currency: "MXN",
    minimumFractionDigits: decimales ? 2 : 0, maximumFractionDigits: decimales ? 2 : 0,
  });

// Cancún no cambia de horario: UTC-5 todo el año
export const hoyISO = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
export const mesISO = (d: string = hoyISO()) => d.slice(0, 7) + "-01";
export const sumarMes = (m: string, k: number) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1 + k, 1)).toISOString().slice(0, 10);
};
export const nombreMes = (m: string) =>
  new Date(m.slice(0, 10) + "T12:00:00Z").toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
export const mesCorto = (m: string) =>
  new Date(m.slice(0, 10) + "T12:00:00Z").toLocaleDateString("es-MX", { month: "short", year: "2-digit", timeZone: "UTC" });
export const fechaLarga = (d: string) =>
  new Date(d + "T12:00:00Z").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
export const fechaCorta = (d: string) =>
  new Date(d + "T12:00:00Z").toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });
export const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);

export const TIPOS_CUENTA: Record<string, string> = {
  debito: "Débito", credito: "Crédito", ahorro: "Ahorro", efectivo: "Efectivo", inversion: "Inversión",
};
export const TIPOS_MOV: Record<string, string> = {
  gasto: "Gasto", ingreso: "Ingreso", transferencia: "Transferencia", reembolso: "Reembolso", liquidacion: "Liquidación",
};
export const VISIBILIDAD: Record<string, string> = {
  privada: "Privada: solo tú", solo_saldo: "Solo saldo: tu pareja ve el saldo, no los movimientos",
  completa: "Completa: tu pareja ve los movimientos (sin editarlos)",
};

export function proximoCobro(fechaRef: string | null, frecuencia: number): string | null {
  if (!fechaRef) return null;
  const hoy = hoyISO();
  let [y, m, d] = fechaRef.split("-").map(Number);
  for (let i = 0; i < 600; i++) {
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const f = new Date(Date.UTC(y, m - 1, Math.min(d, ultimo))).toISOString().slice(0, 10);
    if (f >= hoy) return f;
    m += frecuencia; while (m > 12) { m -= 12; y += 1; }
  }
  return null;
}

export function descargar(nombre: string, contenido: string, tipo = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob(["﻿" + contenido], { type: tipo }));
  const a = document.createElement("a");
  a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const errorTexto = (e: any) => {
  const m = String(e?.message ?? e ?? "Error");
  if (m.includes("duplicate key")) return "Ya existe uno con ese nombre.";
  if (m.includes("row-level security")) return "No tienes permiso para hacer eso.";
  if (m.includes("violates foreign key") && m.includes("movimientos")) return "Tiene movimientos registrados: desactívala en lugar de borrarla.";
  return m;
};

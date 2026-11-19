import { describe, expect, it, vi } from "vitest";
vi.mock("./supabase", () => ({ sb: {} }));
import { antesDe, cuentasDelCorte, deudasDe, enPeriodo, mesDeCorte, type Cargo } from "./cobros";

const cargo = (fecha: string, mes: string, futuro = false): Cargo => ({ id: "m|f", mov: "m", fecha, mes, texto: "", monto: 100, pendiente: 100, origen: "gasto", cuenta: null, futuro });

describe("mesDeCorte: estado de cuenta en que entra una compra", () => {
  it("el día del corte entra en ese mes", () => expect(mesDeCorte("2026-10-15", 15)).toBe("2026-10-01"));
  it("después del corte entra al mes siguiente", () => expect(mesDeCorte("2026-10-16", 15)).toBe("2026-11-01"));
  it("corte el 31 en febrero corta el 28", () => expect(mesDeCorte("2027-02-28", 31)).toBe("2027-02-01"));
  it("sin tarjeta de crédito va por mes calendario", () => expect(mesDeCorte("2026-10-30", null)).toBe("2026-10-01"));
});

describe("enPeriodo y antesDe", () => {
  // Compra del 20 de septiembre en una tarjeta que corta el 15: entra al corte de octubre
  const c = cargo("2026-09-20", "2026-10-01");
  it("cortes: por el mes del estado de cuenta", () => {
    expect(enPeriodo(c, { tipo: "corte", mes: "2026-10-01" })).toBe(true);
    expect(enPeriodo(c, { tipo: "corte", mes: "2026-09-01" })).toBe(false);
    expect(antesDe(c, { tipo: "corte", mes: "2026-11-01" })).toBe(true);
  });
  it("mes calendario: por la fecha", () => {
    expect(enPeriodo(c, { tipo: "mes", mes: "2026-09-01" })).toBe(true);
    expect(antesDe(c, { tipo: "mes", mes: "2026-10-01" })).toBe(true);
  });
  it("fechas: incluye los dos extremos", () => {
    expect(enPeriodo(c, { tipo: "rango", desde: "2026-09-20", hasta: "2026-09-20" })).toBe(true);
    expect(antesDe(c, { tipo: "rango", desde: "2026-09-21", hasta: "2026-09-30" })).toBe(true);
  });
  it("por venir: solo lo que aún no se cobra; lo de hoy queda como de antes", () => {
    expect(enPeriodo(cargo("2026-12-15", "2026-12-01", true), { tipo: "venir" })).toBe(true);
    expect(enPeriodo(c, { tipo: "venir" })).toBe(false);
    expect(antesDe(c, { tipo: "venir" })).toBe(true);
  });
});

describe("deudasDe: lo que te deben por módulo", () => {
  const c = (origen: Cargo["origen"], pendiente: number, futuro = false): Cargo => ({ id: "x", mov: "m", fecha: "2026-10-01", mes: "2026-10-01", texto: "", monto: pendiente, pendiente, origen, cuenta: null, futuro });
  const personas = { ana: { cargos: [c("gasto", 100), c("suscripcion", 50)], venir: [c("msi", 300, true)], marcados: [], total: 150, porVenir: 300, proxima: 0, pagado: 0 } };
  it("sin módulo suma todo", () => expect(deudasDe(personas)).toEqual([{ id: "ana", hoy: 150, despues: 300 }]));
  it("por módulo suma solo sus cargos", () => expect(deudasDe(personas, "suscripcion")).toEqual([{ id: "ana", hoy: 50, despues: 0 }]));
  it("quita a quien no debe nada de ese módulo", () => expect(deudasDe({ ana: { ...personas.ana, venir: [] } }, "msi")).toEqual([]));
});

describe("cuentasDelCorte: lo de cada persona en un corte de una tarjeta", () => {
  const c = (cuenta: string, mes: string, monto: number, pendiente: number): Cargo => ({ id: "x", mov: "m", fecha: mes, mes, texto: "", monto, pendiente, origen: "gasto", cuenta });
  const p = (todos: Cargo[]) => ({ cargos: [], venir: [], marcados: [], todos, total: 0, porVenir: 0, proxima: 0, pagado: 0 });
  const personas = { ana: p([c("bbva", "2026-11-01", 300, 100), c("bbva", "2026-10-01", 50, 50), c("hsbc", "2026-11-01", 80, 80)]), leo: p([c("bbva", "2026-11-01", 500, 500)]) };
  it("solo cuenta esa tarjeta y ese corte, con lo pagado y lo que falta", () =>
    expect(cuentasDelCorte(personas, "bbva", "2026-11-01").map(({ cargos, ...x }) => x)).toEqual([
      { id: "leo", total: 500, falta: 500, pagado: 0 }, { id: "ana", total: 300, falta: 100, pagado: 200 }]));
  it("sin cargos en ese corte no aparece nadie", () => expect(cuentasDelCorte(personas, "hsbc", "2026-10-01")).toEqual([]));
});

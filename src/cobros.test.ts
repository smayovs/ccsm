import { describe, expect, it, vi } from "vitest";
vi.mock("./supabase", () => ({ sb: {} }));
import { antesDe, enPeriodo, mesDeCorte, type Cargo } from "./cobros";

const cargo = (fecha: string, mes: string, futuro = false): Cargo => ({ id: "m|f", mov: "m", fecha, mes, texto: "", monto: 100, pendiente: 100, futuro });

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

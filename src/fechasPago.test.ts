import { describe, expect, it } from "vitest";
import { fechaPago, proximaFecha } from "./fechasPago";

// Mismos casos que _fecha_pago en la base de datos
const r = (x: Partial<Parameters<typeof fechaPago>[0]>) => ({ pago_regla: "fijo" as const, dia_pago: null, pago_dias: null, pago_habil: "no" as const, dia_corte: 7, ...x });

describe("fechaPago: fecha límite según la regla de la tarjeta", () => {
  it("día fijo: el siguiente día de pago después del corte", () => expect(fechaPago(r({ dia_pago: 27 }), "2026-11-07")).toBe("2026-11-27"));
  it("día fijo menor que el corte: el mes siguiente", () => expect(fechaPago(r({ dia_pago: 2 }), "2026-11-12")).toBe("2026-12-02"));
  it("días después del corte (Plata: 30)", () => expect(fechaPago(r({ pago_regla: "dias", pago_dias: 30 }), "2026-10-28")).toBe("2026-11-27"));
  it("el día del siguiente corte (Liverpool)", () => expect(fechaPago(r({ pago_regla: "corte" }), "2026-11-07")).toBe("2026-12-07"));
  it("corte el 31: el siguiente corte se ajusta al fin de mes", () => expect(fechaPago(r({ pago_regla: "corte", dia_corte: 31 }), "2026-01-31")).toBe("2026-02-28"));
  it("sábado se recorre al viernes antes", () => expect(fechaPago(r({ dia_pago: 28, pago_habil: "antes" }), "2026-11-05")).toBe("2026-11-27"));
  it("domingo se recorre al lunes después", () => expect(fechaPago(r({ dia_pago: 29, pago_habil: "despues" }), "2026-11-05")).toBe("2026-11-30"));
  it("entre semana no se mueve", () => expect(fechaPago(r({ dia_pago: 25, pago_habil: "despues" }), "2026-11-05")).toBe("2026-11-25"));
  it("sin día de pago no hay fecha", () => expect(fechaPago(r({}), "2026-11-05")).toBeNull());
});

describe("proximaFecha: como _proxima_fecha", () => {
  it("el mismo día cuenta", () => expect(proximaFecha(15, "2026-11-15")).toBe("2026-11-15"));
  it("31 en noviembre es el 30", () => expect(proximaFecha(31, "2026-11-20")).toBe("2026-11-30"));
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { facturadas, fechaParaPago, ultimoCorte } from "./ajustes/saldosTarjeta";
import { hoyISO, msiAnteriores, proximoCobro, sumarMes } from "./util";

// Mismos casos que se verificaron contra _msi_facturadas y _proxima_fecha en la base de datos

describe("ultimoCorte: fecha del último corte que ya ocurrió", () => {
  it("un día antes del corte, el último corte fue el mes pasado", () => {
    expect(ultimoCorte(15, "2026-10-14")).toBe("2026-09-15");
  });

  it("el día de corte cuenta como corte de hoy", () => {
    expect(ultimoCorte(15, "2026-10-15")).toBe("2026-10-15");
  });

  it("corte el 31 en febrero cae el último día del mes", () => {
    expect(ultimoCorte(31, "2027-02-28")).toBe("2027-02-28");
  });

  it("el 1 de marzo, con corte el 31, el último corte fue el 28 de febrero", () => {
    expect(ultimoCorte(31, "2027-03-01")).toBe("2027-02-28");
  });
});

describe("facturadas: mensualidades ya cobradas de una compra a meses", () => {
  it("compra antes del corte: ninguna mensualidad hasta que llega el corte", () => {
    expect(facturadas("2026-10-10", 15, 3, "2026-10-14")).toBe(0);
  });

  it("compra antes del corte: la primera se cobra en ese mismo corte", () => {
    expect(facturadas("2026-10-10", 15, 3, "2026-10-15")).toBe(1);
  });

  it("nunca pasa del total de meses", () => {
    expect(facturadas("2026-10-10", 15, 3, "2027-01-20")).toBe(3);
  });

  it("compra después del corte: la primera mensualidad va al corte del mes siguiente", () => {
    expect(facturadas("2026-10-16", 15, 3, "2026-10-20")).toBe(0);
  });

  it("corte el 31: febrero corta el 28", () => {
    expect(facturadas("2027-01-05", 31, 6, "2027-02-28")).toBe(2);
  });
});

describe("fechaParaPago: fecha que deja una compra con n mensualidades cobradas", () => {
  it("n = 0: el día siguiente al último corte", () => {
    expect(fechaParaPago(15, 0, "2026-10-20")).toBe("2026-10-16");
  });

  it("la fecha calculada da exactamente las mensualidades pedidas", () => {
    for (const n of [0, 1, 3, 6]) {
      expect(facturadas(fechaParaPago(15, n, "2026-10-20"), 15, 12, "2026-10-20")).toBe(n);
    }
  });
});

describe("msiAnteriores: compras a meses de antes del periodo cuya mensualidad puede caer dentro", () => {
  const compras = [
    { id: "a", fecha: "2026-10-05" }, // dentro del periodo: viene en los movimientos del mes, no aquí
    { id: "b", fecha: "2026-09-30" }, // un día antes del periodo
    { id: "c", fecha: "2022-10-01" }, // justo 48 meses antes del mes del periodo
    { id: "d", fecha: "2022-09-30" }, // más de 48 meses antes: ya no puede tener mensualidades
  ];

  it("deja solo las compras de antes del periodo y de hasta 48 meses atrás (lo mismo que pedía la base)", () => {
    expect(msiAnteriores(compras, "2026-10-01").map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("al cambiar de mes se recalcula sin volver a pedir nada (la de oct 2022 ya queda a más de 48 meses)", () => {
    expect(msiAnteriores(compras, "2026-11-01").map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("funciona con periodos que no empiezan el día 1 (periodo de corte)", () => {
    expect(msiAnteriores(compras, "2026-10-06").map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("sumarMes", () => {
  it("cruza el fin de año hacia adelante", () => {
    expect(sumarMes("2026-11-01", 2)).toBe("2027-01-01");
  });

  it("cruza el inicio de año hacia atrás", () => {
    expect(sumarMes("2026-01-01", -1)).toBe("2025-12-01");
  });
});

describe("fechas en hora de Cancún", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("a las 9 de la noche en Cancún sigue siendo el mismo día (no el día siguiente en UTC)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-13T02:00:00Z")); // 12 oct, 21:00 en Cancún
    expect(hoyISO()).toBe("2026-10-12");
  });

  it("una suscripción mensual del 31 se cobra el último día de febrero", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-10T17:00:00Z"));
    expect(proximoCobro("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("una suscripción anual se cobra el mismo día del año siguiente", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-10T17:00:00Z"));
    expect(proximoCobro("2025-03-15", 12)).toBe("2026-03-15");
  });
});

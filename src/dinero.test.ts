import { describe, expect, it } from "vitest";
import { cobradoTras, mensualidadesMsi, parteDePareja } from "./dinero";

describe("parteDePareja: lo que le toca a tu pareja de un gasto compartido", () => {
  it("50/50 sin familiares: la mitad del gasto", () => {
    expect(parteDePareja(1000, 0, "mitad", 0)).toEqual({ base: 1000, parte: 500, tuParte: 500 });
  });

  it("50/50 con la parte de un familiar: se reparte solo lo que queda (igual que la base de datos)", () => {
    // $1,000, papá paga $400 → quedan $600 entre los dos
    expect(parteDePareja(1000, 400, "mitad", 0)).toEqual({ base: 600, parte: 300, tuParte: 300 });
  });

  it("porcentaje con familiares: el porcentaje es de lo que queda", () => {
    expect(parteDePareja(1000, 400, "pct", 40).parte).toBe(240);
  });

  it("todo de tu pareja con familiares: le toca todo lo que queda, no el total", () => {
    expect(parteDePareja(1000, 400, "todo", 0).parte).toBe(600);
  });

  it("monto fijo: le toca exactamente ese monto", () => {
    expect(parteDePareja(1000, 400, "monto", 250)).toEqual({ base: 600, parte: 250, tuParte: 350 });
  });

  it("no compartido: no le toca nada", () => {
    expect(parteDePareja(1000, 400, "no", 0).parte).toBe(0);
  });

  it("redondea a centavos como la base de datos (la mitad de $100.01 es $50.01)", () => {
    expect(parteDePareja(100.01, 0, "mitad", 0).parte).toBe(50.01);
  });
});

describe("cobradoTras: lo cobrado de una compra a meses tras n mensualidades (igual que _msi_cobrado)", () => {
  it("sin mensualidades cobradas no se ha cobrado nada", () => {
    expect(cobradoTras(1000, 3, 0)).toBe(0);
  });

  it("la primera mensualidad absorbe los centavos sobrantes", () => {
    expect(cobradoTras(1000, 3, 1)).toBe(333.34);
  });

  it("a mitad de la compra se cobra lo mismo que dice el banco", () => {
    expect(cobradoTras(1000, 3, 2)).toBe(666.67);
  });

  it("al terminar se cobra el total exacto, sin perder centavos", () => {
    expect(cobradoTras(1000, 3, 3)).toBe(1000);
  });

  it("cuando la mensualidad redondea hacia arriba, la primera es menor", () => {
    // $200 / 3 = 66.67 redondeado; la primera cobra 200 − 2 × 66.67 = 66.66
    expect(cobradoTras(200, 3, 1)).toBe(66.66);
  });
});

describe("mensualidadesMsi: cada mensualidad de una compra a meses", () => {
  it("las mensualidades suman exactamente el total de la compra", () => {
    const m = mensualidadesMsi(1000, 3);
    expect(m.reduce((a, x) => a + x, 0)).toBeCloseTo(1000, 10);
  });

  it("la primera lleva los centavos y las demás son iguales", () => {
    expect(mensualidadesMsi(1000, 3)).toEqual([333.34, 333.33, 333.33]);
  });

  it("una compra que divide exacto tiene mensualidades iguales", () => {
    expect(mensualidadesMsi(1200, 12)).toEqual(Array(12).fill(100));
  });
});

describe("montoMensualidad", () => {
  it("redondea cada mensualidad y la primera absorbe los centavos, como la base", async () => {
    const { montoMensualidad } = await import("./util");
    expect(montoMensualidad(6060.81, 18, 1)).toBe(336.74);
    expect(montoMensualidad(6060.81, 18, 2)).toBe(336.71);
    // la suma de todas da el total exacto
    const total = Array.from({ length: 18 }, (_, i) => montoMensualidad(6060.81, 18, i + 1)).reduce((a, b) => a + b, 0);
    expect(Math.round(total * 100) / 100).toBe(6060.81);
  });
});

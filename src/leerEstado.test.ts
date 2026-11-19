import { describe, expect, it } from "vitest";
import { leerEstado, leerFecha, leerImporte } from "./leerEstado";

describe("leerFecha: formatos de los estados de cuenta", () => {
  it("dd/mm/aaaa", () => expect(leerFecha("07/11/2026")).toBe("2026-11-07"));
  it("dd-mmm-aaaa", () => expect(leerFecha("07-NOV-2026")).toBe("2026-11-07"));
  it("dd mmm aa", () => expect(leerFecha(" 7 Dic 26")).toBe("2026-12-07"));
  it("con texto antes", () => expect(leerFecha(": 05-dic-2026 algo")).toBe("2026-12-05"));
  it("7 de noviembre de 2026", () => expect(leerFecha("7 de noviembre de 2026")).toBe("2026-11-07"));
  it("sin fecha", () => expect(leerFecha("sin nada")).toBeNull());
});

describe("leerImporte", () => {
  it("con signo de pesos y comas", () => expect(leerImporte("  $26,521.38 ")).toBe(26521.38));
  it("sin comas", () => expect(leerImporte("1979.93")).toBe(1979.93));
  it("negativo", () => expect(leerImporte("-$1,000.00")).toBe(1000));
});

// Texto como el que sale del PDF: etiquetas y valores a veces en el mismo renglón y a veces en el siguiente
const estado = `ESTADO DE CUENTA
Periodo: 08-oct-2026 al 07-nov-2026
Fecha de corte 07-nov-2026
Fecha límite de pago:
07-dic-2026
Pago para no generar intereses: $26,521.38
Pago mínimo $1,520.00
Saldo deudor total $84,115.62
09-oct 10-oct REFRIGERADOR LIVERPOOL $19,139.40
17-oct 17-oct RESTAURANTE EL FARO 821.10
22-oct 22-oct SU PAGO GRACIAS -$35,233.92
05-nov 05-nov AMAZON MX 1,234.50
COMPRAS A MESES
BOTAS 4,078.30 453.14 2 de 9
GARANTIA 6,060.81 336.71 2 de 18`;

describe("leerEstado: resumen, movimientos y compras a meses", () => {
  const e = leerEstado(estado);
  it("fechas", () => { expect(e.fechaCorte).toBe("2026-11-07"); expect(e.fechaLimite).toBe("2026-12-07"); });
  it("pagos y saldo", () => { expect(e.pagoNoIntereses).toBe(26521.38); expect(e.pagoMinimo).toBe(1520); expect(e.saldoCorte).toBe(84115.62); });
  it("movimientos con año del corte y abonos", () => {
    expect(e.movimientos).toEqual([
      { fecha: "2026-10-09", descripcion: "REFRIGERADOR LIVERPOOL", monto: 19139.4, abono: false },
      { fecha: "2026-10-17", descripcion: "RESTAURANTE EL FARO", monto: 821.1, abono: false },
      { fecha: "2026-10-22", descripcion: "SU PAGO GRACIAS", monto: 35233.92, abono: true },
      { fecha: "2026-11-05", descripcion: "AMAZON MX", monto: 1234.5, abono: false },
    ]);
  });
  it("compras a meses con su pago N de M", () => {
    expect(e.msi).toEqual([
      { descripcion: "BOTAS", n: 2, m: 9, mensualidad: 453.14 },
      { descripcion: "GARANTIA", n: 2, m: 18, mensualidad: 336.71 },
    ]);
  });
  it("un mes de diciembre en un corte de enero es del año anterior", () => {
    expect(leerEstado("Fecha de corte 05/01/2027\n28-dic COMPRA 100.00").movimientos[0].fecha).toBe("2026-12-28");
  });
});

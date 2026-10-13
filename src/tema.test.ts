import { describe, expect, it } from "vitest";
import { APARIENCIA_INICIAL, normalizar } from "./tema";

describe("normalizar", () => {
  it("la paleta inicial de antes (marino sin color propio) pasa a la de la marca", () => {
    expect(normalizar({ ...APARIENCIA_INICIAL, paleta: "marino" }).paleta).toBe("ccsm");
  });
  it("respeta un color propio y las demás paletas", () => {
    expect(normalizar({ ...APARIENCIA_INICIAL, paleta: "marino", acento: "#1E91FF" }).paleta).toBe("marino");
    expect(normalizar({ ...APARIENCIA_INICIAL, paleta: "azul" }).paleta).toBe("azul");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// Supabase falso que cuenta cuántas veces se pide cada cosa
const pedidas: string[] = [];
const respuesta = (data: unknown) => ({ then: (ok: (r: unknown) => unknown, mal?: (e: unknown) => unknown) => { return Promise.resolve({ data, error: null }).then(ok, mal); } });
vi.mock("./supabase", () => ({
  sb: {
    rpc: (nombre: string) => { pedidas.push(nombre); return respuesta([]); },
    from: (tabla: string) => ({ select: () => ({ maybeSingle: () => { pedidas.push(tabla); return respuesta({ apariencia: { modo: "oscuro" }, inicio: { secciones: [] } }); } }) }),
  },
}));

const { cargarMsi } = await import("./msi");
const { cargarPreferencias, olvidarPreferencias } = await import("./preferencias");

beforeEach(() => { pedidas.length = 0; olvidarPreferencias(); });

describe("consultas del arranque sin duplicar", () => {
  it("cargarMsi usa el detalle de compras a meses que ya se pidió, sin pedirlo otra vez", async () => {
    const detalle = Promise.resolve({ data: [] });
    await cargarMsi(detalle);
    expect(pedidas.filter((x) => x === "msi_detalle")).toHaveLength(0);
  });

  it("cargarMsi sin detalle previo lo pide una vez (otras pantallas siguen funcionando igual)", async () => {
    await cargarMsi();
    expect(pedidas.filter((x) => x === "msi_detalle")).toHaveLength(1);
  });

  it("las preferencias (apariencia e Inicio) se piden una sola vez aunque las usen varias partes", async () => {
    const [a, b] = await Promise.all([cargarPreferencias("usuario-1"), cargarPreferencias("usuario-1")]);
    expect(pedidas.filter((x) => x === "preferencias")).toHaveLength(1);
    expect(a).toEqual(b);
  });

  it("después de guardar preferencias se vuelven a pedir (no se queda lo viejo)", async () => {
    await cargarPreferencias("usuario-1");
    olvidarPreferencias();
    await cargarPreferencias("usuario-1");
    expect(pedidas.filter((x) => x === "preferencias")).toHaveLength(2);
  });

  it("otro usuario no recibe las preferencias del anterior", async () => {
    await cargarPreferencias("usuario-1");
    await cargarPreferencias("usuario-2");
    expect(pedidas.filter((x) => x === "preferencias")).toHaveLength(2);
  });
});

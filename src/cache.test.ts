import { describe, expect, it } from "vitest";
import { borrarCache, guardarCache, leerCache } from "./cache";

// Almacenamiento falso con la misma forma que localStorage
function almacen(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => { datos.set(k, v); },
    removeItem: (k: string) => { datos.delete(k); },
    key: (i: number) => [...datos.keys()][i] ?? null,
    get length() { return datos.size; },
    datos,
  };
}

describe("caché de datos en el dispositivo", () => {
  it("lo guardado se lee igual", () => {
    const a = almacen();
    guardarCache("usuario-1", "inicio", { saldo: 1234.5, cuentas: ["A", "B"] }, a);
    expect(leerCache("usuario-1", "inicio", a)).toEqual({ saldo: 1234.5, cuentas: ["A", "B"] });
  });

  it("cada usuario tiene su propia caché: otro usuario no ve tus datos", () => {
    const a = almacen();
    guardarCache("usuario-1", "inicio", { saldo: 100 }, a);
    expect(leerCache("usuario-2", "inicio", a)).toBeNull();
  });

  it("sin nada guardado devuelve null", () => {
    expect(leerCache("usuario-1", "inicio", almacen())).toBeNull();
  });

  it("si lo guardado está dañado devuelve null en vez de fallar", () => {
    const a = almacen({ "ccsm-cache:usuario-1:inicio": "{no es json" });
    expect(leerCache("usuario-1", "inicio", a)).toBeNull();
  });

  it("si el almacenamiento no está disponible no truena", () => {
    const roto = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("lleno"); } };
    expect(() => guardarCache("usuario-1", "inicio", { a: 1 }, roto as never)).not.toThrow();
    expect(leerCache("usuario-1", "inicio", roto as never)).toBeNull();
  });

  it("al cerrar sesión se borra toda la caché de datos, pero no otras preferencias del dispositivo", () => {
    const a = almacen({ "ccsm-apariencia": "{\"modo\":\"oscuro\"}" });
    guardarCache("usuario-1", "inicio", { saldo: 1 }, a);
    guardarCache("usuario-1", "catalogos", { cuentas: [] }, a);
    borrarCache(a);
    expect([...a.datos.keys()]).toEqual(["ccsm-apariencia"]);
  });
});

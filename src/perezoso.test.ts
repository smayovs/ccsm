import { describe, expect, it, vi } from "vitest";
import { conRecarga } from "./perezoso";

function almacen() {
  const datos = new Map<string, string>();
  return { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => { datos.set(k, v); }, removeItem: (k: string) => { datos.delete(k); }, datos };
}

describe("conRecarga: pantallas que se descargan al abrirlas", () => {
  it("si la pantalla se descarga bien, la entrega", async () => {
    const recargar = vi.fn();
    const m = await conRecarga(() => Promise.resolve({ default: "Pantalla" }), recargar, almacen())();
    expect(m).toEqual({ default: "Pantalla" });
    expect(recargar).not.toHaveBeenCalled();
  });

  it("si falla (se publicó una versión nueva y el archivo viejo ya no existe), recarga la app una vez", async () => {
    const recargar = vi.fn();
    void conRecarga(() => Promise.reject(new Error("Failed to fetch dynamically imported module")), recargar, almacen())();
    await new Promise((r) => setTimeout(r, 0));
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it("si vuelve a fallar después de recargar, no recarga en bucle: muestra el error", async () => {
    const a = almacen();
    const recargar = vi.fn();
    void conRecarga(() => Promise.reject(new Error("sin red")), recargar, a)();
    await new Promise((r) => setTimeout(r, 0));
    await expect(conRecarga(() => Promise.reject(new Error("sin red")), recargar, a)()).rejects.toThrow("sin red");
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it("después de una descarga exitosa, una falla futura vuelve a poder recargar", async () => {
    const a = almacen();
    const recargar = vi.fn();
    void conRecarga(() => Promise.reject(new Error("x")), recargar, a)();
    await new Promise((r) => setTimeout(r, 0));
    await conRecarga(() => Promise.resolve({ default: 1 }), recargar, a)();
    void conRecarga(() => Promise.reject(new Error("x")), recargar, a)();
    await new Promise((r) => setTimeout(r, 0));
    expect(recargar).toHaveBeenCalledTimes(2);
  });
});

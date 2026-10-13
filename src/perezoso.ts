// Pantallas que se descargan al abrirlas (React.lazy). Si la descarga falla porque se publicó una versión
// nueva y el archivo viejo ya no existe, la app se recarga una sola vez en lugar de quedarse rota (perezoso.test.ts).
import { lazy, type ComponentType } from "react";

type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const CLAVE = "ccsm-recargo-pantalla";
const sesion = (): Almacen | null => { try { return globalThis.sessionStorage ?? null; } catch { return null; } };

export function conRecarga<T>(importar: () => Promise<T>, recargar = () => location.reload(), almacen: Almacen | null = sesion()) {
  return () => importar().then(
    (m) => { try { almacen?.removeItem(CLAVE); } catch { /* sin almacenamiento */ } return m; },
    (e) => {
      let yaRecargo = false;
      try { yaRecargo = almacen?.getItem(CLAVE) === "1"; almacen?.setItem(CLAVE, "1"); } catch { yaRecargo = true; }
      if (yaRecargo) throw e;
      recargar();
      return new Promise<T>(() => {}); // la página se recarga; no hay nada que mostrar mientras
    },
  );
}

export const perezoso = <C extends ComponentType<any>>(importar: () => Promise<{ default: C }>) => lazy(conRecarga(importar));

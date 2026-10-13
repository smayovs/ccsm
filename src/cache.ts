// Caché de datos en el dispositivo: la app muestra al instante lo último que vio y lo actualiza por detrás.
// Cada usuario tiene sus propias claves y todo se borra al cerrar sesión (cache.test.ts).

type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const PREFIJO = "ccsm-cache:";
const local = (): Almacen | null => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function leerCache<T>(uid: string, clave: string, almacen: Almacen | null = local()): T | null {
  if (!uid || !almacen) return null;
  try { const x = almacen.getItem(`${PREFIJO}${uid}:${clave}`); return x ? (JSON.parse(x) as T) : null; } catch { return null; }
}

export function guardarCache(uid: string, clave: string, valor: unknown, almacen: Almacen | null = local()) {
  if (!uid || !almacen) return;
  try { almacen.setItem(`${PREFIJO}${uid}:${clave}`, JSON.stringify(valor)); } catch { /* sin espacio o bloqueado: solo se pierde la caché */ }
}

export function borrarCache(almacen: Almacen | null = local()) {
  if (!almacen) return;
  try {
    const claves: string[] = [];
    for (let i = 0; i < almacen.length; i++) { const k = almacen.key(i); if (k?.startsWith(PREFIJO)) claves.push(k); }
    for (const k of claves) almacen.removeItem(k);
  } catch { /* nada que borrar */ }
}

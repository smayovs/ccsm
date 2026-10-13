// Tus preferencias (apariencia y secciones de Inicio) se piden una sola vez por sesión y las comparten
// quienes las usan (consultas.test.ts). Al guardar cambios, olvidarPreferencias() hace que se vuelvan a pedir.
import { sb } from "./supabase";

export type Preferencias = { apariencia?: Record<string, unknown>; inicio?: { secciones?: unknown; meta?: unknown; metaModo?: unknown; ciclo?: unknown } } | null;

let actual: { uid: string; p: Promise<Preferencias> } | null = null;

export function cargarPreferencias(uid: string): Promise<Preferencias> {
  if (!actual || actual.uid !== uid) {
    actual = { uid, p: Promise.resolve(sb.from("preferencias").select("apariencia, inicio").maybeSingle())
      .then((r) => (r.data ?? null) as Preferencias, () => null) };
  }
  return actual.p;
}

export function olvidarPreferencias() { actual = null; }

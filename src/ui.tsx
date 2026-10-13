import { useCallback, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { nombreMes, sumarMes } from "./util";
import type { Categoria } from "./contexto";

export function Cabeza({ titulo, volver, accion }: { titulo: string; volver?: boolean; accion?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="cabeza">
      <div>
        {volver && <button className="volver" onClick={() => nav(-1)} aria-label="Volver">‹ Volver</button>}
        <h1>{titulo}</h1>
      </div>
      {accion}
    </header>
  );
}

export function SelectorMes({ mes, onCambio }: { mes: string; onCambio: (m: string) => void }) {
  return (
    <div className="selector-mes">
      <button onClick={() => onCambio(sumarMes(mes, -1))} aria-label="Mes anterior">‹</button>
      <span>{nombreMes(mes)}</span>
      <button onClick={() => onCambio(sumarMes(mes, 1))} aria-label="Mes siguiente">›</button>
    </div>
  );
}

export function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      {children}
      {ayuda && <small className="ayuda">{ayuda}</small>}
    </label>
  );
}

export function Segmentos<T extends string>({ opciones, valor, onCambio, etiqueta }: {
  opciones: { v: T; t: string }[]; valor: T; onCambio: (v: T) => void; etiqueta: string;
}) {
  return (
    <div className="segmentos" role="group" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button key={o.v} type="button" aria-pressed={valor === o.v} onClick={() => onCambio(o.v)}>{o.t}</button>
      ))}
    </div>
  );
}

// Selector de categoría en dos niveles (principal + subcategoría)
export function SelectorCategoria({ cats, tipo, valor, onCambio, incluirHogar = true, uid }: {
  cats: Categoria[]; tipo: "gasto" | "ingreso"; valor: string | null; onCambio: (id: string | null) => void;
  incluirHogar?: boolean; uid: string;
}) {
  const activas = cats.filter((c) => c.tipo === tipo && !c.archivada && (c.propietario_id === uid || (incluirHogar && c.propietario_id === null)));
  const padres = activas.filter((c) => !c.padre_id).sort((a, b) =>
    Number(a.propietario_id === null) - Number(b.propietario_id === null) || a.orden - b.orden);
  const actual = activas.find((c) => c.id === valor);
  const padreId = actual ? (actual.padre_id ?? actual.id) : "";
  const subs = activas.filter((c) => c.padre_id === padreId).sort((a, b) => a.orden - b.orden);
  return (
    <div className="dos">
      <Campo etiqueta="Categoría">
        <select value={padreId} onChange={(e) => onCambio(e.target.value || null)}>
          <option value="">Elige…</option>
          <optgroup label="Mías">
            {padres.filter((p) => p.propietario_id).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </optgroup>
          {incluirHogar && padres.some((p) => !p.propietario_id) && (
            <optgroup label="Del hogar">
              {padres.filter((p) => !p.propietario_id).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </optgroup>
          )}
        </select>
      </Campo>
      <Campo etiqueta="Subcategoría">
        <select value={actual?.padre_id ? actual.id : ""} onChange={(e) => onCambio(e.target.value || padreId || null)} disabled={!subs.length}>
          <option value="">{subs.length ? "General" : "—"}</option>
          {subs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
      </Campo>
    </div>
  );
}


// Esqueleto mientras carga una pantalla; VoiceOver anuncia "Cargando"
export function Cargando() {
  return (
    <div className="esqueleto" role="status" aria-label="Cargando">
      <span className="e-titulo" /><span className="e-tablero" /><span className="e-fila" /><span className="e-fila" /><span className="e-fila" />
    </div>
  );
}

// Evita que un doble toque ejecute dos veces una acción que guarda dinero
export function useUnaVez() {
  const enCurso = useRef(false);
  return useCallback(<A extends unknown[]>(fn: (...a: A) => unknown) => async (...a: A) => {
    if (enCurso.current) return;
    enCurso.current = true;
    try { await fn(...a); } finally { enCurso.current = false; }
  }, []);
}

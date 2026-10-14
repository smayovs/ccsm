import { useCallback, useRef, useState, type ReactNode } from "react";
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

// Símbolo de la marca: la moneda partida 60/40, rosa (ella) y gris (él)
export function Marca({ tam = 88 }: { tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 100 100" role="img" aria-label="ccsm">
      <path d="M58.69 10.95 A40 40 0 1 0 49.2 89.99 Z" fill="var(--rosa)" />
      <path d="M64.47 12.71 A40 40 0 0 1 55.24 89.65 Z" fill="var(--gris)" />
    </svg>
  );
}

// Encabezado de las pantallas de entrada: símbolo, nombre y lema
export function Bienvenido({ lema = "Cuentas claras entre dos." }: { lema?: string }) {
  return (
    <div className="marca-bloque">
      <Marca tam={84} />
      <div className="marca-nombre">ccsm</div>
      <div className="marca-lema">{lema}</div>
    </div>
  );
}

// Borrar con confirmación dentro de la app (en lugar de la ventana del sistema): el primer toque pregunta
export function ConfirmarBorrar({ etiqueta, pregunta, confirmar = "Sí, borrar", chico, onConfirmar }: {
  etiqueta: string; pregunta?: string; confirmar?: string; chico?: boolean; onConfirmar: () => unknown;
}) {
  const [abierto, setAbierto] = useState(false);
  const clase = "boton peligro" + (chico ? " chico" : "");
  if (!abierto) return <button type="button" className={clase} onClick={() => setAbierto(true)}>{etiqueta}</button>;
  return (
    <div className="confirmar" role="group" aria-label={pregunta ?? etiqueta}>
      {pregunta && <p className="nota mt-0 mb-8">{pregunta}</p>}
      <div className="flex gap-8">
        <button type="button" className={"boton claro" + (chico ? " chico" : "")} onClick={() => setAbierto(false)}>Cancelar</button>
        <button type="button" className={clase} autoFocus onClick={() => { setAbierto(false); onConfirmar(); }}>{confirmar}</button>
      </div>
    </div>
  );
}

// Fila con interruptor (va dentro de una .lista o de un panel)
export function Interruptor({ titulo, detalle, checked, onCambio, disabled }: {
  titulo: string; detalle?: string; checked: boolean; onCambio: (si: boolean) => void; disabled?: boolean;
}) {
  return (
    <label className="fila">
      <div className="cuerpo"><div className="titulo">{titulo}</div>{detalle && <div className="detalle">{detalle}</div>}</div>
      <span className="interruptor"><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onCambio(e.target.checked)} /><span /></span>
    </label>
  );
}

// Encabezado de sección: título, contador, ayuda y una acción a la derecha
export function Seccion({ titulo, contador, ayuda, accion, children }: {
  titulo: string; contador?: number; ayuda?: ReactNode; accion?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="seccion">
      <div className="seccion-cabeza">
        <div><h2>{titulo}{contador !== undefined && <> <span className="contador">{contador}</span></>}</h2>{ayuda && <div className="etiq-periodo">{ayuda}</div>}</div>
        {accion}
      </div>
      {children}
    </section>
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

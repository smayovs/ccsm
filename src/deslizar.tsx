// Fila que se desliza para mostrar acciones, como en Mail: a la izquierda descubre la acción de la derecha y viceversa.
// El dedo mueve la fila directo (sin animar); al soltar se abre si pasó del umbral o fue un movimiento rápido.
// Las mismas acciones siguen disponibles dentro del movimiento, así que no depende de este gesto.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type AccionDeslizar = { etiqueta: ReactNode; clase?: string; alTocar: () => void };

const ANCHO = 92;          // lo que se abre para mostrar la acción
const UMBRAL = 64;         // distancia para dejarla abierta al soltar
const VELOCIDAD = 0.45;    // px/ms: un movimiento rápido la abre aunque sea corto
const EVENTO = "ccsm-desliza-abre";

export function FilaDeslizable({ children, izquierda, derecha }: { children: ReactNode; izquierda?: AccionDeslizar; derecha?: AccionDeslizar }) {
  const id = useId();
  const [dx, setDx] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const inicio = useRef<{ x: number; y: number; t: number; base: number; decidido: boolean | null; id: number; ultimoX: number; ultimoT: number } | null>(null);
  const movio = useRef(false);

  // Solo una fila abierta a la vez
  useEffect(() => {
    const otra = (e: Event) => { if ((e as CustomEvent).detail !== id) setDx(0); };
    window.addEventListener(EVENTO, otra);
    return () => window.removeEventListener(EVENTO, otra);
  }, [id]);

  const limitar = (v: number) => {
    const max = izquierda ? ANCHO : 0, min = derecha ? -ANCHO : 0;
    // Más allá de lo permitido se resiste en lugar de frenar en seco
    if (v > max) return max + (v - max) * 0.2;
    if (v < min) return min + (v - min) * 0.2;
    return v;
  };

  function abajo(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (inicio.current) return; // ignora un segundo dedo
    inicio.current = { x: e.clientX, y: e.clientY, t: performance.now(), base: dx, decidido: null, id: e.pointerId, ultimoX: e.clientX, ultimoT: performance.now() };
    movio.current = false;
  }
  function mueve(e: React.PointerEvent) {
    const s = inicio.current; if (!s || e.pointerId !== s.id) return;
    const ddx = e.clientX - s.x, ddy = e.clientY - s.y;
    if (s.decidido === null) {
      if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return;
      s.decidido = Math.abs(ddx) > Math.abs(ddy); // horizontal: desliza; vertical: deja hacer scroll
      if (!s.decidido) { inicio.current = null; return; }
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* el puntero ya no existe */ }
      setArrastrando(true);
      window.dispatchEvent(new CustomEvent(EVENTO, { detail: id }));
    }
    movio.current = true;
    s.ultimoX = e.clientX; s.ultimoT = performance.now();
    setDx(limitar(s.base + ddx));
  }
  // Al soltar se usa la última posición del dedo: pointercancel (y algunos pointerup) llegan con la posición en 0
  function suelta() {
    const s = inicio.current; inicio.current = null;
    if (!s || !s.decidido) return;
    setArrastrando(false);
    const v = (s.ultimoX - s.x) / Math.max(1, s.ultimoT - s.t);
    const final = s.base + (s.ultimoX - s.x);
    if (izquierda && (final > UMBRAL || (v > VELOCIDAD && final > 0))) setDx(ANCHO);
    else if (derecha && (final < -UMBRAL || (v < -VELOCIDAD && final < 0))) setDx(-ANCHO);
    else setDx(0);
  }

  return (
    <div className="desliza">
      {izquierda && <button type="button" className={"desliza-accion izq " + (izquierda.clase ?? "")} tabIndex={dx > 0 ? 0 : -1} aria-hidden={dx <= 0}
        onClick={() => { setDx(0); izquierda.alTocar(); }}>{izquierda.etiqueta}</button>}
      {derecha && <button type="button" className={"desliza-accion der " + (derecha.clase ?? "")} tabIndex={dx < 0 ? 0 : -1} aria-hidden={dx >= 0}
        onClick={derecha.alTocar}>{derecha.etiqueta}</button>}
      <div className={"desliza-frente" + (arrastrando ? " arrastrando" : "")} style={{ transform: `translateX(${dx}px)` }}
        onPointerDown={abajo} onPointerMove={mueve} onPointerUp={suelta} onPointerCancel={suelta}
        // Tras deslizar, o con la fila abierta, el toque cierra en lugar de abrir el movimiento
        onClickCapture={(e) => { if (movio.current || dx !== 0) { e.preventDefault(); e.stopPropagation(); movio.current = false; setDx(0); } }}>
        {children}
      </div>
    </div>
  );
}

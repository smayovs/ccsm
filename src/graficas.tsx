import { useEffect, useRef, useState } from "react";
import { fmt } from "./util";

const compacto = (n: number) =>
  Math.abs(n) >= 1000 ? `$${(n / 1000).toLocaleString("es-MX", { maximumFractionDigits: n >= 10000 ? 0 : 1 })}k` : `$${Math.round(n)}`;

// Anillo de presupuesto: cuánto llevas gastado y una marca de cuánto del mes ha pasado
export function Anillo({ usado, avance, tam = 128 }: { usado: number; avance: number; tam?: number }) {
  const r = 52, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, usado));
  const estado = usado > 1 ? "exceso" : usado > avance + 0.05 ? "rapido" : "ok";
  const ang = avance * 2 * Math.PI - Math.PI / 2;
  const mx = 60 + Math.cos(ang) * r, my = 60 + Math.sin(ang) * r;
  return (
    <svg className={"anillo " + estado} width={tam} height={tam} viewBox="0 0 120 120" role="img"
      aria-label={`Has usado ${Math.round(usado * 100)}% del presupuesto; ha pasado ${Math.round(avance * 100)}% del mes`}>
      <circle cx="60" cy="60" r={r} className="pista" />
      <circle cx="60" cy="60" r={r} className="lleno" strokeDasharray={`${p * c} ${c}`} transform="rotate(-90 60 60)" />
      <circle cx={mx} cy={my} r="4.5" className="marca" />
      <text x="60" y="58" textAnchor="middle" className="pct">{Math.round(usado * 100)}%</text>
      <text x="60" y="76" textAnchor="middle" className="leyenda">usado</text>
    </svg>
  );
}

export function useAnchoExport<T extends HTMLElement>() { return useAncho<T>(); }
function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(340);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(240, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho] as const;
}

// Gasto acumulado del mes contra el ritmo que permite el presupuesto, con proyección al cierre
export function RitmoGasto({ diario, dias, hoy, presupuesto, mesTxt }: {
  diario: Record<number, number>; dias: number; hoy: number; presupuesto: number; mesTxt: string;
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  const alto = 170, iz = 40, de = 12, ar = 12, ab = 24;
  const acum: number[] = [];
  let s = 0;
  for (let d = 1; d <= dias; d++) { s += diario[d] ?? 0; acum.push(s); }
  const gastado = acum[hoy - 1] ?? 0;
  const proy = hoy > 0 ? (gastado / hoy) * dias : 0;
  const maxY = Math.max(presupuesto, proy, gastado, 1) * 1.08;
  const x = (d: number) => iz + ((d - 1) / Math.max(1, dias - 1)) * (ancho - iz - de);
  const y = (v: number) => ar + (1 - v / maxY) * (alto - ar - ab);
  const real = acum.slice(0, hoy).map((v, i) => `${i ? "L" : "M"}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = real + `L${x(hoy).toFixed(1)},${y(0)}L${x(1)},${y(0)}Z`;
  const ticks = [0, maxY / 2, maxY].map((v) => Math.round(v / 100) * 100);
  const d = sel ?? hoy;
  const ideal = presupuesto > 0 ? (presupuesto * d) / dias : 0;

  function mover(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const dia = Math.round(((e.clientX - r.left - iz) / (ancho - iz - de)) * (dias - 1)) + 1;
    setSel(Math.max(1, Math.min(hoy, dia)));
  }

  return (
    <div ref={ref} className="grafica">
      <div className="lectura" aria-live="polite">
        <span className="dia">{d === hoy && sel === null ? "Hoy" : `${d} de ${mesTxt}`}</span>
        <span><i className="punto-serie real" />Gastado <b>{fmt(acum[d - 1] ?? 0, false)}</b></span>
        {presupuesto > 0 && <span><i className="punto-serie ideal" />Ritmo ideal <b>{fmt(ideal, false)}</b></span>}
      </div>
      <svg width={ancho} height={alto} role="img" onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setSel(null)}
        aria-label={`Gasto acumulado ${fmt(gastado, false)} al día ${hoy}; proyección al cierre ${fmt(proy, false)}${presupuesto ? ` contra presupuesto de ${fmt(presupuesto, false)}` : ""}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={iz} x2={ancho - de} y1={y(t)} y2={y(t)} className="rejilla" />
            <text x={iz - 6} y={y(t) + 4} textAnchor="end" className="eje">{compacto(t)}</text>
          </g>
        ))}
        {[1, Math.ceil(dias / 2), dias].map((t) => <text key={t} x={x(t)} y={alto - 6} textAnchor="middle" className="eje">{t}</text>)}
        {presupuesto > 0 && (
          <>
            <line x1={x(1)} y1={y(presupuesto / dias)} x2={x(dias)} y2={y(presupuesto)} className="linea-ideal" />
            <line x1={iz} x2={ancho - de} y1={y(presupuesto)} y2={y(presupuesto)} className="linea-tope" />
            <text x={ancho - de} y={y(presupuesto) - 5} textAnchor="end" className="eje fuerte">Presupuesto {compacto(presupuesto)}</text>
          </>
        )}
        {hoy < dias && hoy > 0 && <line x1={x(hoy)} y1={y(gastado)} x2={x(dias)} y2={y(proy)} className="linea-proy" />}
        <path d={area} className="area-real" />
        <path d={real} className="linea-real" />
        <line x1={x(d)} x2={x(d)} y1={ar} y2={alto - ab} className="guia" />
        <circle cx={x(d)} cy={y(acum[d - 1] ?? 0)} r="5" className="punto-real" />
      </svg>
      <div className="leyenda-serie">
        <span><i className="punto-serie real" />Gastado</span>
        {presupuesto > 0 && <span><i className="punto-serie ideal" />Ritmo ideal</span>}
        <span><i className="punto-serie proy" />A este ritmo: {fmt(proy, false)} al cierre</span>
      </div>
    </div>
  );
}

// Dos barras en la misma escala: lo que tienes contra lo que ya está comprometido
export function BarrasFlujo({ tienes, tarjetas, porGastar }: { tienes: number; tarjetas: number; porGastar: number }) {
  // porGastar = pagos de préstamos del mes que faltan
  const comprometido = tarjetas + porGastar;
  const max = Math.max(tienes, comprometido, 1);
  const pc = (v: number) => `${(Math.max(0, v) / max) * 100}%`;
  return (
    <div className="flujo-barras" role="img" aria-label={`Tienes ${fmt(tienes, false)}; comprometido ${fmt(comprometido, false)}`}>
      <div className="fb-fila">
        <div className="fb-et">Tienes</div>
        <div className="fb-riel"><span className="seg tienes" style={{ width: pc(tienes) }} /></div>
        <div className="fb-v">{fmt(tienes, false)}</div>
      </div>
      <div className="fb-fila">
        <div className="fb-et">Por cubrir</div>
        <div className="fb-riel">
          <span className="seg tarjetas" style={{ width: pc(tarjetas) }} />
          <span className="seg gastar" style={{ width: pc(porGastar) }} />
        </div>
        <div className="fb-v">{fmt(comprometido, false)}</div>
      </div>
      <div className="leyenda-serie">
        <span><i className="punto-serie tarjetas" />Pagos de tarjeta {fmt(tarjetas, false)}</span>
        {porGastar > 0 && <span><i className="punto-serie gastar" />Pagos de préstamos {fmt(porGastar, false)}</span>}
      </div>
    </div>
  );
}

// Gasto por mes: barras de un solo color con línea de promedio
export function BarrasMes({ datos, promedio, proyeccion = false, serie = "Gastado" }: {
  datos: { mes: string; etiqueta: string; monto: number }[]; promedio: number; proyeccion?: boolean; serie?: string;
}) {
  const [ref, ancho] = useAnchoExport<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  const alto = 170, iz = 40, de = 8, ar = 12, ab = 22;
  const max = Math.max(1, ...datos.map((d) => d.monto), promedio) * 1.1;
  const n = Math.max(1, datos.length);
  const paso = (ancho - iz - de) / n;
  const w = Math.max(6, Math.min(36, paso - 6));
  const y = (v: number) => ar + (1 - v / max) * (alto - ar - ab);
  const i = sel ?? (proyeccion ? 0 : datos.length - 1);
  const d = datos[i];
  return (
    <div ref={ref} className="grafica">
      <div className="lectura" aria-live="polite">
        {d && <><span className="dia">{d.etiqueta}</span><span><i className="punto-serie real" />{serie} <b>{fmt(d.monto, false)}</b></span>
          <span>{proyeccion ? (i === 0 ? "este mes" : datos[0].monto > 0 ? `${d.monto <= datos[0].monto ? "−" : "+"}${fmt(Math.abs(datos[0].monto - d.monto), false)} vs. este mes` : "") : i === datos.length - 1 ? "mes en curso" : promedio > 0 ? `${d.monto >= promedio ? "+" : "−"}${Math.round(Math.abs(d.monto / promedio - 1) * 100)}% vs. promedio` : ""}</span></>}
      </div>
      <svg width={ancho} height={alto} role="img" aria-label={`Gasto por mes; promedio ${fmt(promedio, false)}`} onPointerLeave={() => setSel(null)}>
        {[0, max / 2].map((t) => (
          <g key={t}><line x1={iz} x2={ancho - de} y1={y(t)} y2={y(t)} className="rejilla" />
            <text x={iz - 6} y={y(t) + 4} textAnchor="end" className="eje">{compacto(t)}</text></g>
        ))}
        {datos.map((b, k) => {
          const x = iz + paso * k + (paso - w) / 2;
          return (
            <g key={b.mes} onPointerEnter={() => setSel(k)} onPointerDown={() => setSel(k)}>
              <rect x={iz + paso * k} y={ar} width={paso} height={alto - ar - ab} fill="transparent" />
              <path className={"barra-mes" + (k === i ? " activa" : "")}
                d={`M${x},${y(0)} V${y(b.monto) + 4} q0,-4 4,-4 h${w - 8} q4,0 4,4 V${y(0)} Z`} style={{ display: b.monto > 0 ? undefined : "none" }} />
              {(n <= 6 || k % 2 === (n - 1) % 2) && <text x={x + w / 2} y={alto - 6} textAnchor="middle" className="eje">{b.etiqueta.slice(0, 3)}</text>}
            </g>
          );
        })}
        {promedio > 0 && <>
          <line x1={iz} x2={ancho - de} y1={y(promedio)} y2={y(promedio)} className="linea-ideal" />
          <text x={ancho - de} y={y(promedio) - 5} textAnchor="end" className="eje fuerte">Promedio {compacto(promedio)}</text>
        </>}
      </svg>
    </div>
  );
}

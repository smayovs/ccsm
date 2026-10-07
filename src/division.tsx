import { useApp } from "./contexto";
import { Segmentos } from "./ui";
import { fmt, limpiarMonto } from "./util";

export type Division = { activa: boolean; seleccion: string[]; modo: "iguales" | "montos"; conmigo: boolean; montos: Record<string, string> };
export const divisionVacia: Division = { activa: false, seleccion: [], modo: "iguales", conmigo: true, montos: {} };

// Partes de cada persona según la división elegida
export function partesDe(d: Division, total: number) {
  if (!d.activa) return [];
  const cuota = Math.floor((total / Math.max(1, d.seleccion.length + (d.conmigo ? 1 : 0))) * 100) / 100;
  return d.seleccion.map((f) => ({ familiar_id: f, monto: d.modo === "iguales" ? cuota : Number(d.montos[f] || 0) }));
}

export function SelectorDivision({ d, onCambio, total, nota }: { d: Division; onCambio: (d: Division) => void; total: number; nota?: string }) {
  const { familiares } = useApp();
  const partes = partesDe(d, total);
  const suma = partes.reduce((a, x) => a + x.monto, 0);
  const cuota = partes[0]?.monto ?? 0;
  const nombre = (id: string) => familiares.find((x) => x.id === id)?.nombre ?? "";
  return (
    <div className="caja-dividir">
      <div className="sub" style={{ marginBottom: 8 }}>¿Entre quiénes?</div>
      <div className="chips">
        <button type="button" aria-pressed={d.conmigo} onClick={() => onCambio({ ...d, conmigo: !d.conmigo })} disabled={d.modo === "montos"}>Yo</button>
        {familiares.filter((f) => f.activo || d.seleccion.includes(f.id)).map((f) => (
          <button type="button" key={f.id} aria-pressed={d.seleccion.includes(f.id)}
            onClick={() => onCambio({ ...d, seleccion: d.seleccion.includes(f.id) ? d.seleccion.filter((x) => x !== f.id) : [...d.seleccion, f.id] })}>{f.nombre}</button>
        ))}
      </div>
      <Segmentos etiqueta="Cómo dividir" valor={d.modo} onCambio={(v) => onCambio({
        ...d, modo: v, montos: v === "montos" ? Object.fromEntries(d.seleccion.map((f) => [f, d.montos[f] || (cuota ? String(cuota) : "")])) : d.montos,
      })} opciones={[{ v: "iguales", t: "Partes iguales" }, { v: "montos", t: "Por monto" }]} />
      {d.seleccion.length > 0 && (
        <div className="lista">
          {d.seleccion.map((f) => (
            <div className="fila" key={f}>
              <div className="cuerpo"><div className="titulo">{nombre(f)}</div></div>
              {d.modo === "iguales" ? <div className="monto">{fmt(cuota)}</div>
                : <input className="monto-chico" inputMode="decimal" aria-label={`Parte de ${nombre(f)}`} value={d.montos[f] ?? ""}
                    onChange={(e) => onCambio({ ...d, montos: { ...d.montos, [f]: limpiarMonto(e.target.value) } })} placeholder="$0" />}
            </div>
          ))}
          <div className="fila"><div className="cuerpo"><div className="titulo">Tu parte</div><div className="detalle">Cuenta en tu presupuesto</div></div>
            <div className={"monto" + (total - suma < -0.01 ? " negativo" : "")}>{fmt(total - suma)}</div></div>
        </div>
      )}
      {nota && <p className="nota">{nota}</p>}
    </div>
  );
}

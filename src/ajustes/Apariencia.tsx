import { useState } from "react";
import { Check } from "lucide-react";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { olvidarPreferencias } from "../preferencias";
import { Cabeza, Segmentos } from "../ui";
import { errorTexto, fmt } from "../util";
import { Apariencia, APARIENCIA_INICIAL, aparienciaGuardada, aplicarApariencia, colorAcento, esHex, FUENTES, PALETAS, TAMANOS } from "../tema";

// Colores, modo, tipografía y tamaño de letra. Se aplica al instante y se guarda en tu cuenta.
export default function AparienciaPantalla() {
  const { uid, aviso } = useApp();
  const [a, setA] = useState<Apariencia>(aparienciaGuardada());
  const [error, setError] = useState("");

  async function cambiar(x: Partial<Apariencia>) {
    const nueva = { ...a, ...x };
    setA(nueva); setError("");
    aplicarApariencia(nueva);
    const { error } = await sb.from("preferencias").upsert({ user_id: uid, apariencia: nueva, updated_at: new Date().toISOString() });
    olvidarPreferencias(); // la próxima lectura trae lo recién guardado
    if (error) setError(errorTexto(error));
  }
  const propio = esHex(a.acento);

  return (
    <>
      <Cabeza titulo="Apariencia" volver />

      <section className="tablero muestra" aria-label="Vista previa">
        <div className="tablero-texto">
          <div className="etiqueta">Vista previa · Llevas gastado</div>
          <div className="cifra">{fmt(12480, false)}</div>
          <div className="sub">A este ritmo cerrarías el mes en <b>{fmt(19350, false)}</b>.</div>
        </div>
        <div className="tablero-trio">
          <div><div className="k">Ingresos</div><div className="v pos">{fmt(32000, false)}</div></div>
          <div><div className="k">Gastos</div><div className="v">{fmt(12480, false)}</div></div>
          <div><div className="k">Ahorro</div><div className="v">{fmt(19520, false)}</div></div>
        </div>
      </section>
      <div className="acciones" style={{ marginTop: 10 }}>
        <span className="boton" role="presentation">Botón principal</span>
        <span className="boton claro" role="presentation">Secundario</span>
      </div>

      <h2>Color</h2>
      <div className="paletas" role="radiogroup" aria-label="Paleta de color">
        {PALETAS.map((p) => {
          const activa = !propio && a.paleta === p.id;
          return (
            <button key={p.id} type="button" role="radio" aria-checked={activa} className="paleta" onClick={() => cambiar({ paleta: p.id, acento: undefined })}>
              {/* La de la marca muestra sus dos colores: rosa y gris */}
              <span className="muestra-color" style={{ background: p.id === "ccsm" ? "linear-gradient(135deg, var(--rosa) 50%, var(--gris) 50%)" : p.acento }}>{activa && <Check size={18} color={p.id === "ccsm" ? "#101217" : "#fff"} />}</span>
              <span>{p.nombre}</span>
            </button>
          );
        })}
        <label className="paleta" aria-checked={propio}>
          <span className="muestra-color propio" style={propio ? { background: a.acento } : undefined}>
            {propio && <Check size={18} color="#fff" />}
            <input type="color" aria-label="Elegir un color propio" value={colorAcento(a)} onChange={(e) => cambiar({ acento: e.target.value.toUpperCase() })} />
          </span>
          <span>Tu color</span>
        </label>
      </div>
      <p className="nota">Cambia el color de botones, enlaces, gráficas y la tarjeta principal. Los colores de ingresos (verde) y de alertas (rojo) se quedan igual para que siempre se distingan. Si eliges un color muy claro, la app lo oscurece un poco para que se lea bien.</p>

      <h2>Modo</h2>
      <Segmentos etiqueta="Modo" valor={a.modo} onCambio={(v) => cambiar({ modo: v })} opciones={[
        { v: "auto", t: "Automático" }, { v: "claro", t: "Claro" }, { v: "oscuro", t: "Oscuro" },
      ]} />
      <p className="nota" style={{ marginTop: -6 }}>Automático sigue el modo de tu iPhone.</p>

      <h2>Tipografía</h2>
      <div className="lista" role="radiogroup" aria-label="Tipografía">
        {FUENTES.map((f) => (
          <button key={f.id} type="button" role="radio" aria-checked={a.fuente === f.id} className="fila fuente-opcion" onClick={() => cambiar({ fuente: f.id })}>
            <div className="cuerpo">
              <div className="titulo" style={{ fontFamily: f.display }}>{f.nombre} · $12,480</div>
              <div className="detalle" style={{ fontFamily: f.texto }}>{f.detalle}</div>
            </div>
            {a.fuente === f.id && <Check size={20} className="positivo" aria-hidden="true" />}
          </button>
        ))}
      </div>

      <h2>Tamaño de letra</h2>
      <Segmentos etiqueta="Tamaño de letra" valor={a.tamano} onCambio={(v) => cambiar({ tamano: v })} opciones={TAMANOS.map((t) => ({ v: t.id, t: t.nombre }))} />

      {error && <p className="error" role="alert">{error}</p>}
      <p className="nota">Se guarda en tu cuenta: se ve igual en tu iPhone y en la computadora. Tu pareja tiene la suya.</p>
      <div className="acciones">
        <button className="boton claro" onClick={() => { cambiar(APARIENCIA_INICIAL); aviso("Apariencia restablecida"); }}>Restablecer</button>
      </div>
    </>
  );
}

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "../phosphor";
import { useApp } from "../contexto";
import { Cabeza, Campo, Cargando, Segmentos, useUnaVez } from "../ui";
import { errorTexto, fechaCorta, fechaLarga, fmt, hoyISO, limpiarMonto, masDias } from "../util";
import { cargarCiclo, cargarConfig, cargarMeta, ConfigInicio, configInicial, guardarCiclo, guardarConfig, guardarMeta, inicioCatorcena, type ModoMeta, SECCIONES } from "../inicio/secciones";

// Elegir qué secciones se ven en Inicio y en qué orden (se guarda en tu cuenta)
export default function PersonalizarInicio() {
  const { uid, aviso } = useApp();
  const [config, setConfig] = useState<ConfigInicio | null>(null);
  const [error, setError] = useState("");
  const [modo, setModo] = useState<ModoMeta>("ninguna");
  const [meta, setMeta] = useState("");
  const [guardada, setGuardada] = useState({ modo: "ninguna" as ModoMeta, monto: 0 });
  const unaVez = useUnaVez();
  // Periodo de pago: mes calendario o catorcena a partir de un día de pago
  const [ciclo, setCiclo] = useState<"mes" | "catorcena">("mes");
  const [ref, setRef] = useState("");
  const [cicloGuardado, setCicloGuardado] = useState("mes");
  useEffect(() => {
    cargarConfig(uid).then(setConfig);
    cargarCiclo(uid).then((c) => {
      setCiclo(c.tipo);
      if (c.tipo === "catorcena") setRef(c.ref);
      setCicloGuardado(c.tipo === "catorcena" ? c.ref : "mes");
    });
    cargarMeta(uid).then((m) => { setGuardada(m); setModo(m.modo); setMeta(m.monto ? String(m.monto) : ""); });
  }, [uid]);

  const hoy = hoyISO();
  const cicloNuevo = ciclo === "catorcena" && ref ? ref : "mes";
  const actual = ciclo === "catorcena" && ref ? inicioCatorcena(hoy, ref) : null;
  async function guardarElCiclo() {
    setError("");
    const { error } = await guardarCiclo(uid, cicloNuevo === "mes" ? { tipo: "mes" } : { tipo: "catorcena", ref: cicloNuevo });
    if (error) return setError(errorTexto(error));
    setCicloGuardado(cicloNuevo);
    aviso(cicloNuevo === "mes" ? "Inicio usa el mes calendario" : "Inicio usa tu catorcena");
  }
  const monto = Number(meta) || 0;
  // Un monto fijo vacío equivale a no tener meta
  const modoFinal: ModoMeta = modo === "fija" && !monto ? "ninguna" : modo;
  const sinCambios = modoFinal === guardada.modo && (modoFinal !== "fija" || monto === guardada.monto);
  async function guardarLaMeta() {
    setError("");
    const nueva = { modo: modoFinal, monto: modoFinal === "fija" ? monto : 0 };
    const { error } = await guardarMeta(uid, nueva);
    if (error) return setError(errorTexto(error));
    setGuardada(nueva);
    aviso(nueva.modo === "fija" ? `Meta de ${fmt(monto, false)} al mes` : nueva.modo === "ingresos" ? "Tu límite son tus ingresos del mes" : "Meta quitada");
  }

  async function cambiar(nueva: ConfigInicio) {
    setConfig(nueva); setError("");
    const { error } = await guardarConfig(uid, nueva);
    if (error) setError(errorTexto(error));
  }
  const mover = (i: number, d: number) => {
    if (!config) return;
    const j = i + d; if (j < 0 || j >= config.length) return;
    const nueva = [...config]; [nueva[i], nueva[j]] = [nueva[j], nueva[i]];
    cambiar(nueva);
  };

  if (!config) return <><Cabeza titulo="Personalizar Inicio" volver /><Cargando /></>;
  const activas = config.filter((c) => c.visible).length;

  return (
    <>
      <Cabeza titulo="Personalizar Inicio" volver />
      <section className="panel mt-0">
        <div className="campo"><span>Límite de gasto del mes</span></div>
        <Segmentos etiqueta="Límite de gasto del mes" valor={modo} onCambio={setModo} opciones={[
          { v: "ninguna", t: "Sin límite" }, { v: "ingresos", t: "Mis ingresos" }, { v: "fija", t: "Monto fijo" },
        ]} />
        {modo === "fija" && (
          <Campo etiqueta="Monto por periodo (mes o catorcena)">
            <input inputMode="decimal" placeholder="Por ejemplo 35000" value={meta} onChange={(e) => setMeta(limpiarMonto(e.target.value))} />
          </Campo>
        )}
        <p className="nota mt-n4 mb-14">{modo === "ingresos"
          ? "Tu límite es lo que entra en el periodo: sueldo, bonos y cualquier ingreso que registres, también los que tengan fecha más adelante. El resumen muestra cuánto te queda por gastar."
          : modo === "fija" ? "El resumen muestra cuánto llevas de la meta y cuánto te queda por día."
          : "El resumen solo muestra cuánto llevas gastado y a qué ritmo."}</p>
        <button className="boton chico" disabled={sinCambios} onClick={unaVez(guardarLaMeta)}>Guardar</button>
      </section>
      <section className="panel mt-14">
        <div className="campo"><span>Tu periodo</span></div>
        <Segmentos etiqueta="Tu periodo" valor={ciclo} onCambio={setCiclo} opciones={[{ v: "mes", t: "Mes calendario" }, { v: "catorcena", t: "Catorcena" }]} />
        {ciclo === "catorcena" && (
          <Campo etiqueta="Un día de pago" ayuda="Elige cualquier día en que les hayan pagado. La app cuenta de 14 en 14 días a partir de ahí.">
            <input type="date" value={ref} onChange={(e) => setRef(e.target.value)} />
          </Campo>
        )}
        <p className="nota mt-n4 mb-14">{actual
          ? <>Catorcena actual: <b>{fechaCorta(actual)} – {fechaCorta(masDias(actual, 13))}</b>. Siguiente pago: <b>{fechaLarga(masDias(actual, 14))}</b>.</>
          : ciclo === "catorcena" ? "Elige un día de pago para calcular tus catorcenas."
          : "El resumen, el límite y la proyección van del 1 al último día de cada mes."}</p>
        <button className="boton chico" disabled={cicloNuevo === cicloGuardado} onClick={unaVez(guardarElCiclo)}>Guardar</button>
      </section>
      <h2>Secciones</h2>
      <p className="nota mt-n4">Activa las secciones que quieres ver y ordénalas con las flechas. Se guarda en tu cuenta, así que se ve igual en todos tus dispositivos. Las marcadas con <span className="etiq">Filtros</span> responden al periodo, cuentas y categoría que elijas arriba en Inicio.</p>
      <div className="lista">
        {config.map((c, i) => {
          const s = SECCIONES.find((x) => x.id === c.id)!;
          return (
            <div className={"fila personalizar" + (c.visible ? "" : " apagada")} key={c.id}>
              <label className="interruptor" aria-label={`Mostrar ${s.nombre}`}>
                <input type="checkbox" checked={c.visible} onChange={(e) => cambiar(config.map((x) => (x.id === c.id ? { ...x, visible: e.target.checked } : x)))} />
                <span />
              </label>
              <div className="cuerpo">
                <div className="titulo">{s.nombre}</div>
                <div className="detalle">{s.filtrable && <span className="etiq">Filtros</span>}{s.detalle}</div>
              </div>
              <button className="boton chico claro" aria-label={`Subir ${s.nombre}`} disabled={i === 0} onClick={() => mover(i, -1)}><ArrowUp size={16} /></button>
              <button className="boton chico claro" aria-label={`Bajar ${s.nombre}`} disabled={i === config.length - 1} onClick={() => mover(i, 1)}><ArrowDown size={16} /></button>
            </div>
          );
        })}
      </div>
      <p className="nota">{activas} de {config.length} secciones activas.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button className="boton claro" onClick={() => { cambiar(configInicial()); aviso("Inicio restablecido"); }}>Restablecer</button>
      </div>
    </>
  );
}

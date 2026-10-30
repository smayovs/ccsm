import { useEffect, useState } from "react";
import { CaretDown, CaretRight, WhatsappLogo } from "../phosphor";
import { Link } from "react-router-dom";
import { useApp } from "../contexto";
import { Cabeza, Seccion, Cargando, Segmentos, SelectorMes, Interruptor } from "../ui";
import { fechaCorta, fmt, hoyISO, mesCorto, mesISO, nombreMes } from "../util";
import { antesDe, cargarCobros, enPeriodo, type Cargo, type Periodo, type Persona } from "../cobros";
import { sb } from "../supabase";
import { errorTexto } from "../util";

type Tipo = Periodo["tipo"];
const suma = (l: Cargo[]) => Math.round(l.reduce((a, c) => a + c.pendiente, 0) * 100) / 100;
// Las mensualidades (id con número de mensualidad) se muestran por mes; lo demás, por día
const cuando = (c: Cargo) => (c.id.split("|").length === 3 ? mesCorto(c.fecha) : fechaCorta(c.fecha));

export default function Cobros() {
  const { familiares, aviso } = useApp();
  const hoy = hoyISO();
  const [datos, setDatos] = useState<Record<string, Persona>>({});
  const [abierto, setAbierto] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [tipo, setTipo] = useState<Tipo>("corte");
  const [mes, setMes] = useState(mesISO(hoy));
  const [desde, setDesde] = useState(mesISO(hoy));
  const [hasta, setHasta] = useState(hoy);
  const [conAntes, setConAntes] = useState(false);
  const [verAntes, setVerAntes] = useState<string | null>(null);
  const [verMarcados, setVerMarcados] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);

  const cargar = () => cargarCobros().then((c) => { setDatos(c.personas); setCargando(false); });
  useEffect(() => { cargar(); }, []);
  async function marcar(claves: string[], pagado: boolean) {
    const r = pagado ? await sb.from("cobros_marcados").insert(claves.map((clave) => ({ clave }))) : await sb.from("cobros_marcados").delete().in("clave", claves);
    if (r.error) return aviso(errorTexto(r.error));
    aviso(pagado ? (claves.length > 1 ? `${claves.length} cargos marcados como pagados` : "Marcado como pagado") : "Vuelve a estar pendiente"); cargar();
  }

  const periodo: Periodo = tipo === "rango" ? { tipo, desde, hasta } : tipo === "venir" ? { tipo } : { tipo, mes };
  const textoPeriodo = tipo === "corte" ? `Cortes de ${nombreMes(mes)}` : tipo === "mes" ? nombreMes(mes).replace(/^./, (x) => x.toUpperCase())
    : tipo === "rango" ? `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}` : "Por venir";

  const personas = familiares.map((f) => {
    const p = datos[f.id] ?? { cargos: [], venir: [], marcados: [], total: 0, porVenir: 0, proxima: 0, pagado: 0 };
    const pendientes = [...p.cargos, ...(p.venir ?? [])];
    const del = pendientes.filter((c) => enPeriodo(c, periodo));
    const antes = pendientes.filter((c) => !enPeriodo(c, periodo) && antesDe(c, periodo));
    const marcados = p.marcados.filter((c) => enPeriodo(c, periodo));
    const cobrar = conAntes ? [...antes, ...del] : del;
    return { ...f, ...p, del, antes, marcadosP: marcados, totalDel: suma(del), totalAntes: suma(antes), cobrar, totalCobrar: suma(cobrar) };
  }).filter((p) => p.del.length || p.antes.length || p.marcadosP.length);

  function mensaje(p: (typeof personas)[number]) {
    const linea = (c: Cargo) => `• ${cuando(c)} ${c.texto}: ${fmt(c.pendiente)}${c.pendiente < c.monto ? ` (de ${fmt(c.monto)})` : ""}`;
    const encabezado = tipo === "corte" ? `lo de los cortes de ${nombreMes(mes)}` : tipo === "mes" ? `lo de ${nombreMes(mes)}`
      : tipo === "rango" ? `lo del ${fechaCorta(desde)} al ${fechaCorta(hasta)}` : "lo que viene";
    let t = `Hola ${p.nombre}, te paso ${encabezado}:\n\n${p.del.map(linea).join("\n")}`;
    if (conAntes && p.antes.length) t += `${p.del.length ? "\n\n" : ""}Pendiente de antes:\n${p.antes.map(linea).join("\n")}`;
    t += `\n\nTotal: ${fmt(p.totalCobrar)}`;
    if (tipo !== "venir" && p.proxima > 0) t += `\n\nPróxima mensualidad a meses: ${fmt(p.proxima)} (quedan ${fmt(p.porVenir)} por venir).`;
    return t;
  }

  const filaCargo = (c: Cargo) => (
    <div className="fila" key={c.id}>
      <button type="button" className="check" role="checkbox" aria-checked={false} aria-label={`Marcar ${c.texto} como pagado`}
        onClick={() => marcar([c.id], true)} />
      <Link className="fila-enlace" to={c.mov ? `/editar/${c.mov}` : "/suscripciones"}>
        <div className="cuerpo"><div className="titulo">{c.texto}</div>
          <div className="detalle">{cuando(c)}{c.futuro ? " · por venir" : ""}{c.mov ? "" : " · cargo aún no registrado"}{c.pendiente < c.monto ? ` · abonado ${fmt(c.monto - c.pendiente)}` : ""}</div></div>
        <div className="monto">{fmt(c.pendiente)}</div>
      </Link>
    </div>
  );

  const totalPeriodo = personas.reduce((a, p) => a + p.totalDel, 0);
  const totalAntes = personas.reduce((a, p) => a + p.totalAntes, 0);
  const conDeuda = personas.filter((p) => p.totalDel > 0.004).length;
  return (
    <>
      <Cabeza titulo="Cobros" volver />
      <Segmentos etiqueta="Periodo" valor={tipo} onCambio={(v) => { setTipo(v); setConfirmar(null); }} opciones={[
        { v: "corte", t: "Cortes" }, { v: "mes", t: "Mes" }, { v: "rango", t: "Fechas" }, { v: "venir", t: "Por venir" },
      ]} />
      {tipo === "corte" || tipo === "mes" ? <SelectorMes mes={mes} onCambio={setMes} /> : tipo === "rango" ? (
        <div className="dos">
          <label className="campo"><span>Desde</span><input type="date" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} /></label>
          <label className="campo"><span>Hasta</span><input type="date" value={hasta} min={desde} onChange={(e) => e.target.value && setHasta(e.target.value)} /></label>
        </div>
      ) : null}
      <p className="nota mt-n6">{tipo === "corte" ? "Lo que entra en el corte de este mes de cada tarjeta, con su día de corte. Lo que no es de tarjeta de crédito va por mes calendario."
        : tipo === "mes" ? "Lo del mes calendario, del 1 al último día. Las mensualidades cuentan en el mes de su corte."
        : tipo === "rango" ? "Lo que cae entre esas fechas. Las mensualidades cuentan en la fecha de su corte."
        : "Mensualidades que el banco aún no factura y cargos con fecha futura, por si quieres cobrarlos por adelantado."}</p>
      {cargando ? <Cargando /> : personas.length === 0 ? (
        <div className="lista"><div className="vacio">{Object.keys(datos).length ? "Nada pendiente en este periodo." : "Nadie te debe nada. Al registrar un gasto, abre «Más opciones» y elige «¿Para quién?» para que aparezca aquí."}</div></div>
      ) : <>
      <section className="tablero" aria-label="Resumen de cobros">
        <div className="etiqueta">{textoPeriodo}</div>
        <div className="cifra">{fmt(totalPeriodo, false)}</div>
        <div className="sub">{conDeuda} {conDeuda === 1 ? "persona" : "personas"}{totalAntes > 0.5 ? <> · más <b>{fmt(totalAntes, false)}</b> pendiente de antes</> : null}</div>
      </section>
      {totalAntes > 0.004 && (
        <div className="lista mb-10">
          <Interruptor titulo="Cobrar también lo de antes" detalle="Lo suma al mensaje, al pago y a «Marcar como pagado»" checked={conAntes} onCambio={setConAntes} />
        </div>
      )}
      <Seccion titulo="Por persona" contador={personas.length} ayuda="Toca a alguien para ver sus cargos del periodo. Marca la casilla de lo que ya te pagó, o usa «Registrar pago» para que el dinero entre a una cuenta">
      {personas.map((p) => (
        <div key={p.id} className="lista mb-10">
            <button className="fila" onClick={() => setAbierto(abierto === p.id ? null : p.id)} aria-expanded={abierto === p.id}>
              <span className="avatar-mini r-gris" aria-hidden="true">{p.nombre.trim().charAt(0).toUpperCase()}</span>
              <div className="cuerpo">
                <div className="titulo">{p.nombre}</div>
                <div className="detalle">
                  {p.del.length} {p.del.length === 1 ? "cargo" : "cargos"} del periodo
                  {p.totalAntes > 0.004 ? ` · ${fmt(p.totalAntes, false)} de antes` : ""}
                </div>
              </div>
              <div className={"monto " + (p.totalCobrar > 0.004 ? "negativo" : "positivo")}>{fmt(p.totalCobrar)}<small>{p.totalCobrar > 0.004 ? "a cobrar" : "al corriente"}</small></div>
              {abierto === p.id ? <CaretDown size={16} className="flecha" aria-hidden="true" /> : <CaretRight size={16} className="flecha" aria-hidden="true" />}
            </button>
            {abierto === p.id && (
              <>
                {p.del.map(filaCargo)}
                {p.antes.length > 0 && (
                  <button className="fila" onClick={() => setVerAntes(verAntes === p.id ? null : p.id)} aria-expanded={verAntes === p.id}>
                    <div className="cuerpo"><div className="detalle">{p.antes.length} {p.antes.length === 1 ? "cargo pendiente" : "cargos pendientes"} de antes · {fmt(p.totalAntes)} · {verAntes === p.id ? "ocultar" : "ver"}</div></div>
                  </button>
                )}
                {verAntes === p.id && p.antes.map(filaCargo)}
                {p.marcadosP.length > 0 && (
                  <button className="fila" onClick={() => setVerMarcados(verMarcados === p.id ? null : p.id)} aria-expanded={verMarcados === p.id}>
                    <div className="cuerpo"><div className="detalle">{p.marcadosP.length} {p.marcadosP.length === 1 ? "cargo marcado" : "cargos marcados"} como pagado · {verMarcados === p.id ? "ocultar" : "ver"}</div></div>
                  </button>
                )}
                {verMarcados === p.id && p.marcadosP.map((c) => (
                  <div className="fila marcado" key={c.id}>
                    <button type="button" className="check" role="checkbox" aria-checked={true} aria-label={`Desmarcar ${c.texto}`} onClick={() => marcar([c.id], false)} />
                    <div className="cuerpo"><div className="titulo">{c.texto}</div><div className="detalle">{cuando(c)} · pagado</div></div>
                    <div className="monto">{fmt(c.monto)}</div>
                  </div>
                ))}
                {p.pagado > 0 && <div className="fila"><div className="cuerpo"><div className="detalle">Te ha pagado {fmt(p.pagado)} en total</div></div></div>}
                {confirmar === p.id ? (
                  <div className="fila gap-8 envolver" role="group" aria-label="Confirmar">
                    <div className="cuerpo"><div className="detalle">¿Marcar {p.cobrar.length} {p.cobrar.length === 1 ? "cargo" : "cargos"} ({fmt(p.totalCobrar)}) como pagados? No registra dinero en ninguna cuenta.</div></div>
                    <button type="button" className="boton chico claro" onClick={() => setConfirmar(null)}>Cancelar</button>
                    <button type="button" className="boton chico" autoFocus onClick={() => { setConfirmar(null); marcar(p.cobrar.map((c) => c.id), true); }}>Sí, marcar</button>
                  </div>
                ) : (
                  <div className="fila gap-8 envolver">
                    {p.totalCobrar > 0.004 && <a className="boton chico" href={`https://wa.me/?text=${encodeURIComponent(mensaje(p))}`} target="_blank" rel="noreferrer"><WhatsappLogo size={18} aria-hidden="true" /> Enviar por WhatsApp</a>}
                    <Link className="boton chico claro" to={`/nuevo?tipo=reembolso&familiar=${p.id}${p.totalCobrar > 0.004 ? `&monto=${p.totalCobrar.toFixed(2)}` : ""}`}>Registrar pago</Link>
                    {p.cobrar.length > 0 && <button type="button" className="boton chico claro" onClick={() => setConfirmar(p.id)}>Marcar como pagado</button>}
                  </div>
                )}
              </>
            )}
        </div>
      ))}
      </Seccion>
      </>}
      <p className="nota mt-14">Las compras a meses se cobran por mensualidad, en el corte en que el banco las factura, salvo que en la compra elijas cobrarla completa. Los pagos que registras cubren primero lo más antiguo. Para agregar personas o cambiar su nombre: <Link to="/ajustes/familiares">Personas</Link>.</p>
    </>
  );
}

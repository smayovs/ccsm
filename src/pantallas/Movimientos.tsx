import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { cargarProgramados, fechasEn, type IngresoProgramado } from "../ingresos";
import { Link } from "react-router-dom";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza, Cargando, Segmentos, SelectorMes } from "../ui";
import { cobroEnMes, conDia, fechaCorta, fechaLarga, fmt, hoyISO, masDias, mensualidadEn, mesISO, montoMensualidad, msiAnteriores, nombreMes, sumarMes, TIPOS_MOV } from "../util";
import { ArrowsLeftRight, CalendarDots, HandCoins, Handshake, MagnifyingGlass, SlidersHorizontal } from "../phosphor";
import { IconoCategoria } from "../iconos";

export const SELECT_MOV = `*, cuenta:cuentas!movimientos_cuenta_id_fkey(nombre), destino:cuentas!movimientos_cuenta_destino_id_fkey(nombre),
  categoria:categorias!movimientos_categoria_id_fkey(nombre, icono, padre:padre_id(nombre, icono)), familiar:familiares!movimientos_familiar_id_fkey(nombre),
  repartos(user_id, modo, valor, monto, estado, nota, categoria_id), partes:partes_personas(familiar_id, monto)`;

export type Mov = any;

export function textoCategoria(m: Mov) {
  if (!m.categoria) return "";
  return m.categoria.padre ? `${m.categoria.padre.nombre} › ${m.categoria.nombre}` : m.categoria.nombre;
}

// Cómo afecta este movimiento a la persona que lo ve
export function lineaMov(m: Mov, uid: string, nombres: Record<string, string>) {
  const mio = m.creado_por === uid;
  const miParte = (m.repartos ?? []).find((r: any) => r.user_id === uid);
  const partesOtros = (m.repartos ?? []).reduce((s: number, r: any) => s + Number(r.monto), 0)
    + (m.partes ?? []).reduce((s: number, r: any) => s + Number(r.monto), 0);
  let signo = 0; let monto = Number(m.monto); let nota = "";
  if (m.tipo === "gasto") {
    signo = -1;
    if (!mio && miParte) { monto = Number(miParte.monto); nota = `Tu parte de ${fmt(m.monto)} · pagó ${nombres[m.creado_por] ?? "tu pareja"}`; }
    else if (partesOtros > 0) nota = `Tu parte ${fmt(Number(m.monto) - partesOtros)}`;
  } else if (m.tipo === "ingreso" || m.tipo === "reembolso") signo = 1;
  else if (m.tipo === "liquidacion") signo = m.liq_para === uid ? 1 : -1;
  const titulo = m.descripcion || m.comercio || textoCategoria(m) || TIPOS_MOV[m.tipo];
  const partes: string[] = [];
  if (m.tipo === "transferencia") partes.push(`${m.cuenta?.nombre ?? "?"} → ${m.destino?.nombre ?? "?"}`);
  else if (m.tipo === "liquidacion") partes.push(m.liq_para === uid ? `${nombres[m.liq_de] ?? "Tu pareja"} te pagó` : `Le pagaste a ${nombres[m.liq_para] ?? "tu pareja"}`);
  else {
    const cat = textoCategoria(m); if (cat && cat !== titulo) partes.push(cat);
    if (m.cuenta?.nombre) partes.push(m.cuenta.nombre);
  }
  return { titulo, detalle: partes.join(" · "), signo, monto, nota, mio, miParte };
}

// Fecha de corte del periodo que contiene "f" (el corte en o después de f)
const corteQueCierra = (f: string, corte: number) => { const c = conDia(mesISO(f), corte); return f <= c ? c : conDia(sumarMes(mesISO(f), 1), corte); };

type Modo = "mes" | "rango" | "corte";

export default function Movimientos() {
  const { uid, otros, yo, cuentas } = useApp();
  const hoy = hoyISO();
  // Inicio puede abrir esta pantalla con su periodo y filtros (?mes=, ?desde=&hasta=, ?cuenta=, ?filtro=, ?q=)
  const [params] = useSearchParams();
  const pDesde = params.get("desde"), pHasta = params.get("hasta"), pMes = params.get("mes");
  const [cuentaFiltro, setCuentaFiltro] = useState(params.get("cuenta") ?? "");
  const [subs, setSubs] = useState<any[]>([]);
  const [todasMsi, setTodasMsi] = useState<Mov[]>([]);
  const [modo, setModo] = useState<Modo>(pDesde && pHasta ? "rango" : "mes");
  const [mes, setMes] = useState(pMes ? mesISO(pMes) : mesISO());
  const [rDesde, setRDesde] = useState(pDesde ?? sumarMes(mesISO(), -2));
  const [rHasta, setRHasta] = useState(pHasta ?? hoy);
  const [corteFin, setCorteFin] = useState<string | null>(null);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState("");
  const [q, setQ] = useState(params.get("q") ?? "");
  // Controles secundarios plegados: el buscador detrás de la lupa y cuenta/periodo en un panel
  const [buscando, setBuscando] = useState(!!params.get("q"));
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [filtro, setFiltro] = useState<"todo" | "gasto" | "mensualidad" | "suscripcion" | "ingreso" | "compartido" | "otros">(params.get("filtro") === "gasto" ? "gasto" : "todo");

  const ordenTipo = ["credito", "debito", "ahorro", "efectivo", "inversion", "prestamo"];
  const listaCuentas = cuentas.filter((c) => c.activa || c.id === cuentaFiltro)
    .sort((a, b) => ordenTipo.indexOf(a.tipo) - ordenTipo.indexOf(b.tipo) || a.orden - b.orden);
  const cuentaSel = cuentas.find((c) => c.id === cuentaFiltro);
  const diaCorte = cuentaSel?.tipo === "credito" ? cuentaSel.dia_corte : null;
  const enCorte = modo === "corte" && !!diaCorte;
  const finCorte = enCorte ? corteFin ?? corteQueCierra(hoy, diaCorte!) : null;
  const iniCorte = finCorte ? masDias(conDia(sumarMes(mesISO(finCorte), -1), diaCorte!), 1) : null;

  // Periodo [desde, hasta) que se muestra
  const [desde, hasta] = enCorte ? [iniCorte!, masDias(finCorte!, 1)]
    : modo === "rango" ? [rDesde <= rHasta ? rDesde : rHasta, masDias(rDesde <= rHasta ? rHasta : rDesde, 1)]
    : [mes, sumarMes(mes, 1)];
  // Meses que toca el periodo (para mensualidades y suscripciones)
  const mesesPeriodo = useMemo(() => {
    if (enCorte) return [mesISO(finCorte!)];
    const r: string[] = []; for (let m = mesISO(desde); m < hasta && r.length < 60; m = sumarMes(m, 1)) r.push(m);
    return r;
  }, [desde, hasta, enCorte, finCorte]);

  useEffect(() => {
    // Si cambias de periodo antes de que llegue la respuesta, la vieja se descarta: no pisa al periodo que ves
    let vigente = true;
    setCargando(true);
    sb.from("movimientos").select(SELECT_MOV).gte("fecha", desde).lt("fecha", hasta)
      .order("fecha", { ascending: false }).order("created_at", { ascending: false }).limit(3000)
      .then(({ data, error }) => {
        if (!vigente) return;
        setMovs(data ?? []); setFallo(error ? "No se pudieron cargar los movimientos. Revisa tu conexión e intenta de nuevo." : ""); setCargando(false);
      });
    return () => { vigente = false; };
  }, [desde, hasta]);
  // Todas las compras a meses se piden una sola vez; al cambiar de periodo se eligen aquí (msiAnteriores)
  useEffect(() => {
    sb.from("movimientos").select(SELECT_MOV).eq("tipo", "gasto").not("meses_msi", "is", null)
      .then(({ data }) => setTodasMsi(data ?? []));
  }, []);
  // Ingresos programados (aún no llegan): se muestran en el periodo, marcados, y se confirman desde su pantalla
  const [ingresosProg, setIngresosProg] = useState<IngresoProgramado[]>([]);
  useEffect(() => { cargarProgramados().then(setIngresosProg, () => {}); }, []);
  // Compras a meses de antes del periodo cuya mensualidad cae dentro
  const msiPrevias = useMemo(() => msiAnteriores(todasMsi, desde), [todasMsi, desde]);
  useEffect(() => {
    sb.from("suscripciones").select("id, servicio, monto, frecuencia_meses, fecha_referencia, cuenta_id, palabra_clave, categoria_id").eq("activa", true)
      .then(({ data }) => setSubs(data ?? []));
  }, []);

  // ¿Este movimiento es el cargo de una suscripción?
  const subDe = (m: Mov) => m.tipo === "gasto" ? subs.find((s) => {
    const t = `${m.comercio ?? ""} ${m.descripcion ?? ""}`.toUpperCase();
    return (s.palabra_clave && t.includes(String(s.palabra_clave).toUpperCase())) || (m.descripcion ?? "").trim().toLowerCase() === String(s.servicio).trim().toLowerCase();
  }) : undefined;
  // Cargos de suscripciones que tocan en el periodo (de este mes en adelante) y todavía no se registran
  const programadas: Mov[] = enCorte ? [] : subs.flatMap((s) => mesesPeriodo.filter((m) => m >= mesISO()).flatMap((m) => {
    const f = cobroEnMes(s.fecha_referencia, s.frecuencia_meses, m);
    if (!f || f < desde || f >= hasta || movs.some((x) => subDe(x)?.id === s.id && mesISO(x.fecha) === m)) return [];
    return [{ id: `sub-${s.id}-${m}`, programada: true, fecha: f, tipo: "gasto", monto: s.monto, descripcion: s.servicio, cuenta_id: s.cuenta_id,
      cuenta: { nombre: cuentas.find((c) => c.id === s.cuenta_id)?.nombre }, repartos: [] }];
  }));

  const nombres = useMemo(() => Object.fromEntries([...otros, ...(yo ? [yo] : [])].map((m) => [m.user_id, m.nombre])), [otros, yo]);

  // Mensualidad k de una compra a meses en el mes "m", según el día de corte de su tarjeta (igual que el banco y el resto de la app)
  const corteDe = (cid: string | null) => cuentas.find((c) => c.id === cid)?.dia_corte ?? 31;
  const kEn = (x: Mov, m: string) => mensualidadEn(x.fecha, m, corteDe(x.cuenta_id));
  const comprasMsi = [...msiPrevias, ...movs.filter((m) => m.meses_msi && m.tipo === "gasto")];
  // Mensualidades de compras anteriores: en el modo corte, las que factura ese estado de cuenta (al día de corte)
  const cuotas: Mov[] = enCorte
    ? msiPrevias.flatMap((x) => { const k = kEn(x, mesesPeriodo[0]); return k >= 1 && k <= x.meses_msi ? [{ ...x, id: `${x.id}-${k}`, movId: x.id, msiK: k, fecha: finCorte }] : []; })
    : mesesPeriodo.flatMap((m) => comprasMsi.flatMap((x) => {
      if (x.fecha >= m) return [];
      const k = kEn(x, m);
      const f = conDia(m, Number(x.fecha.slice(8, 10)));
      if (k < 1 || k > x.meses_msi || f < desde || f >= hasta) return [];
      return [{ ...x, id: `${x.id}-${k}`, movId: x.id, msiK: k, fecha: f }];
    }));
  const propios = movs.map((m) => (m.meses_msi && m.tipo === "gasto"
    ? { ...m, movId: m.id, msiK: kEn(m, enCorte ? mesesPeriodo[0] : mesISO(m.fecha)), compra: true } : m));
  const ingresosEsperados: Mov[] = enCorte ? [] : ingresosProg.flatMap((p) => fechasEn(p, desde, hasta).map((f, i) => ({
    id: `ip-${p.id}-${f}`, programada: true, ipId: p.id, siguiente: i > 0, fecha: f, tipo: "ingreso", monto: p.monto, descripcion: p.descripcion,
    cuenta_id: p.cuenta_id, cuenta: { nombre: cuentas.find((c) => c.id === p.cuenta_id)?.nombre }, repartos: [],
  })));
  const filtrados = [...propios, ...cuotas, ...programadas, ...ingresosEsperados].sort((a, b) => b.fecha.localeCompare(a.fecha)).filter((m) => {
    if (cuentaFiltro && m.cuenta_id !== cuentaFiltro && m.cuenta_destino_id !== cuentaFiltro) return false;
    const esSub = (m.programada && !m.ipId) || !!subDe(m);
    if (filtro === "gasto" && (m.tipo !== "gasto" || m.movId || esSub)) return false;
    if (filtro === "mensualidad" && !(m.msiK >= 1)) return false;
    if (filtro === "suscripcion" && !esSub) return false;
    if (filtro === "ingreso" && !["ingreso", "reembolso"].includes(m.tipo)) return false;
    if (filtro === "compartido" && !(m.repartos?.length)) return false;
    if (filtro === "otros" && !["transferencia", "liquidacion"].includes(m.tipo)) return false;
    if (q) {
      const t = `${m.descripcion ?? ""} ${m.comercio ?? ""} ${textoCategoria(m)} ${m.cuenta?.nombre ?? ""} ${m.familiar?.nombre ?? ""}`.toLowerCase();
      if (!t.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  // Lo mismo que se ve en cada fila: tu parte y, si es a meses, la mensualidad
  const montoMostrado = (m: Mov) => { const v = lineaMov(m, uid, nombres).monto; return m.movId ? v / m.meses_msi : v; };
  const grupos: [string, Mov[]][] = [];
  for (const m of filtrados) {
    const g = grupos.find((x) => x[0] === m.fecha);
    if (g) g[1].push(m); else grupos.push([m.fecha, [m]]);
  }
  // Resumen del estado de cuenta (montos completos, como los cobra el banco)
  const cargos = enCorte ? filtrados.filter((m) => m.tipo === "gasto" && !m.programada && !(m.movId && m.msiK < 1) && m.cuenta_id === cuentaFiltro)
    .reduce((a, m) => a + (m.movId ? montoMensualidad(Number(m.monto), m.meses_msi, m.msiK) : Number(m.monto)), 0) : 0;
  const abonos = enCorte ? filtrados.filter((m) => (m.cuenta_destino_id === cuentaFiltro && ["transferencia", "liquidacion"].includes(m.tipo))
    || (m.cuenta_id === cuentaFiltro && ["ingreso", "reembolso"].includes(m.tipo))).reduce((a, m) => a + Number(m.monto), 0) : 0;
  const textoPeriodo = enCorte ? `${fechaCorta(iniCorte!)} – ${fechaCorta(finCorte!)}` : modo === "rango" ? `${fechaCorta(desde)} – ${fechaCorta(masDias(hasta, -1))}` : nombreMes(mes);
  const elegirCuenta = (id: string) => {
    setCuentaFiltro(id);
    const c = cuentas.find((x) => x.id === id);
    if (modo === "corte" && !(c?.tipo === "credito" && c.dia_corte)) setModo("mes");
    setCorteFin(null);
  };
  const preset = (d: string, h: string) => { setRDesde(d); setRHasta(h); };
  // Lo que suma cada fila tal como se ve (tu parte; las mensualidades por su parte). No cuentan los programados
  // ni las compras a meses cuya primera mensualidad cae el mes siguiente.
  const valor = (m: Mov) => (m.programada || (m.movId && m.msiK < 1) ? 0 : lineaMov(m, uid, nombres).signo * montoMostrado(m));
  const entro = filtrados.reduce((a, m) => a + Math.max(0, valor(m)), 0);
  const salio = filtrados.reduce((a, m) => a + Math.max(0, -valor(m)), 0);
  const nomCuenta = cuentas.find((c) => c.id === cuentaFiltro)?.nombre;
  const resumenFiltros = [nomCuenta ?? "Todas las cuentas", enCorte ? "Periodo de corte" : modo === "rango" ? "Por fechas" : "Por mes"];
  const conFiltros = !!cuentaFiltro || modo !== "mes";

  return (
    <>
      <Cabeza titulo="Movimientos" accion={
        <button className="boton-icono" aria-label={buscando ? "Cerrar búsqueda" : "Buscar movimientos"} aria-expanded={buscando}
          onClick={() => { if (buscando) setQ(""); setBuscando(!buscando); }}><MagnifyingGlass size={22} /></button>
      } />
      {buscando && <input className="buscador" type="search" autoFocus aria-label="Buscar movimientos" placeholder="Buscar comercio, categoría, cuenta…" value={q} onChange={(e) => setQ(e.target.value)} />}
      <div className="filtros-inicio">
        <button type="button" className={"filtros-resumen" + (conFiltros ? " activos" : "")} aria-expanded={filtrosAbiertos} onClick={() => setFiltrosAbiertos(!filtrosAbiertos)}>
          <SlidersHorizontal size={16} aria-hidden="true" />
          <span>{resumenFiltros[0]}</span><span className="sep">·</span><span>{resumenFiltros[1]}</span>
        </button>
        {filtrosAbiertos && (
          <div className="filtros-panel">
            <div className="sub">Cuenta</div>
            <div className="chips-filtro">
              <button type="button" aria-pressed={!cuentaFiltro} onClick={() => elegirCuenta("")}>Todas</button>
              {listaCuentas.map((c) => <button type="button" key={c.id} aria-pressed={cuentaFiltro === c.id} onClick={() => elegirCuenta(c.id)}>{c.nombre}</button>)}
            </div>
            <div className="sub">Periodo</div>
            <Segmentos etiqueta="Periodo" valor={enCorte ? "corte" : modo === "corte" ? "mes" : modo} onCambio={(v) => { setModo(v); setCorteFin(null); }} opciones={[
              { v: "mes", t: "Por mes" }, { v: "rango", t: "Por fechas" }, ...(diaCorte ? [{ v: "corte" as const, t: "Periodo de corte" }] : []),
            ]} />
            {!diaCorte && <p className="nota mt-n6">Elige una tarjeta de crédito para ver sus periodos de corte.</p>}
          </div>
        )}
      </div>
      {enCorte ? (
        <>
          <div className="selector-mes">
            <button onClick={() => setCorteFin(conDia(sumarMes(mesISO(finCorte!), -1), diaCorte!))} aria-label="Periodo anterior">‹</button>
            <span>{textoPeriodo}</span>
            <button onClick={() => setCorteFin(conDia(sumarMes(mesISO(finCorte!), 1), diaCorte!))} aria-label="Periodo siguiente">›</button>
          </div>
          <p className="nota mt-n6">{finCorte! >= hoy ? `Periodo abierto: cierra el ${fechaLarga(finCorte!)}.` : `Estado de cuenta con corte el ${fechaLarga(finCorte!)}.`} Incluye las mensualidades que se facturan en ese corte.</p>
        </>
      ) : modo === "rango" ? (
        <>
          <div className="dos">
            <label className="campo"><span>Desde</span><input type="date" value={rDesde} max={rHasta} onChange={(e) => e.target.value && setRDesde(e.target.value)} /></label>
            <label className="campo"><span>Hasta</span><input type="date" value={rHasta} min={rDesde} onChange={(e) => e.target.value && setRHasta(e.target.value)} /></label>
          </div>
          <div className="chips mt-n6 mb-12">
            <button className="boton chico claro" onClick={() => preset(masDias(hoy, -6), hoy)}>7 días</button>
            <button className="boton chico claro" onClick={() => preset(masDias(hoy, -29), hoy)}>30 días</button>
            <button className="boton chico claro" onClick={() => preset(sumarMes(mesISO(), -2), hoy)}>3 meses</button>
            <button className="boton chico claro" onClick={() => preset(sumarMes(mesISO(), -5), hoy)}>6 meses</button>
            <button className="boton chico claro" onClick={() => preset(`${hoy.slice(0, 4)}-01-01`, hoy)}>Este año</button>
          </div>
        </>
      ) : <SelectorMes mes={mes} onCambio={setMes} />}
      <div className="filtros-desliza"><Segmentos etiqueta="Filtrar" valor={filtro} onCambio={setFiltro} opciones={[
        { v: "todo", t: "Todo" }, { v: "gasto", t: "Gastos" }, { v: "mensualidad", t: "Mensualidades" }, { v: "suscripcion", t: "Suscripciones" }, { v: "ingreso", t: "Ingresos" },
        ...(otros.length ? [{ v: "compartido" as const, t: "Compartidos" }] : []), { v: "otros", t: "Transferencias" },
      ]} /></div>
      {enCorte && !cargando && (
        <div className="trio mt-0 mb-14">
          <div><div className="k">Cargos del periodo</div><div className="v">{fmt(cargos, false)}</div></div>
          <div><div className="k">Pagos y abonos</div><div className="v positivo">{fmt(abonos, false)}</div></div>
          <div><div className="k">Movimientos</div><div className="v">{filtrados.length}</div></div>
        </div>
      )}
      {!enCorte && !cargando && grupos.length > 0 && (
        <div className="trio mt-0 mb-4" aria-label={`Resumen de ${textoPeriodo}`}>
          <div><div className="k">Entró</div><div className="v positivo">{fmt(entro, false)}</div></div>
          <div><div className="k">Salió</div><div className="v">{fmt(salio, false)}</div></div>
          <div><div className="k">Neto</div><div className={"v " + (entro - salio < 0 ? "negativo" : "")}>{entro - salio < 0 ? "−" : ""}{fmt(Math.abs(entro - salio), false)}</div></div>
        </div>
      )}
      {!enCorte && !cargando && grupos.length > 0 && <p className="nota mt-0 mb-8">Tu parte de cada movimiento{filtro !== "todo" || q || cuentaFiltro ? ", con los filtros elegidos" : ""}. Los programados no cuentan hasta que llegan.</p>}
      {cargando ? <Cargando /> : fallo ? <p className="error" role="alert">{fallo}</p> : grupos.length === 0 ? (
        <div className="lista"><div className="vacio">{cuentaFiltro ? "Nada en esta cuenta en este periodo." : "Nada registrado en este periodo."} <Link to="/nuevo">Agrega un movimiento</Link>.</div></div>
      ) : grupos.map(([fecha, lista]) => (
        <section key={fecha}>
          <div className="fecha-grupo">
            <span>{fechaLarga(fecha)}{enCorte && fecha === finCorte && lista.some((m) => m.movId && !m.compra) ? " · corte" : ""}</span>
            {(() => { const t = lista.reduce((a, m) => a + valor(m), 0); return Math.abs(t) >= 0.005 ? <span className={"num" + (t > 0 ? " positivo" : "")}>{t > 0 ? "+" : "−"}{fmt(Math.abs(t))}</span> : null; })()}
          </div>
          <div className="lista">
            {lista.map((m) => {
              if (m.ipId) return (
                <Link className="fila programada" key={m.id} to={`/ingreso-programado/${m.ipId}`}>
                  <span className="ico cuenta-ahorro" aria-hidden="true"><CalendarDots size={20} /></span>
                  <div className="cuerpo">
                    <div className="titulo">{m.descripcion}</div>
                    <div className="detalle"><span className="etiq verde">Programado</span>Ingreso aproximado{m.cuenta?.nombre ? ` · ${m.cuenta.nombre}` : ""}{m.siguiente ? " · se repite" : m.fecha <= hoy ? " · confírmalo" : ""}</div>
                  </div>
                  <div className="monto positivo">+~{fmt(m.monto)}</div>
                </Link>
              );
              if (m.programada) return (
                <Link className="fila programada" key={m.id} to="/suscripciones">
                  <span className="ico" aria-hidden="true"><CalendarDots size={20} /></span>
                  <div className="cuerpo">
                    <div className="titulo">{m.descripcion}</div>
                    <div className="detalle"><span className="etiq">Programada</span>Suscripción{m.cuenta?.nombre ? ` · ${m.cuenta.nombre}` : ""}{m.fecha < hoy ? " · no ha llegado" : ""}</div>
                  </div>
                  <div className="monto">−{fmt(m.monto)}</div>
                </Link>
              );
              const l = lineaMov(m, uid, nombres);
              if (m.movId) l.monto = l.monto / m.meses_msi;
              const editable = m.tipo !== "liquidacion" && (l.mio || l.miParte);
              const Fila: any = editable ? Link : "div";
              const disputa = (m.repartos ?? []).some((r: any) => r.estado === "disputa");
              return (
                <Fila className={"fila" + (m.movId && !m.compra ? " cuota" : "")} key={m.id} {...(editable ? { to: `/editar/${m.movId ?? m.id}` } : {})}>
                  <IconoMov m={m} />
                  <div className="cuerpo">
                    <div className="titulo">{l.titulo}</div>
                    <div className="detalle">
                      {m.revisar && <span className="etiq roja">Por revisar</span>}
                      {disputa && <span className="etiq roja">En disputa</span>}
                      {m.movId ? (m.msiK >= 1 ? <span className="etiq">Mensualidad {m.msiK} de {m.meses_msi}</span>
                        : <span className="etiq">{m.meses_msi} MSI · 1ª mensualidad el próximo mes</span>) : null}
                      {m.tipo === "gasto" && (!m.movId || m.compra) && (m.fecha_compra || m.fecha > hoy) && <span className="etiq">Aplazado{m.fecha_compra ? ` · compra ${fechaCorta(m.fecha_compra)}` : ""}</span>}
                      {subDe(m) && <span className="etiq">Suscripción</span>}
                      {(m.repartos?.length > 0) && <span className="etiq verde">Compartido</span>}
                      {(m.partes?.length > 0) && <span className="etiq">Dividido</span>}
                      {m.familiar && <span className="etiq">{m.familiar.nombre}</span>}
                      {m.movId ? `Compra de ${fmt(m.monto)}${!m.compra ? ` del ${fechaCorta(comprasMsi.find((x) => x.id === m.movId)?.fecha ?? m.fecha)}` : ""}${m.cuenta?.nombre ? ` · ${m.cuenta.nombre}` : ""}` : (l.nota || l.detalle)}
                    </div>
                  </div>
                  <div className={"monto " + (l.signo > 0 ? "positivo" : "")}>
                    {l.signo > 0 ? "+" : l.signo < 0 ? "−" : ""}{fmt(l.monto)}
                  </div>
                </Fila>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

export function IconoMov({ m }: { m: Mov }) {
  if (m.tipo === "transferencia") return <span className="ico" aria-hidden="true"><ArrowsLeftRight size={20} /></span>;
  if (m.tipo === "liquidacion") return <span className="ico" aria-hidden="true"><Handshake size={20} /></span>;
  if (m.tipo === "reembolso") return <span className="ico cuenta-ahorro" aria-hidden="true"><HandCoins size={20} /></span>;
  const c = m.categoria;
  if (!c) return <IconoCategoria nombre={m.tipo === "ingreso" ? "Ingreso" : "Otros"} />;
  return <IconoCategoria nombre={c.padre?.nombre ?? c.nombre} icono={c.padre ? c.padre.icono : c.icono} />;
}

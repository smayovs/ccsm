import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, CalendarDots, CaretRight, CreditCard, Eye, EyeSlash, GearSix, Handshake, Receipt, Repeat, SquaresFour, Tray, UsersThree } from "../phosphor";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { diasEntre, fechaCorta, fmt, hoyISO, masDias, mesCorto, mesISO, nombreMes, proximoCobro } from "../util";
import { IconoCategoria, IconoCuenta } from "../iconos";
import { Anillo, RitmoGasto } from "../graficas";
import { agruparCategorias, DesgloseCategorias } from "../desglose";
import { cargarMsi, CompraMsi, proyeccionMsi } from "../msi";
import { cargarCobros, deudasDe, type Origen, Persona } from "../cobros";
import { cargarCiclo, cargarConfig, cargarMeta, ConfigInicio, filtrosElegidos, fijarCatorcena, type Meta, configInicial, Filtros, Gasto, IdSeccion, leerFiltros, pasaFiltro, rango, recordarFiltros, SECCIONES } from "../inicio/secciones";
import { BarraFiltros, textoPeriodo } from "../inicio/Filtros";
import { guardarCache, leerCache } from "../cache";

type Saldo = { id: string; nombre: string; tipo: string; mia: boolean; conjunta: boolean; propietario_nombre: string | null;
  saldo: number; limite_credito: number | null; proximo_pago: string | null; dia_pago: number | null; msi_por_facturar: number; activa: boolean };
type Tarjeta = { id: string; falta: number; fecha_pago: string | null; pagado_mes: number; estimado: boolean };
type Sub = { id: string; servicio: string; monto: number; frecuencia_meses: number; fecha_referencia: string | null; cuenta_id: string | null; palabra_clave: string | null };
type Balance = { nombre: string; me_debe: number };
type Parte = { user_id: string; nombre: string; color: "rosa" | "gris" | null; es_yo: boolean; parte: number };
type Tablero = { saldos: Saldo[]; porRevisar: number; tarjetas: Record<string, Tarjeta>;
  balance: Balance[]; subs: Sub[]; msi: CompraMsi[]; msiIds: string[]; personas: Record<string, Persona>; cuando: number };

const n = (x: unknown) => Number(x ?? 0);
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
// Misma regla que Movimientos y Cobros para saber si un gasto es el cargo de una suscripción
const esDeSub = (texto: string, s: Sub) => {
  const t = texto.toUpperCase();
  return (!!s.palabra_clave && t.includes(s.palabra_clave.toUpperCase())) || texto.trim().toLowerCase() === s.servicio.trim().toLowerCase();
};
// "Actualizado hace 3 min" a partir de la hora de la última carga completa
const haceCuanto = (t: number) => {
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return "Actualizado hace un momento";
  if (min < 60) return `Actualizado hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `Actualizado hace ${h} h` : `Actualizado el ${fechaCorta(new Date(t).toISOString().slice(0, 10))}`;
};
// Lo que Inicio muestra de una tarjeta a partir de su detalle_cuenta
const tarjetaDesde = (id: string, d: any): Tarjeta => ({
  id, falta: Math.max(0, n(d.pago_corte) - n(d.pagado_desde_corte)), fecha_pago: d.fecha_pago ?? null,
  pagado_mes: n(d.mes_entradas) + n(d.mes_ingresos), estimado: d.ultimo_corte ? !d.corte_conocido && !d.pago_manual : false,
});

// Una sola pantalla con dos vistas que comparten los datos:
// - "inicio": resumen fijo de cada módulo (Gastos, Suscripciones, Meses), Esta semana, Quién te debe y Hogar
// - "gastos": la pestaña Gastos, con filtros y secciones que se personalizan
// onPendientes: el aviso de pendientes usa el mismo resumen del mes, sin pedirlo otra vez
export default function Inicio({ vista, onPendientes }: { vista: "inicio" | "gastos"; onPendientes?: (n: number) => void }) {
  const enInicio = vista === "inicio";
  const { uid, yo, otros, cuentas, categorias, familiares, oculto, setOculto } = useApp();
  const mes = mesISO();
  const hoy = hoyISO();
  // Lo último que viste este mes se muestra al instante mientras se actualiza (cache.ts)
  const claveTablero = `inicio-${mes}`;
  const [guardado] = useState(() => leerCache<Tablero>(uid, claveTablero));
  const tablero = useRef<Partial<Tablero>>(guardado ?? {});
  const recordar = (parte: Partial<Tablero>) => { tablero.current = { ...tablero.current, ...parte }; guardarCache(uid, claveTablero, tablero.current); };
  // ---------- Estado de hoy (no depende de filtros) ----------
  const [saldos, setSaldos] = useState<Saldo[]>(guardado?.saldos ?? []);
  const [porRevisar, setPorRevisar] = useState(guardado?.porRevisar ?? 0);
  // Solo al abrir: el aviso de "Más" muestra lo guardado mientras llega el resumen nuevo
  useEffect(() => { if (guardado) onPendientes?.(guardado.porRevisar); }, []);
  const [tarjetas, setTarjetas] = useState<Record<string, Tarjeta>>(guardado?.tarjetas ?? {});
  const [balance, setBalance] = useState<Balance[]>(guardado?.balance ?? []);
  const [subs, setSubs] = useState<Sub[]>(guardado?.subs ?? []);
  const [msi, setMsi] = useState<CompraMsi[]>(guardado?.msi ?? []);
  // Todas las compras a meses (también las liquidadas), para separarlas en el resumen de Gastos
  const [msiIds, setMsiIds] = useState<string[]>(guardado?.msiIds ?? []);
  const [personas, setPersonas] = useState<Record<string, Persona>>(guardado?.personas ?? {});
  const [listo, setListo] = useState(!!guardado?.saldos);
  // Si falla la conexión se avisa en lugar de mostrar ceros; "intento" vuelve a cargar todo
  const [fallo, setFallo] = useState(false);
  const [falloG, setFalloG] = useState(false);
  const [intento, setIntento] = useState(0);
  // Cuándo se cargó todo por última vez (lo guardado lo trae) y si se está actualizando ahora
  const [actualizado, setActualizado] = useState<number | null>(guardado?.cuando ?? null);
  const [actualizando, setActualizando] = useState(true);
  const [, setReloj] = useState(0);
  useEffect(() => { const t = setInterval(() => setReloj((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  // Al volver a la app, si lo que ves tiene más de 5 minutos, se actualiza solo
  const actualizadoRef = useRef(actualizado);
  actualizadoRef.current = actualizado;
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible" && (!actualizadoRef.current || Date.now() - actualizadoRef.current > 5 * 60000)) setIntento((x) => x + 1);
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, []);
  const [config, setConfig] = useState<ConfigInicio>(configInicial());
  // Meta de gasto mensual (null mientras carga) y reparto de los gastos compartidos del periodo
  const [metaConfig, setMetaConfig] = useState<Meta | null>(null);
  const [reparto, setReparto] = useState<Parte[]>([]);
  // ---------- Datos filtrables ----------
  const [filtros, setFiltrosEstado] = useState<Filtros>(leerFiltros());
  const setFiltros = (f: Filtros) => { recordarFiltros(f); setFiltrosEstado(f); };
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [cargandoG, setCargandoG] = useState(true);
  const [todasCats, setTodasCats] = useState(false);
  const [busca, setBusca] = useState({ cat: "", sub: "" });

  const r = rango(filtros);
  const desdeFetch = r.antDesde;

  useEffect(() => {
    cargarConfig(uid).then(setConfig);
    cargarMeta(uid).then(setMetaConfig);
    // Con catorcena, Inicio abre en "Esta catorcena" (si no elegiste otro periodo en esta sesión)
    cargarCiclo(uid).then((c) => {
      fijarCatorcena(c.tipo === "catorcena" ? c.ref : null);
      if (!filtrosElegidos()) setFiltrosEstado((f) => ({ ...f, periodo: c.tipo === "catorcena" ? "catorcena" : f.periodo === "catorcena" ? "mes" : f.periodo }));
    });
    setActualizando(true);
    // El detalle de compras a meses se pide una vez y lo comparten Cobros y Mensualidades
    const detalleMsi = Promise.resolve(sb.rpc("msi_detalle"));
    // Cobros (5 consultas) va aparte: el resto de Inicio no lo espera
    cargarCobros(detalleMsi).then((co) => { setPersonas(co.personas); recordar({ personas: co.personas }); }, () => {});
    // El detalle de todas tus tarjetas en una sola consulta, al mismo tiempo que lo demás
    sb.rpc("detalle_tarjetas").then(({ data, error }) => {
      if (error || !data) return; // se quedan las tarjetas que ya se veían
      const t = Object.fromEntries(Object.entries(data as Record<string, unknown>).map(([id, d]) => [id, tarjetaDesde(id, d)]));
      setTarjetas(t);
      recordar({ tarjetas: t });
    }, () => {});
    Promise.all([
      sb.rpc("saldos_cuentas"), sb.rpc("resumen_mes", { p_mes: mes }), sb.rpc("balance_hogar"),
      sb.from("suscripciones").select("id, servicio, monto, frecuencia_meses, fecha_referencia, cuenta_id, palabra_clave").eq("activa", true),
      cargarMsi(detalleMsi),
    ]).then(([s, rm, b, su, md]) => {
      const error = !!(s.error || rm.error || b.error || su.error);
      setFallo(error);
      // Sin conexión se queda lo que ya se veía (lo guardado) en lugar de ceros
      setActualizando(false);
      if (error) { setListo(true); return; }
      const msiActivas = md.filter((x) => x.estado === "Activa");
      setMsi(msiActivas);
      const ids = md.map((x) => x.movimiento_id);
      setMsiIds(ids);
      const lista = (s.data ?? []) as Saldo[];
      setSaldos(lista);
      const revisar = n(((rm.data ?? [])[0] as any)?.por_revisar);
      setPorRevisar(revisar);
      onPendientes?.(revisar);
      const bal = (b.data ?? []) as Balance[];
      setBalance(bal);
      const suscripciones = ((su.data ?? []) as any[]).map((x) => ({ ...x, monto: n(x.monto) }));
      setSubs(suscripciones);
      setListo(true);
      const cuando = Date.now();
      setActualizado(cuando);
      recordar({ saldos: lista, porRevisar: revisar, balance: bal, subs: suscripciones, msi: msiActivas, msiIds: ids, cuando });
    }).catch(() => { setFallo(true); setListo(true); setActualizando(false); });
  }, [mes, intento]);

  useEffect(() => {
    // Si cambias los filtros antes de que llegue la respuesta, la vieja se descarta
    let vigente = true;
    const clave = `gastos-${desdeFetch}-${r.hasta}`;
    const previo = leerCache<{ gastos: Gasto[] }>(uid, clave);
    if (previo) { setGastos(previo.gastos); setCargandoG(false); } else setCargandoG(true);
    Promise.resolve(sb.rpc("gastos_lista", { p_desde: desdeFetch, p_hasta: r.hasta })).then((g) => {
      if (!vigente) return;
      setFalloG(!!g.error);
      setCargandoG(false);
      if (g.error) return;
      const gs = ((g.data ?? []) as any[]).map((x) => ({ ...x, monto: n(x.monto) }));
      setGastos(gs);
      guardarCache(uid, clave, { gastos: gs });
    }).catch(() => { if (vigente) { setFalloG(true); setCargandoG(false); } });
    sb.rpc("reparto_compartido", { p_desde: r.desde, p_hasta: r.hasta }).then(({ data, error }) => {
      if (vigente && !error) setReparto(((data ?? []) as any[]).map((x) => ({ ...x, parte: n(x.parte) })));
    }, () => {});
    return () => { vigente = false; };
  }, [desdeFetch, r.desde, r.hasta, uid, intento]);

  // ---------- Cálculos con filtros ----------
  const filtrados = useMemo(() => gastos.filter((g) => pasaFiltro(g, filtros)), [gastos, filtros]);
  const actuales = filtrados.filter((g) => g.fecha >= r.desde && g.fecha < r.hasta);
  const anteriores = filtrados.filter((g) => g.fecha >= r.antDesde && g.fecha < r.antHasta);
  const gastado = actuales.reduce((a, g) => a + g.monto, 0);
  const gastadoAnt = anteriores.reduce((a, g) => a + g.monto, 0);
  // De lo gastado, cuánto es de suscripciones y cuánto de compras a meses (la compra completa, en su fecha)
  const idsMsi = new Set(msiIds);
  const deMsi = actuales.filter((g) => idsMsi.has(g.movimiento_id)).reduce((a, g) => a + g.monto, 0);
  const deSubs = actuales.filter((g) => !idsMsi.has(g.movimiento_id) && subs.some((x) => esDeSub(g.texto, x))).reduce((a, g) => a + g.monto, 0);  const conCategoria = !!filtros.categoria;
  const periodo = textoPeriodo(filtros);
  // Periodo en curso: este mes o esta catorcena (la meta, la proyección y "por día" se calculan sobre él)
  const esCatorcena = filtros.periodo === "catorcena" || filtros.periodo === "catorcena_pasada";
  const esMesActual = filtros.periodo === "mes" || filtros.periodo === "catorcena";
  const elPeriodo = esCatorcena ? "la catorcena" : "el mes";
  const totalDias = esCatorcena ? 14 : new Date(Number(r.desde.slice(0, 4)), Number(r.desde.slice(5, 7)), 0).getDate();
  const diaHoy = esMesActual ? diasEntre(r.desde, hoy) + 1 : totalDias;
  const proyCierre = esMesActual && diaHoy >= 3 ? (gastado / diaHoy) * totalDias : null;
  const diario: Record<number, number> = {};
  if (r.unMes) for (const g of actuales) diario[Number(g.fecha.slice(8, 10))] = (diario[Number(g.fecha.slice(8, 10))] ?? 0) + g.monto;
  const grupos = agruparCategorias(actuales.map((g) => ({ ...g })));
  // La meta es del mes completo: se compara solo con el mes actual y sin filtros de cuenta o categoría
  const meta = metaConfig?.modo === "fija" ? metaConfig.monto : 0;
  const metaAplica = esMesActual && !filtros.cuentas.length && !conCategoria;
  const conMeta = !!meta && metaAplica;
  const quedaMeta = conMeta ? meta - gastado : 0;
  const diasRestantes = totalDias - diaHoy + 1;
  // Compartidos: rosa primero, como en el símbolo; sin color elegido, tú en gris y tu pareja en rosa
  const partes = reparto.map((p) => ({ ...p, color: p.color ?? (p.es_yo ? "gris" : "rosa") }))
    .sort((a, b) => Number(a.color !== "rosa") - Number(b.color !== "rosa"));
  const totalCompartido = partes.reduce((a, p) => a + p.parte, 0);
  const visiblesInicio = config.filter((c) => c.visible);
  // Movimientos con el mismo periodo y filtros del resumen
  const verMovimientos = (() => {
    const q = new URLSearchParams({ filtro: "gasto" });
    if (r.unMes) q.set("mes", r.desde); else { q.set("desde", r.desde); q.set("hasta", masDias(r.hasta, -1)); }
    if (filtros.cuentas.length === 1) q.set("cuenta", filtros.cuentas[0]);
    if (filtros.categoria) q.set("q", filtros.categoria === "sin" ? "Sin categoría" : categorias.find((c) => c.id === filtros.categoria)?.nombre ?? "");
    return `/movimientos?${q}`;
  })();

  // ---------- Estado de hoy ----------
  const enFiltroCta = (id: string) => !filtros.cuentas.length || filtros.cuentas.includes(id);
  const visibles = saldos.filter((s) => s.activa);
  const creditos = visibles.filter((s) => s.tipo === "credito" && (s.mia || s.conjunta));
  const subsProx = subs.flatMap((x) => { const f = proximoCobro(x.fecha_referencia, x.frecuencia_meses); return f && diasEntre(hoy, f) <= 7 ? [{ t: x.servicio, f, m: x.monto }] : []; });
  const proximos = [
    ...subsProx.map((x) => ({ ...x, id: "", tipo: "sub" as const })),
    ...creditos.filter((c) => tarjetas[c.id]?.falta > 0 && tarjetas[c.id].fecha_pago && diasEntre(hoy, tarjetas[c.id].fecha_pago!) <= 10)
      .map((c) => ({ id: c.id, t: `Pago ${c.nombre}`, f: tarjetas[c.id].fecha_pago!, m: tarjetas[c.id].falta, tipo: "tarjeta" as const })),
  ].sort((a, b) => a.f.localeCompare(b.f));
  const proyMsi = proyeccionMsi(msi, mes, 12);
  const msiHoy = proyMsi[0]?.total ?? 0;
  const debesMsi = msi.reduce((a, x) => a + x.por_facturar, 0);
  const terminaPronto = [...msi].sort((a, b) => a.ultimo_mes.localeCompare(b.ultimo_mes))[0];
  const subsAlMes = subs.reduce((a, x) => a + x.monto / x.frecuencia_meses, 0);

  // ---------- Secciones ----------
  // Todas las secciones llevan el mismo encabezado (título, periodo si responde a filtros y enlace) fuera de la tarjeta
  const cabeza = (titulo: string, enlace?: [string, string], filtrable = false) => (
    <div className="seccion-cabeza">
      <div><h2>{titulo}</h2>{filtrable && <div className="etiq-periodo">{periodo}{filtros.cuentas.length || conCategoria ? " · con filtros" : ""}</div>}</div>
      {enlace && <Link to={enlace[0]} className="enlace-chico">{enlace[1]}</Link>}
    </div>
  );
  const panel = (titulo: string, cuerpo: ReactNode, enlace?: [string, string], filtrable = false) => (
    <section className="seccion">
      {cabeza(titulo, enlace, filtrable)}
      <div className="panel">{cuerpo}</div>
    </section>
  );
  const vacioFiltro = <div className="vacio p-8-0">{cargandoG ? "Cargando…" : "Sin gastos con estos filtros."}</div>;

  // ---------- Inicio ----------
  // Esta semana: pagos próximos y avisos, en tarjetas que se deslizan de lado
  const semana = () => {
      const tarjetasSemana = [
        ...(porRevisar > 0 ? [{ k: "rev", to: "/pendientes", I: Tray, t: `${porRevisar} por revisar`, d: "Sin clasificar o sin categoría", m: "", tono: "urgente" }] : []),
        ...proximos.map((p, i) => {
          const d = diasEntre(hoy, p.f);
          return { k: "p" + i, to: p.tipo === "sub" ? "/suscripciones" : `/cuenta/${p.id}`, I: p.tipo === "sub" ? Repeat : CreditCard, t: p.t,
            d: `${d === 0 ? "Hoy" : d === 1 ? "Mañana" : d < 0 ? `Venció hace ${-d} ${d === -1 ? "día" : "días"}` : `En ${d} días`} · ${fechaCorta(p.f)}`, m: fmt(p.m), tono: d <= 3 ? "urgente" : "" };
        }),
        ...(otros.length ? balance.filter((b) => Math.abs(b.me_debe) >= 0.5).map((b) => ({ k: "b" + b.nombre, to: "/hogar", I: Handshake,
          t: b.me_debe > 0 ? `${b.nombre} te debe` : `Le debes a ${b.nombre}`, d: "Gastos compartidos", m: fmt(Math.abs(b.me_debe)), tono: b.me_debe > 0 ? "verde" : "" })) : []),
      ];
      return tarjetasSemana.length > 0 ? (
        <section className="seccion">
          {cabeza("Esta semana")}
          <div className="semana">
            {tarjetasSemana.map((x) => (
              <Link key={x.k} className={"semana-tarjeta " + x.tono} to={x.to}>
                <span className="ico" aria-hidden="true"><x.I size={18} /></span>
                <div className="st-titulo">{x.t}</div>
                <div className="st-detalle">{x.d}</div>
                {x.m && <div className="st-monto">{x.m}</div>}
              </Link>
            ))}
          </div>
        </section>
      ) : listo ? <p className="nota flex gap-6 centrar-v mt-14"><CalendarDots size={16} /> Sin pagos ni avisos en los próximos días.</p> : null;
  };

  // Quién te debe: en Inicio, todo; en Gastos, solo lo de gastos de contado. El saldo con tu pareja va en los dos.
  const quien = (origen?: Origen) => {
    const lista = [
      ...deudasDe(personas, origen).map((x) => ({ ...x, nombre: familiares.find((f) => f.id === x.id)?.nombre ?? "Otra persona", to: "/cobros" })),
      ...balance.filter((b) => b.me_debe > 0.5).map((b) => ({ id: b.nombre, nombre: b.nombre, hoy: b.me_debe, despues: 0, to: "/hogar" })),
    ].sort((a, b) => b.hoy + b.despues - (a.hoy + a.despues));
    const total = lista.reduce((a, x) => a + x.hoy, 0);
    return panel("Quién te debe", lista.length ? <>
      <div className="lista plana">
        {lista.map((x) => (
          <Link key={x.id} className="fila" to={x.to}>
            <div className="cuerpo"><div className="titulo">{x.nombre}</div>
              {x.despues > 0.5 && <div className="detalle">Más {fmt(x.despues, false)} {origen ? "por venir" : "en cargos por venir"}</div>}</div>
            <div className="monto positivo">{fmt(x.hoy, false)}<small>hoy</small></div>
          </Link>
        ))}
      </div>
      <p className="nota">Te deben hoy <b>{fmt(total, false)}</b>{origen ? " de tus gastos" : ""}.</p>
    </> : <div className="vacio p-8-0">Nadie te debe nada.</div>, ["/cobros", "Cobros"]);
  };

  // Tarjeta de resumen de un módulo: lleva a su pestaña
  const modulo = (to: string, I: typeof Receipt, titulo: string, etiqueta: string, cifra: number, detalle: ReactNode) => (
    <Link className="panel modulo" to={to}>
      <div className="modulo-cabeza"><span className="ico" aria-hidden="true"><I size={18} /></span><span>{titulo}</span><CaretRight size={16} className="flecha" aria-hidden="true" /></div>
      <div className="etiqueta">{etiqueta}</div>
      <div className="cifra num">{fmt(cifra, false)}</div>
      <div className="detalle">{detalle}</div>
    </Link>
  );

  const vistaInicio = () => {
    const top = grupos.slice(0, 3);
    const subsSemana = subsProx.reduce((a, x) => a + x.m, 0);
    return <>
      {semana()}
      <section className="seccion">
        {cabeza("Tus módulos")}
        <div className="modulos">
          {modulo("/gastos", Receipt, "Gastos", `Llevas gastado · ${periodo}${filtros.cuentas.length || conCategoria ? " (con filtros)" : ""}`, gastado,
            top.length ? top.map((c) => `${c.nombre} ${fmt(c.total, false)}`).join(" · ") : cargandoG ? "Cargando…" : "Sin gastos en el periodo.")}
          {modulo("/suscripciones", Repeat, "Suscripciones", "Pagas al mes", subsAlMes,
            subsProx.length ? <>Esta semana: {subsProx.length} {subsProx.length === 1 ? "cobro" : "cobros"} por <b>{fmt(subsSemana, false)}</b></>
              : `${subs.length} ${subs.length === 1 ? "servicio activo" : "servicios activos"} · nada esta semana`)}
          {modulo("/msi", CalendarDots, "Meses sin intereses", "Pagas este mes", msiHoy,
            msi.length ? <>Te falta <b>{fmt(debesMsi, false)}</b>{terminaPronto ? <> · {terminaPronto.descripcion || "Una compra"} termina en {mesCorto(terminaPronto.ultimo_mes)}</> : null}</> : "Sin compras a meses activas.")}
        </div>
      </section>
      {quien()}
      <section className="seccion">
        {cabeza("Hogar")}
        <div className="lista"><Link className="fila" to="/hogar">
          <span className="ico" aria-hidden="true"><UsersThree size={20} /></span>
          <div className="cuerpo">
            <div className="titulo">{otros.length ? `Con ${otros.map((o) => o.nombre).join(" y ")}` : "Gastos compartidos"}</div>
            <div className="detalle">{otros.length
              ? balance.filter((b) => Math.abs(b.me_debe) >= 0.5).map((b) => b.me_debe > 0 ? `${b.nombre} te debe ${fmt(b.me_debe, false)}` : `Le debes ${fmt(-b.me_debe, false)} a ${b.nombre}`).join(" · ") || "Están a mano"
              : "Invita a tu pareja para dividir los gastos del hogar"}</div>
          </div>
          <CaretRight size={16} className="flecha" aria-hidden="true" />
        </Link></div>
      </section>
    </>;
  };

  // ---------- Gastos ----------
  const secciones: Record<IdSeccion, () => ReactNode> = {
    resumen: () => (
      <section className="tablero" aria-label="Resumen">
        <div className="tablero-arriba">
          <div className="tablero-texto">
            <Link to={verMovimientos} className="tablero-enlace" aria-label={`Llevas gastado ${fmt(gastado, false)}, ${periodo}. Ver los gastos`}>
              <div className="etiqueta">Llevas gastado · {periodo}{filtros.cuentas.length || conCategoria ? " (con filtros)" : ""}</div>
              <div className={"cifra" + (conMeta && quedaMeta < 0 ? " alerta" : "")}>{fmt(gastado, false)} <CaretRight size={20} className="tablero-flecha" aria-hidden="true" /></div>
            </Link>
            {conMeta ? (
              quedaMeta >= 0
                ? <div className="sub">De tu meta de {fmt(meta, false)} te quedan <b>{fmt(quedaMeta, false)}</b> por gastar, unos <b>{fmt(quedaMeta / diasRestantes, false)}</b> por día.</div>
                : <div className="sub">Gastaste <b>{fmt(-quedaMeta, false)}</b> más de tu meta de {fmt(meta, false)}.</div>
            ) : <>
              {proyCierre !== null && <div className="sub">A este ritmo cerrarías {elPeriodo} en <b>{fmt(proyCierre, false)}</b>.</div>}
              {proyCierre === null && gastadoAnt > 0 && <div className="sub">Periodo anterior: <b>{fmt(gastadoAnt, false)}</b> ({gastado >= gastadoAnt ? "+" : "−"}{Math.round(Math.abs(gastado / gastadoAnt - 1) * 100)}%)</div>}
              {metaConfig?.modo === "ninguna" && esMesActual && <Link to="/inicio/personalizar" className="tablero-meta">Ponerte un límite de gasto</Link>}
            </>}
          </div>
          {conMeta && <Anillo usado={gastado / meta} avance={diaHoy / totalDias} tam={96} />}
        </div>
        <div className="tablero-trio">
          {conCategoria ? (
            <>
              <div><div className="k">Gastos</div><div className="v">{actuales.length}</div></div>
              <div><div className="k">Promedio</div><div className="v">{fmt(actuales.length ? gastado / actuales.length : 0, false)}</div></div>
              <div><div className="k">Anterior</div><div className="v">{fmt(gastadoAnt, false)}</div></div>
            </>
          ) : (
            <>
              <div><div className="k">Suscripciones</div><div className="v">{fmt(deSubs, false)}</div></div>
              <div><div className="k">Compras a meses</div><div className="v">{fmt(deMsi, false)}</div></div>
              <div><div className="k">Lo demás</div><div className="v">{fmt(gastado - deSubs - deMsi, false)}</div></div>
            </>
          )}
        </div>
        {otros.length > 0 && totalCompartido > 0.5 && (
          <div className="reparto" aria-label="Gastos compartidos">
            <div className="reparto-cabeza"><span>Gastos compartidos</span><b>{fmt(totalCompartido, false)}</b></div>
            <div className="reparto-barra" aria-hidden="true">
              {partes.filter((p) => p.parte > 0).map((p) => <span key={p.user_id} className={"r-" + p.color} style={{ flexGrow: p.parte }} />)}
            </div>
            <div className="reparto-leyenda">
              {partes.map((p) => (
                <span key={p.user_id}><i className={"r-" + p.color} aria-hidden="true" />{p.es_yo ? "Tú" : p.nombre} <b>{fmt(p.parte, false)}</b> · {Math.round((p.parte / totalCompartido) * 100)}%</span>
              ))}
            </div>
          </div>
        )}
      </section>
    ),

    tarjetas: () => {
      const lista = creditos.filter((c) => enFiltroCta(c.id));
      return lista.length > 0 ? (
        <section className="seccion">
          {cabeza("Tarjetas")}
          <div className="lista">
            {lista.map((c) => {
              const deuda = Math.max(0, -n(c.saldo));
              const lim = n(c.limite_credito);
              const t = tarjetas[c.id];
              const d = t?.fecha_pago ? diasEntre(hoy, t.fecha_pago) : null;
              return (
                <Link key={c.id} to={`/cuenta/${c.id}`} className="fila">
                  <IconoCuenta tipo="credito" conjunta={c.conjunta} />
                  <div className="cuerpo">
                    <div className="titulo">{c.nombre}</div>
                    {lim > 0 && <div className="barra"><span className={deuda / lim > 0.8 ? "alerta" : ""} style={{ width: `${Math.min(100, (deuda / lim) * 100)}%` }} /></div>}
                    <div className="detalle">
                      {t && (t.falta === 0 ? <span className="etiq verde">Al corriente</span>
                        : <span className={"etiq" + (d !== null && d <= 3 ? " roja" : "")}>Paga {fmt(t.falta, false)}{t.estimado ? "*" : ""}{t.fecha_pago ? ` · ${fechaCorta(t.fecha_pago)}` : ""}</span>)}
                      {lim > 0 ? `Disponible ${fmt(lim - deuda, false)}` : ""}
                    </div>
                  </div>
                  <div className="monto">{fmt(deuda, false)}<small>debes</small></div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null;
    },

    ritmo: () => r.unMes && gastado > 0 ? panel("Ritmo de gasto",
      <RitmoGasto diario={diario} dias={totalDias} hoy={diaHoy} presupuesto={conMeta ? meta : 0} mesTxt={nombreMes(r.desde).split(" ")[0]} />,
      ["/movimientos", "Ver movimientos"], true) : null,

    categorias: () => panel("En qué se va", grupos.length ? <>
      <DesgloseCategorias cats={todasCats ? grupos : grupos.slice(0, 6)} total={gastado} />
      {grupos.length > 6 && <button className="boton claro chico ancho mt-12" onClick={() => setTodasCats(!todasCats)}>{todasCats ? "Ver menos" : `Ver las ${grupos.length} categorías`}</button>}
    </> : vacioFiltro, ["/analisis", "Análisis"], true),

    quien: () => quien("gasto"),

    comparativo: () => {
      const act = agruparCategorias(actuales), ant = agruparCategorias(anteriores);
      const claves = [...new Set([...act.map((c) => c.clave), ...ant.map((c) => c.clave)])];
      const filas = claves.map((k) => {
        const a = act.find((c) => c.clave === k), b = ant.find((c) => c.clave === k);
        return { k, nombre: a?.nombre ?? b?.nombre ?? "", icono: a?.icono ?? b?.icono ?? null, actual: a?.total ?? 0, antes: b?.total ?? 0 };
      }).sort((x, y) => Math.max(y.actual, y.antes) - Math.max(x.actual, x.antes)).slice(0, 8);
      return panel("Comparativo", filas.length ? <>
        <div className="comp-total">
          <div><div className="k">Este periodo</div><div className="v">{fmt(gastado, false)}</div></div>
          <div><div className="k">Anterior</div><div className="v">{fmt(gastadoAnt, false)}</div></div>
          <div><div className="k">Cambio</div><div className={"v " + (gastado > gastadoAnt ? "negativo" : "positivo")}>{gastadoAnt > 0 ? `${gastado >= gastadoAnt ? "+" : "−"}${Math.round(Math.abs(gastado / gastadoAnt - 1) * 100)}%` : "—"}</div></div>
        </div>
        <div className="comp-lista">
          {filas.map((x) => {
            const dif = x.actual - x.antes;
            const sube = dif > 0.5, bajaX = dif < -0.5;
            return (
              <div className="comp-fila" key={x.k}>
                <IconoCategoria nombre={x.nombre} icono={x.icono} />
                <div className="cuerpo"><div className="titulo">{x.nombre}</div><div className="detalle">antes {fmt(x.antes, false)}</div></div>
                <div className="comp-valor">
                  <b>{fmt(x.actual, false)}</b>
                  <span className={sube ? "negativo" : bajaX ? "positivo" : "tenue"}>
                    {sube ? <ArrowUpRight size={14} /> : bajaX ? <ArrowDownRight size={14} /> : null}{sube || bajaX ? fmt(Math.abs(dif), false) : "igual"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="nota">Se compara con el periodo anterior de la misma duración.</p>
      </> : vacioFiltro, undefined, true);
    },

    ultimos: () => {
      const lista = [...actuales].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 8);
      return panel("Últimos gastos", lista.length ? (
        <div className="lista plana">
          {lista.map((g) => (
            <Link key={g.movimiento_id + g.fecha} className="fila" to={`/editar/${g.movimiento_id}`}>
              <IconoCategoria nombre={g.categoria} icono={g.icono} />
              <div className="cuerpo"><div className="titulo">{g.texto}</div>
                <div className="detalle">{fechaCorta(g.fecha)} · {g.sub ? `${g.categoria} › ${g.sub}` : g.categoria} · {g.cuenta}</div></div>
              <div className="monto">−{fmt(g.monto)}</div>
            </Link>
          ))}
        </div>
      ) : vacioFiltro, ["/movimientos", "Ver todos"], true);
    },

    buscar: () => {
      const padres = categorias.filter((c) => c.tipo === "gasto" && !c.padre_id && !c.archivada && (c.propietario_id === uid || c.propietario_id === null))
        .sort((a, b) => Number(a.propietario_id === null) - Number(b.propietario_id === null) || a.orden - b.orden);
      const hijas = categorias.filter((c) => c.padre_id === busca.cat && !c.archivada).sort((a, b) => a.orden - b.orden);
      const lista = busca.cat ? actuales.filter((g) => pasaFiltro(g, { ...filtros, cuentas: filtros.cuentas, categoria: busca.cat, sub: busca.sub }))
        .sort((a, b) => b.fecha.localeCompare(a.fecha)) : [];
      const total = lista.reduce((a, g) => a + g.monto, 0);
      const porSub = agruparCategorias(lista)[0]?.subs ?? [];
      return panel("Buscar por categoría", <>
        <div className="dos">
          <select aria-label="Categoría a buscar" value={busca.cat} onChange={(e) => setBusca({ cat: e.target.value, sub: "" })}>
            <option value="">Elige una categoría…</option>
            {padres.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            <option value="sin">Sin categoría</option>
          </select>
          <select aria-label="Subcategoría a buscar" value={busca.sub} disabled={!busca.cat || busca.cat === "sin"} onChange={(e) => setBusca({ ...busca, sub: e.target.value })}>
            <option value="">Todas</option>
            <option value="general">General</option>
            {hijas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        {busca.cat && (
          <>
            <div className="comp-total mt-4">
              <div><div className="k">Total</div><div className="v">{fmt(total, false)}</div></div>
              <div><div className="k">Gastos</div><div className="v">{lista.length}</div></div>
              <div><div className="k">Promedio</div><div className="v">{fmt(lista.length ? total / lista.length : 0, false)}</div></div>
            </div>
            {!busca.sub && porSub.length > 1 && (
              <div className="msi-tarjetas mb-8">{porSub.map((s) => <span key={s.clave}><b>{s.nombre}</b> {fmt(s.total, false)}</span>)}</div>
            )}
            {lista.length ? (
              <div className="lista plana">
                {lista.slice(0, 15).map((g) => (
                  <Link key={g.movimiento_id + g.fecha} className="fila" to={`/editar/${g.movimiento_id}`}>
                    <div className="cuerpo"><div className="titulo">{g.texto}</div>
                      <div className="detalle">{fechaCorta(g.fecha)}{g.sub ? ` · ${g.sub}` : ""} · {g.cuenta}</div></div>
                    <div className="monto">−{fmt(g.monto)}</div>
                  </Link>
                ))}
              </div>
            ) : <div className="vacio p-8-0">Sin gastos en esta categoría en el periodo.</div>}
            {lista.length > 15 && <p className="nota">Se muestran los 15 más recientes de {lista.length}.</p>}
          </>
        )}
      </>, undefined, true);
    },

    comercios: () => {
      const m: Record<string, { nombre: string; total: number; veces: number }> = {};
      for (const g of actuales) {
        const k = g.texto.trim().toUpperCase().replace(/\s+/g, " ");
        const x = (m[k] ??= { nombre: g.texto.trim(), total: 0, veces: 0 });
        x.total += g.monto; x.veces += 1;
      }
      const lista = Object.values(m).sort((a, b) => b.total - a.total).slice(0, 8);
      const max = Math.max(1, ...lista.map((x) => x.total));
      return panel("Dónde más gastas", lista.length ? (
        <div className="cats">
          {lista.map((x) => (
            <div className="cat" key={x.nombre}>
              <div className="cat-cuerpo">
                <div className="cat-linea"><span className="cat-nombre">{x.nombre}</span><span className="cat-monto">{fmt(x.total, false)}<small> · {x.veces} {x.veces === 1 ? "vez" : "veces"}</small></span></div>
                <div className="cat-riel"><span style={{ width: `${(x.total / max) * 100}%` }} /></div>
              </div>
            </div>
          ))}
        </div>
      ) : vacioFiltro, undefined, true);
    },

    porcuenta: () => {
      const m: Record<string, { nombre: string; tipo: string | null; total: number }> = {};
      for (const g of actuales) { const k = g.cuenta_id ?? g.cuenta; const x = (m[k] ??= { nombre: g.cuenta, tipo: g.cuenta_tipo, total: 0 }); x.total += g.monto; }
      const lista = Object.values(m).sort((a, b) => b.total - a.total);
      const max = Math.max(1, ...lista.map((x) => x.total));
      return panel("Gasto por cuenta", lista.length ? (
        <div className="cats">
          {lista.map((x) => (
            <div className="cat" key={x.nombre}>
              {x.tipo ? <IconoCuenta tipo={x.tipo} /> : <IconoCategoria nombre="Otros" />}
              <div className="cat-cuerpo">
                <div className="cat-linea"><span className="cat-nombre">{x.nombre}</span><span className="cat-monto">{fmt(x.total, false)}<small> {gastado > 0 ? `${Math.round((x.total / gastado) * 100)}%` : ""}</small></span></div>
                <div className="cat-riel"><span style={{ width: `${(x.total / max) * 100}%` }} /></div>
              </div>
            </div>
          ))}
        </div>
      ) : vacioFiltro, undefined, true);
    },
  };

  // Los filtros van justo arriba de la primera sección que responde a ellos (normalmente el resumen)
  const primeraFiltrable = visiblesInicio.find((c) => SECCIONES.find((s) => s.id === c.id)?.filtrable)?.id;

  return (
    <>
      <header className="cabeza">
        <div>
          {enInicio ? <>
            <div className="sub">Hola, {yo?.nombre}</div>
            <h1>{cap(nombreMes(mes).replace(" de ", " "))}</h1>
          </> : <><Link to="/" className="volver">‹ Inicio</Link><h1>Gastos</h1></>}
          <div className="actualizado" aria-live="polite">{actualizando ? "Actualizando…" : actualizado ? haceCuanto(actualizado) : ""}</div>
        </div>
        <div className="flex gap-8">
          <button className="boton-icono" onClick={() => setOculto(!oculto)} aria-label={oculto ? "Mostrar montos" : "Ocultar montos"} aria-pressed={oculto}>
            {oculto ? <EyeSlash size={22} /> : <Eye size={22} />}
          </button>
          {enInicio
            ? <Link to="/mas" className="boton-icono con-punto" aria-label={porRevisar > 0 ? `Más y ajustes, ${porRevisar} pendientes` : "Más y ajustes"}><GearSix size={22} />{porRevisar > 0 && <span className="punto" aria-hidden="true" />}</Link>
            : <Link to="/inicio/personalizar" className="boton-icono" aria-label="Personalizar Gastos"><SquaresFour size={22} /></Link>}
        </div>
      </header>
      {(fallo || falloG) && (
        <div className="aviso rojo" role="alert">
          <span><strong>No se pudo cargar todo.</strong> Revisa tu conexión: algunas cifras pueden estar incompletas.</span>
          <button className="boton chico" onClick={() => setIntento((x) => x + 1)}>Reintentar</button>
        </div>
      )}
      {cuentas.length === 0 && (
        <Link className="aviso" to="/ajustes/cuentas"><span><strong>Empieza agregando tus tarjetas</strong> con su saldo de hoy.</span></Link>
      )}
      {enInicio ? vistaInicio() : <>
        {visiblesInicio.map((c) => (
          <Fragment key={c.id}>
            {c.id === primeraFiltrable && <BarraFiltros f={filtros} onCambio={setFiltros} />}
            {secciones[c.id]()}
          </Fragment>
        ))}
        {!primeraFiltrable && <BarraFiltros f={filtros} onCambio={setFiltros} />}
        <div className="acciones mt-24">
          <Link to={verMovimientos} className="boton claro">Ver todos los movimientos</Link>
          <Link to="/analisis" className="boton claro">Análisis</Link>
        </div>
        <p className="texto-centro mt-14"><Link to="/inicio/personalizar" className="enlace-chico">Personalizar esta pantalla</Link></p>
      </>}
    </>
  );
}

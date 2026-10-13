import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, CalendarClock, CreditCard, HandCoins, Repeat, Settings2 } from "lucide-react";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { cobroEnMes, diasEntre, fechaCorta, fmt, hoyISO, mesISO, nombreMes, proximoCobro, sumarMes, TIPOS_CUENTA } from "../util";
import { IconoCategoria, IconoCuenta } from "../iconos";
import { BarrasDobles, BarrasFlujo, BarrasMes, RitmoGasto } from "../graficas";
import { agruparCategorias, DesgloseCategorias } from "../desglose";
import { cargarMsi, CompraMsi, proyeccionMsi } from "../msi";
import { cargarCobros, Persona } from "../cobros";
import { cargarConfig, ConfigInicio, configInicial, Filtros, Gasto, IdSeccion, leerFiltros, pasaFiltro, rango, recordarFiltros } from "../inicio/secciones";
import { BarraFiltros, textoPeriodo } from "../inicio/Filtros";
import { guardarCache, leerCache } from "../cache";

type Saldo = { id: string; nombre: string; tipo: string; mia: boolean; conjunta: boolean; propietario_nombre: string | null;
  saldo: number; limite_credito: number | null; proximo_pago: string | null; dia_pago: number | null; msi_por_facturar: number; activa: boolean };
type Tarjeta = { id: string; falta: number; fecha_pago: string | null; pagado_mes: number; estimado: boolean };
type Sub = { id: string; servicio: string; monto: number; frecuencia_meses: number; fecha_referencia: string | null; cuenta_id: string | null };
type Ingreso = { fecha: string; monto: number; cuenta_id: string };
type Tablero = { saldos: Saldo[]; porRevisar: number; abonosPrestamo: Record<string, number>; tarjetas: Record<string, Tarjeta>;
  balance: { nombre: string; me_debe: number }[]; subs: Sub[]; msi: CompraMsi[]; personas: Record<string, Persona> };

const n = (x: unknown) => Number(x ?? 0);
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
const mesCap = (m: string) => cap(nombreMes(m).split(" ")[0]);

// onPendientes: el aviso de "Más" usa el mismo resumen del mes que Inicio, sin pedirlo otra vez
export default function Inicio({ onPendientes }: { onPendientes?: (n: number) => void }) {
  const { uid, yo, otros, cuentas, categorias, familiares } = useApp();
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
  useEffect(() => { if (guardado) onPendientes?.(guardado.porRevisar); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [abonosPrestamo, setAbonosPrestamo] = useState<Record<string, number>>(guardado?.abonosPrestamo ?? {});
  const [tarjetas, setTarjetas] = useState<Record<string, Tarjeta>>(guardado?.tarjetas ?? {});
  const [balance, setBalance] = useState<{ nombre: string; me_debe: number }[]>(guardado?.balance ?? []);
  const [subs, setSubs] = useState<Sub[]>(guardado?.subs ?? []);
  const [msi, setMsi] = useState<CompraMsi[]>(guardado?.msi ?? []);
  const [personas, setPersonas] = useState<Record<string, Persona>>(guardado?.personas ?? {});
  const [listo, setListo] = useState(!!guardado?.saldos);
  // Si falla la conexión se avisa en lugar de mostrar ceros; "intento" vuelve a cargar todo
  const [fallo, setFallo] = useState(false);
  const [falloG, setFalloG] = useState(false);
  const [intento, setIntento] = useState(0);
  const [config, setConfig] = useState<ConfigInicio>(configInicial());
  // ---------- Datos filtrables ----------
  const [filtros, setFiltrosEstado] = useState<Filtros>(leerFiltros());
  const setFiltros = (f: Filtros) => { recordarFiltros(f); setFiltrosEstado(f); };
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [cargandoG, setCargandoG] = useState(true);
  const [todasCats, setTodasCats] = useState(false);
  const [busca, setBusca] = useState({ cat: "", sub: "" });

  const r = rango(filtros);
  // Los 6 meses que terminan en el último mes del periodo (para Ingresos vs. gastos)
  const ultimoDia = (() => { const d = new Date(r.hasta + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
  const flujoDesde = sumarMes(mesISO(ultimoDia), -5);
  const desdeFetch = [r.antDesde, flujoDesde].sort()[0];

  useEffect(() => {
    cargarConfig(uid).then(setConfig);
    // El detalle de compras a meses se pide una vez y lo comparten Cobros y Mensualidades
    const detalleMsi = Promise.resolve(sb.rpc("msi_detalle"));
    // Cobros (5 consultas) va aparte: el resto de Inicio no lo espera
    cargarCobros(detalleMsi).then((co) => { setPersonas(co.personas); recordar({ personas: co.personas }); }, () => {});
    // El detalle de todas tus tarjetas en una sola consulta, al mismo tiempo que lo demás
    sb.rpc("detalle_tarjetas").then(({ data, error }) => {
      if (error || !data) return; // se quedan las tarjetas que ya se veían
      const t: Record<string, Tarjeta> = {};
      for (const [id, v] of Object.entries(data as Record<string, any>)) {
        t[id] = { id, falta: Math.max(0, n(v.pago_corte) - n(v.pagado_desde_corte)), fecha_pago: v.fecha_pago ?? null,
          pagado_mes: n(v.mes_entradas) + n(v.mes_ingresos), estimado: v.ultimo_corte ? !v.corte_conocido && !v.pago_manual : false };
      }
      setTarjetas(t);
      recordar({ tarjetas: t });
    }, () => {});
    Promise.all([
      sb.rpc("saldos_cuentas"), sb.rpc("resumen_mes", { p_mes: mes }), sb.rpc("balance_hogar"),
      sb.from("suscripciones").select("id, servicio, monto, frecuencia_meses, fecha_referencia, cuenta_id").eq("activa", true),
      cargarMsi(detalleMsi),
      sb.from("movimientos").select("cuenta_destino_id, monto, cuenta_destino:cuentas!movimientos_cuenta_destino_id_fkey(tipo)")
        .in("tipo", ["transferencia", "liquidacion"]).gte("fecha", mes).not("cuenta_destino_id", "is", null),
    ]).then(([s, rm, b, su, md, ab]) => {
      const error = !!(s.error || rm.error || b.error || su.error || ab.error);
      setFallo(error);
      // Sin conexión se queda lo que ya se veía (lo guardado) en lugar de ceros
      if (error) { setListo(true); return; }
      const msiActivas = md.filter((x) => x.estado === "Activa");
      setMsi(msiActivas);
      const abonos: Record<string, number> = {};
      for (const x of (ab.data ?? []) as any[]) if (x.cuenta_destino?.tipo === "prestamo") abonos[x.cuenta_destino_id] = (abonos[x.cuenta_destino_id] ?? 0) + n(x.monto);
      setAbonosPrestamo(abonos);
      const lista = (s.data ?? []) as Saldo[];
      setSaldos(lista);
      const revisar = n(((rm.data ?? [])[0] as any)?.por_revisar);
      setPorRevisar(revisar);
      onPendientes?.(revisar);
      const bal = (b.data ?? []) as { nombre: string; me_debe: number }[];
      setBalance(bal);
      const suscripciones = ((su.data ?? []) as any[]).map((x) => ({ ...x, monto: n(x.monto) }));
      setSubs(suscripciones);
      setListo(true);
      recordar({ saldos: lista, porRevisar: revisar, abonosPrestamo: abonos, balance: bal, subs: suscripciones, msi: msiActivas });
    }).catch(() => { setFallo(true); setListo(true); });
  }, [mes, intento]);

  useEffect(() => {
    // Si cambias los filtros antes de que llegue la respuesta, la vieja se descarta
    let vigente = true;
    const clave = `gastos-${desdeFetch}-${r.hasta}`;
    const previo = leerCache<{ gastos: Gasto[]; ingresos: Ingreso[] }>(uid, clave);
    if (previo) { setGastos(previo.gastos); setIngresos(previo.ingresos); setCargandoG(false); } else setCargandoG(true);
    Promise.all([
      sb.rpc("gastos_lista", { p_desde: desdeFetch, p_hasta: r.hasta }),
      sb.from("movimientos").select("fecha, monto, cuenta_id, cuenta:cuentas!movimientos_cuenta_id_fkey(propietario_id)")
        .eq("tipo", "ingreso").eq("creado_por", uid).gte("fecha", desdeFetch).lt("fecha", r.hasta),
    ]).then(([g, i]) => {
      if (!vigente) return;
      const error = !!(g.error || i.error);
      setFalloG(error);
      setCargandoG(false);
      if (error) return;
      const gs = ((g.data ?? []) as any[]).map((x) => ({ ...x, monto: n(x.monto) }));
      const is = ((i.data ?? []) as any[]).filter((x) => x.cuenta?.propietario_id).map((x) => ({ fecha: x.fecha, monto: n(x.monto), cuenta_id: x.cuenta_id }));
      setGastos(gs); setIngresos(is);
      guardarCache(uid, clave, { gastos: gs, ingresos: is });
    }).catch(() => { if (vigente) { setFalloG(true); setCargandoG(false); } });
    return () => { vigente = false; };
  }, [desdeFetch, r.hasta, uid, intento]);

  // ---------- Cálculos con filtros ----------
  const filtrados = useMemo(() => gastos.filter((g) => pasaFiltro(g, filtros)), [gastos, filtros]);
  const actuales = filtrados.filter((g) => g.fecha >= r.desde && g.fecha < r.hasta);
  const anteriores = filtrados.filter((g) => g.fecha >= r.antDesde && g.fecha < r.antHasta);
  const ingFiltrados = ingresos.filter((x) => !filtros.cuentas.length || filtros.cuentas.includes(x.cuenta_id));
  const gastado = actuales.reduce((a, g) => a + g.monto, 0);
  const gastadoAnt = anteriores.reduce((a, g) => a + g.monto, 0);
  const ingresado = ingFiltrados.filter((x) => x.fecha >= r.desde && x.fecha < r.hasta).reduce((a, x) => a + x.monto, 0);
  const conCategoria = !!filtros.categoria;
  const periodo = textoPeriodo(filtros);
  const esMesActual = filtros.periodo === "mes";
  const totalDias = new Date(Number(r.desde.slice(0, 4)), Number(r.desde.slice(5, 7)), 0).getDate();
  const diaHoy = esMesActual ? Number(hoy.slice(8, 10)) : totalDias;
  const proyCierre = esMesActual && diaHoy >= 3 ? (gastado / diaHoy) * totalDias : null;
  const diario: Record<number, number> = {};
  if (r.unMes) for (const g of actuales) diario[Number(g.fecha.slice(8, 10))] = (diario[Number(g.fecha.slice(8, 10))] ?? 0) + g.monto;
  const grupos = agruparCategorias(actuales.map((g) => ({ ...g })));

  // ---------- Estado de hoy ----------
  const enFiltroCta = (id: string) => !filtros.cuentas.length || filtros.cuentas.includes(id);
  const visibles = saldos.filter((s) => s.activa);
  const creditos = visibles.filter((s) => s.tipo === "credito" && (s.mia || s.conjunta));
  const prestamos = visibles.filter((s) => s.tipo === "prestamo" && (s.mia || s.conjunta));
  const pagoMensual = Object.fromEntries(cuentas.map((c) => [c.id, n(c.pago_mensual)]));
  const faltaPrestamo = (id: string) => Math.max(0, Math.min(pagoMensual[id], -n(saldos.find((x) => x.id === id)?.saldo)) - (abonosPrestamo[id] ?? 0));
  const ordenTipo = ["debito", "ahorro", "efectivo", "inversion", "prestamo", "credito"];
  const otrasCuentas = visibles.filter((s) => !creditos.includes(s))
    .sort((a, b) => Number(!(a.mia || a.conjunta)) - Number(!(b.mia || b.conjunta)) || ordenTipo.indexOf(a.tipo) - ordenTipo.indexOf(b.tipo));
  const tienes = visibles.filter((s) => (s.mia || s.conjunta) && ["debito", "efectivo", "ahorro"].includes(s.tipo)).reduce((a, s) => a + Math.max(0, n(s.saldo)), 0);
  const porPagarTarjetas = Object.values(tarjetas).reduce((a, t) => a + t.falta, 0);
  const pagadoTarjetas = Object.values(tarjetas).reduce((a, t) => a + t.pagado_mes, 0);
  const porPagarPrestamos = prestamos.reduce((a, p) => a + faltaPrestamo(p.id), 0);
  const sobra = tienes - porPagarTarjetas - porPagarPrestamos;
  const subsProx = subs.flatMap((x) => { const f = proximoCobro(x.fecha_referencia, x.frecuencia_meses); return f && diasEntre(hoy, f) <= 7 ? [{ t: x.servicio, f, m: x.monto }] : []; });
  const proximos = [
    ...subsProx.map((x) => ({ ...x, id: "", tipo: "sub" as const })),
    ...creditos.filter((c) => tarjetas[c.id]?.falta > 0 && tarjetas[c.id].fecha_pago && diasEntre(hoy, tarjetas[c.id].fecha_pago!) <= 10)
      .map((c) => ({ id: c.id, t: `Pago ${c.nombre}`, f: tarjetas[c.id].fecha_pago!, m: tarjetas[c.id].falta, tipo: "tarjeta" as const })),
    ...prestamos.filter((p) => faltaPrestamo(p.id) > 0 && p.proximo_pago && diasEntre(hoy, p.proximo_pago) <= 10)
      .map((p) => ({ id: p.id, t: `Pago ${p.nombre}`, f: p.proximo_pago!, m: faltaPrestamo(p.id), tipo: "prestamo" as const })),
  ].sort((a, b) => a.f.localeCompare(b.f));
  const proyMsi = proyeccionMsi(msi, mes, 12).map((p) => ({ ...p, etiqueta: mesCap(p.mes), monto: p.total }));
  const msiHoy = proyMsi[0]?.monto ?? 0;
  const deOtros = proyMsi[0]?.otros ?? 0;
  const debesMsi = msi.reduce((a, x) => a + x.por_facturar, 0);
  const teDebenMsi = msi.reduce((a, x) => a + x.por_facturar * x.fraccionOtros, 0);
  const baja = proyMsi.find((p) => p.monto < msiHoy - 0.5);
  const porTarjeta = Object.entries(msi.filter((x) => x.primer_mes <= mes && x.ultimo_mes >= mes)
    .reduce((acc: Record<string, number>, x) => { acc[x.cuenta ?? "Sin tarjeta"] = (acc[x.cuenta ?? "Sin tarjeta"] ?? 0) + n(x.mensualidad); return acc; }, {}))
    .sort((a, b) => b[1] - a[1]);

  // ---------- Secciones ----------
  const panel = (titulo: string, cuerpo: ReactNode, enlace?: [string, string], filtrable = false) => (
    <section className="panel">
      <div className="panel-cabeza"><h2>{titulo}</h2>{enlace && <Link to={enlace[0]} className="enlace-chico">{enlace[1]}</Link>}</div>
      {filtrable && <div className="etiq-periodo">{periodo}{filtros.cuentas.length || conCategoria ? " · con filtros" : ""}</div>}
      {cuerpo}
    </section>
  );
  const vacioFiltro = <div className="vacio" style={{ padding: "8px 0" }}>{cargandoG ? "Cargando…" : "Sin gastos con estos filtros."}</div>;

  const secciones: Record<IdSeccion, () => ReactNode> = {
    proximos: () => proximos.length > 0 ? (
      <>
        <h2 style={{ marginTop: 4 }}>Próximos pagos</h2>
        <div className="lista">
          {proximos.map((p, i) => {
            const d = diasEntre(hoy, p.f);
            return (
              <Link className="fila" key={i} to={p.tipo === "sub" ? "/suscripciones" : `/cuenta/${p.id}`}>
                <span className="ico" aria-hidden="true">{p.tipo === "sub" ? <Repeat size={20} /> : p.tipo === "prestamo" ? <HandCoins size={20} /> : <CreditCard size={20} />}</span>
                <div className="cuerpo"><div className="titulo">{p.t}</div>
                  <div className="detalle">{d === 0 ? "Hoy" : d === 1 ? "Mañana" : d < 0 ? `Venció hace ${-d} ${d === -1 ? "día" : "días"}` : `En ${d} días`} · {fechaCorta(p.f)}</div></div>
                <div className={"monto" + (d <= 3 ? " negativo" : "")}>{fmt(p.m)}</div>
              </Link>
            );
          })}
        </div>
      </>
    ) : listo ? <p className="nota" style={{ display: "flex", gap: 6, alignItems: "center" }}><CalendarClock size={16} /> Sin pagos en los próximos días.</p> : null,

    avisos: () => (
      <>
        {porRevisar > 0 && <Link className="aviso rojo" to="/pendientes"><span><strong>{porRevisar} por revisar:</strong> movimientos sin clasificar o partes compartidas sin categoría.</span></Link>}
        {otros.length > 0 && balance.map((b) => Math.abs(b.me_debe) >= 0.5 && (
          <Link key={b.nombre} className={"aviso " + (b.me_debe > 0 ? "verde" : "")} to="/hogar">
            <span>{b.me_debe > 0 ? <><strong>{b.nombre} te debe {fmt(b.me_debe)}</strong> de gastos compartidos.</> : <><strong>Le debes {fmt(-b.me_debe)} a {b.nombre}</strong> de gastos compartidos.</>}</span>
          </Link>
        ))}
      </>
    ),

    resumen: () => (
      <section className="tablero" aria-label="Resumen">
        <div className="tablero-texto">
          <div className="etiqueta">Llevas gastado · {periodo}{filtros.cuentas.length || conCategoria ? " (con filtros)" : ""}</div>
          <div className="cifra">{fmt(gastado, false)}</div>
          {proyCierre !== null && <div className="sub">A este ritmo cerrarías el mes en <b>{fmt(proyCierre, false)}</b>.</div>}
          {proyCierre === null && gastadoAnt > 0 && <div className="sub">Periodo anterior: <b>{fmt(gastadoAnt, false)}</b> ({gastado >= gastadoAnt ? "+" : "−"}{Math.round(Math.abs(gastado / gastadoAnt - 1) * 100)}%)</div>}
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
              <div><div className="k">Ingresos</div><div className="v pos">{fmt(ingresado, false)}</div></div>
              <div><div className="k">Gastos</div><div className="v">{fmt(gastado, false)}</div></div>
              <div><div className="k">Ahorro</div><div className={"v " + (ingresado - gastado < 0 ? "neg" : "")}>{fmt(ingresado - gastado, false)}</div></div>
            </>
          )}
        </div>
      </section>
    ),

    dinero: () => listo ? panel("Tu dinero este mes", <>
      <div className={"veredicto " + (sobra >= 0 ? "pos" : "neg")}>
        <div className="k">{sobra >= 0 ? "Te sobra al cubrir todo" : "Te falta para cubrir todo"}</div>
        <div className="v">{fmt(Math.abs(sobra), false)}</div>
      </div>
      <BarrasFlujo tienes={tienes} tarjetas={porPagarTarjetas} porGastar={porPagarPrestamos} />
      {pagadoTarjetas > 0 && <p className="nota">Este mes ya pagaste <b>{fmt(pagadoTarjetas, false)}</b> a tus tarjetas.</p>}
    </>) : null,

    tarjetas: () => {
      const lista = creditos.filter((c) => enFiltroCta(c.id));
      return lista.length > 0 ? (
        <>
          <h2>Tarjetas</h2>
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
        </>
      ) : null;
    },

    mensualidades: () => msi.length > 0 ? panel("Mensualidades", <>
      <div className="stats" style={{ borderTop: 0, marginTop: 0, paddingTop: 0, marginBottom: 10 }}>
        <div><div className="k">Este mes</div><div className="v">{fmt(msiHoy, false)}</div></div>
        <div><div className="k">Debes en total</div><div className="v">{fmt(debesMsi, false)}</div></div>
        <div><div className="k">De eso te deben</div><div className="v positivo">{fmt(teDebenMsi, false)}</div></div>
      </div>
      <BarrasMes datos={proyMsi} promedio={0} proyeccion serie="Mensualidades" />
      <div className="msi-tarjetas">{porTarjeta.map(([t, v]) => <span key={t}><b>{t}</b> {fmt(v, false)}</span>)}</div>
      <p className="nota">
        {baja ? <>En {baja.etiqueta.toLowerCase()} bajan a <b>{fmt(baja.monto, false)}</b> al terminar algunas compras.</> : "Sin cambios en los próximos 12 meses."}
        {deOtros > 0.5 && <> De este mes, <b>{fmt(deOtros, false)}</b> son la parte de otras personas.</>}
      </p>
    </>, ["/msi", "Ver detalle"]) : null,

    ritmo: () => r.unMes && gastado > 0 ? panel("Ritmo de gasto",
      <RitmoGasto diario={diario} dias={totalDias} hoy={diaHoy} presupuesto={0} mesTxt={nombreMes(r.desde).split(" ")[0]} />,
      ["/movimientos", "Ver movimientos"], true) : null,

    categorias: () => panel("En qué se va", grupos.length ? <>
      <DesgloseCategorias cats={todasCats ? grupos : grupos.slice(0, 6)} total={gastado} />
      {grupos.length > 6 && <button className="boton claro chico ancho" style={{ marginTop: 12 }} onClick={() => setTodasCats(!todasCats)}>{todasCats ? "Ver menos" : `Ver las ${grupos.length} categorías`}</button>}
    </> : vacioFiltro, ["/analisis", "Análisis"], true),

    cuentas: () => {
      const lista = otrasCuentas.filter((s) => enFiltroCta(s.id));
      return (
        <>
          <h2>Cuentas</h2>
          <div className="lista">
            {lista.length === 0 && <div className="vacio">Sin otras cuentas. <Link to="/ajustes/cuentas">Agregar</Link></div>}
            {lista.map((s, i) => {
              const nuevoGrupo = i === 0 || lista[i - 1].tipo !== s.tipo || lista[i - 1].mia !== s.mia;
              const dueno = s.conjunta ? "Conjunta" : s.mia ? TIPOS_CUENTA[s.tipo] : `De ${s.propietario_nombre}`;
              const Fila: any = s.mia || s.conjunta ? Link : "div";
              return (
                <Fragment key={s.id}>
                  {nuevoGrupo && <div className="subgrupo">{s.mia || s.conjunta ? ({ debito: "Débito", ahorro: "Ahorro", efectivo: "Efectivo", inversion: "Inversión", prestamo: "Deudas y préstamos", credito: "Crédito" } as Record<string, string>)[s.tipo] ?? "Otras" : "De tu pareja"}</div>}
                  <Fila className="fila" to={`/cuenta/${s.id}`}>
                    <IconoCuenta tipo={s.tipo} conjunta={s.conjunta} />
                    <div className="cuerpo"><div className="titulo">{s.nombre}</div><div className="detalle">
                      {s.tipo === "prestamo" && pagoMensual[s.id] > 0 ? (faltaPrestamo(s.id) > 0 ? `Pago ${fmt(faltaPrestamo(s.id), false)}${s.proximo_pago ? ` · ${fechaCorta(s.proximo_pago)}` : ""}` : "Pago del mes cubierto") : dueno}</div></div>
                    {s.tipo === "prestamo" ? <div className="monto">{fmt(Math.max(0, -n(s.saldo)), false)}<small>debes</small></div>
                      : <div className={"monto " + (n(s.saldo) < 0 ? "negativo" : "")}>{fmt(s.saldo)}</div>}
                  </Fila>
                </Fragment>
              );
            })}
          </div>
        </>
      );
    },

    quien: () => {
      const lista = [
        ...Object.entries(personas).map(([id, p]) => ({ id, nombre: familiares.find((f) => f.id === id)?.nombre ?? "Otra persona", hoy: p.total, despues: p.porVenir, to: "/cobros" })),
        ...balance.filter((b) => b.me_debe > 0.5).map((b) => ({ id: b.nombre, nombre: b.nombre, hoy: b.me_debe, despues: 0, to: "/hogar" })),
      ].filter((x) => x.hoy > 0.5 || x.despues > 0.5).sort((a, b) => b.hoy + b.despues - (a.hoy + a.despues));
      const total = lista.reduce((a, x) => a + x.hoy, 0);
      return panel("Quién te debe", lista.length ? <>
        <div className="lista plana">
          {lista.map((x) => (
            <Link key={x.id} className="fila" to={x.to}>
              <div className="cuerpo"><div className="titulo">{x.nombre}</div>
                {x.despues > 0.5 && <div className="detalle">Más {fmt(x.despues, false)} en mensualidades por venir</div>}</div>
              <div className="monto positivo">{fmt(x.hoy, false)}<small>hoy</small></div>
            </Link>
          ))}
        </div>
        <p className="nota">Te deben hoy <b>{fmt(total, false)}</b>.</p>
      </> : <div className="vacio" style={{ padding: "8px 0" }}>Nadie te debe nada.</div>, ["/cobros", "Cobros"]);
    },

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

    flujo: () => {
      const meses = Array.from({ length: 6 }, (_, k) => sumarMes(flujoDesde, k));
      const datos = meses.map((m) => {
        const fin = sumarMes(m, 1);
        return { mes: m, etiqueta: mesCap(m),
          ingresos: conCategoria ? 0 : ingFiltrados.filter((x) => x.fecha >= m && x.fecha < fin).reduce((a, x) => a + x.monto, 0),
          gastos: filtrados.filter((g) => g.fecha >= m && g.fecha < fin).reduce((a, g) => a + g.monto, 0) };
      });
      const ahorro = datos.reduce((a, d) => a + d.ingresos - d.gastos, 0);
      return panel("Ingresos vs. gastos", <>
        <BarrasDobles datos={datos} />
        {!conCategoria && <p className="nota">En estos 6 meses {ahorro >= 0 ? <>ahorraste <b>{fmt(ahorro, false)}</b></> : <>gastaste <b>{fmt(-ahorro, false)}</b> más de lo que entró</>}. Toca un mes para ver el detalle.</p>}
        {conCategoria && <p className="nota">Con una categoría elegida solo se muestran los gastos de esa categoría.</p>}
      </>);
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
            <div className="comp-total" style={{ marginTop: 4 }}>
              <div><div className="k">Total</div><div className="v">{fmt(total, false)}</div></div>
              <div><div className="k">Gastos</div><div className="v">{lista.length}</div></div>
              <div><div className="k">Promedio</div><div className="v">{fmt(lista.length ? total / lista.length : 0, false)}</div></div>
            </div>
            {!busca.sub && porSub.length > 1 && (
              <div className="msi-tarjetas" style={{ marginBottom: 8 }}>{porSub.map((s) => <span key={s.clave}><b>{s.nombre}</b> {fmt(s.total, false)}</span>)}</div>
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
            ) : <div className="vacio" style={{ padding: "8px 0" }}>Sin gastos en esta categoría en el periodo.</div>}
            {lista.length > 15 && <p className="nota">Se muestran los 15 más recientes de {lista.length}.</p>}
          </>
        )}
      </>, undefined, true);
    },

    suscripciones: () => {
      const lista = subs.flatMap((s) => { const f = cobroEnMes(s.fecha_referencia, s.frecuencia_meses, mes); return f ? [{ ...s, f }] : []; })
        .filter((s) => !s.cuenta_id || enFiltroCta(s.cuenta_id)).sort((a, b) => a.f.localeCompare(b.f));
      const total = lista.reduce((a, s) => a + s.monto, 0);
      return panel("Suscripciones del mes", lista.length ? <>
        <div className="lista plana">
          {lista.map((s) => (
            <Link key={s.id} className="fila" to="/suscripciones">
              <span className="ico" aria-hidden="true"><Repeat size={20} /></span>
              <div className="cuerpo"><div className="titulo">{s.servicio}</div>
                <div className="detalle">{s.f < hoy ? "Ya se cobró" : s.f === hoy ? "Se cobra hoy" : "Se cobra"} · {fechaCorta(s.f)}{s.cuenta_id ? ` · ${cuentas.find((c) => c.id === s.cuenta_id)?.nombre ?? ""}` : ""}</div></div>
              <div className="monto">{fmt(s.monto)}</div>
            </Link>
          ))}
        </div>
        <p className="nota">Total del mes: <b>{fmt(total, false)}</b>.</p>
      </> : <div className="vacio" style={{ padding: "8px 0" }}>Sin suscripciones este mes.</div>, ["/suscripciones", "Suscripciones"]);
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

  return (
    <>
      <header className="cabeza">
        <div>
          <div className="sub">Hola, {yo?.nombre}</div>
          <h1>{cap(nombreMes(mes).replace(" de ", " "))}</h1>
        </div>
        <Link to="/inicio/personalizar" className="boton chico claro" aria-label="Personalizar inicio"><Settings2 size={16} /> Personalizar</Link>
      </header>
      <BarraFiltros f={filtros} onCambio={setFiltros} />
      {(fallo || falloG) && (
        <div className="aviso rojo" role="alert">
          <span><strong>No se pudo cargar todo.</strong> Revisa tu conexión: algunas cifras pueden estar incompletas.</span>
          <button className="boton chico" onClick={() => setIntento((x) => x + 1)}>Reintentar</button>
        </div>
      )}
      {cuentas.length === 0 && (
        <Link className="aviso" to="/ajustes/cuentas"><span><strong>Empieza agregando tus cuentas</strong> con su saldo de hoy: débito, tarjetas y ahorro.</span></Link>
      )}
      {config.filter((c) => c.visible).map((c) => <Fragment key={c.id}>{secciones[c.id]()}</Fragment>)}
      <div className="acciones"><Link to="/inicio/personalizar" className="boton claro">Personalizar esta pantalla</Link></div>
    </>
  );
}

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza, Campo, Cargando, Seccion, Segmentos } from "../ui";
import { conDia, diasEntre, errorTexto, fechaCorta, fechaLarga, fmt, hoyISO, limpiarMonto, masDias, mensualidadEn, mesISO, montoMensualidad, msiAnteriores, nombreMes, sumarMes, TIPOS_CUENTA } from "../util";
import { IconoMov, lineaMov, SELECT_MOV, type Mov } from "./Movimientos";
import { Anillo } from "../graficas";
import { DesgloseCategorias, type Cat } from "../desglose";
import { ArrowsLeftRight, CalendarDots, Clock, FilePdf, PencilSimple, Plus, SquaresFour } from "../phosphor";
import { cargarConfigTarjeta, configTarjetaInicial, type ConfigTarjeta, type IdSeccionTarjeta } from "../inicio/secciones";
import { textoRegla, type ReglaPago } from "../fechasPago";
import { cargarCobros, cuentasDelCorte, textoEstado, type EstadoMov, type Persona } from "../cobros";

type Detalle = {
  saldo: number; tipo: string; nombre: string; limite: number | null; dia_corte: number | null; dia_pago: number | null;
  mes_gastos: number; mes_ingresos: number; mes_entradas: number; mes_salidas: number;
  ultimo_corte?: string; proximo_corte?: string; fecha_pago?: string; fecha_pago_siguiente?: string;
  corte_conocido?: boolean; pago_manual?: boolean; pago_corte?: number; pagado_desde_corte?: number; msi_por_facturar?: number;
  periodo_contado?: number; periodo_msi_nuevas?: number; periodo_devoluciones?: number; mensualidades_proximo?: number;
  msi?: { id: string; descripcion: string; meses: number; mensualidad: number; facturadas: number; restantes: number }[];
  aplazados?: { id: string; fecha: string; fecha_compra: string | null; monto: number; meses: number | null; descripcion: string }[];
  saldo_calculado?: boolean; fecha_saldo_inicial?: string; fecha_pago_fijada?: boolean;
  pago_regla?: ReglaPago["pago_regla"]; pago_dias?: number | null; pago_habil?: ReglaPago["pago_habil"];
  cuadre?: Cuadre | null; cuadre_corte?: Cuadre | null;
};
type Cuadre = { tipo: "saldo" | "estado"; created_at: string; corte: string | null; saldo_banco: number | null; saldo_app: number | null; pago_banco: number | null; pago_app: number | null };

const n = (x: unknown) => Number(x ?? 0);

function cuando(f: string) {
  const d = diasEntre(hoyISO(), f);
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  if (d < 0) return `venció hace ${-d} ${d === -1 ? "día" : "días"}`;
  return `faltan ${d} días`;
}

export default function Cuenta() {
  const { id = "" } = useParams();
  const { uid, otros, yo, aviso, familiares, cuentas } = useApp();
  const [d, setD] = useState<Detalle | null>(null);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [fallo, setFallo] = useState("");
  const [cobros, setCobros] = useState<Record<string, EstadoMov[]>>({});
  const [personas, setPersonas] = useState<Record<string, Persona>>({});
  // Cuentas del corte: el corte que ya cerró (lo que pagas ahora) o el periodo abierto
  const [corteVer, setCorteVer] = useState<"cerrado" | "abierto">("cerrado");
  // Cambiar la fecha límite solo de este corte (cuando el estado de cuenta trae otra por un festivo)
  const [cambiandoFecha, setCambiandoFecha] = useState<string | null>(null);
  // Tarjetas: cuántos periodos de corte hacia atrás se ven (0 = el periodo abierto, desde el último corte)
  const [atras, setAtras] = useState(0);
  // Tarjetas: qué movimientos se ven en la lista (solo gastos de contado, meses sin intereses o todos)
  const [vista, setVista] = useState<"todos" | "gastos" | "msi">("todos");
  const [cargandoMovs, setCargandoMovs] = useState(true);
  // Compras a meses de esta tarjeta (se piden una vez): de ellas salen las mensualidades de cada corte
  const [comprasMsi, setComprasMsi] = useState<Mov[]>([]);
  // Secciones que eliges ver en el detalle de tus tarjetas (Personalizar tarjetas)
  const [configTarjeta, setConfigTarjeta] = useState<ConfigTarjeta | null>(null);
  const [generando, setGenerando] = useState(false);
  useEffect(() => { cargarConfigTarjeta(uid).then(setConfigTarjeta); }, [uid]);
  // Al abrir otra tarjeta desde aquí, se empieza de cero: corte actual, todos los movimientos y sin datos de la anterior
  useEffect(() => { setAtras(0); setVista("todos"); setD(null); setMovs([]); setComprasMsi([]); setFallo(""); setCambiandoFecha(null); }, [id]);
  useEffect(() => {
    sb.from("movimientos").select(SELECT_MOV).eq("tipo", "gasto").eq("cuenta_id", id).not("meses_msi", "is", null)
      .then(({ data }) => setComprasMsi(data ?? []));
  }, [id]);
  const nombres = useMemo(() => Object.fromEntries([...otros, ...(yo ? [yo] : [])].map((m) => [m.user_id, m.nombre])), [otros, yo]);

  const cargar = useCallback(async () => {
    const r = await sb.rpc("detalle_cuenta", { p_cuenta: id });
    if (r.error) { setFallo(errorTexto(r.error)); return; }
    const det = r.data as Detalle;
    setD(det);
    cargarCobros().then((c) => { setCobros(c.movs); setPersonas(c.personas); });
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  // Periodo de corte a "atras" periodos del abierto: (inicio, fin], los dos días de corte
  const periodoCorte = (det: Detalle, k: number) => {
    const fin = k === 1 ? det.ultimo_corte! : conDia(sumarMes(mesISO(det.ultimo_corte!), -(k - 1)), det.dia_corte!);
    return { ini: conDia(sumarMes(mesISO(fin), -1), det.dia_corte!), fin };
  };
  useEffect(() => {
    if (!d) return;
    let vigente = true;
    setCargandoMovs(true);
    let q = sb.from("movimientos").select(SELECT_MOV).or(`cuenta_id.eq.${id},cuenta_destino_id.eq.${id}`);
    if (d.tipo === "credito" && d.ultimo_corte) {
      if (atras === 0 || !d.dia_corte) q = q.gt("fecha", d.ultimo_corte).lte("fecha", hoyISO());
      else { const p = periodoCorte(d, atras); q = q.gt("fecha", p.ini).lte("fecha", p.fin); }
    } else q = q.gte("fecha", mesISO()).lte("fecha", hoyISO());
    q.order("fecha", { ascending: false }).order("created_at", { ascending: false }).then((m) => {
      if (!vigente) return;
      setMovs((m.data ?? []).filter((x: any) => x.origen !== "Saldo inicial"));
      setCargandoMovs(false);
    });
    return () => { vigente = false; };
  }, [d, atras, id]);



  if (fallo && !d) return (<><Cabeza titulo="Cuenta" volver /><p className="error" role="alert">{fallo}</p></>);
  if (!d) return (<><Cabeza titulo="Cuenta" volver /><Cargando /></>);

  const credito = d.tipo === "credito" && d.ultimo_corte;
  const pAtras = credito && atras > 0 && d.dia_corte ? periodoCorte(d, atras) : null;
  const entraMov = (m: Mov) => m.cuenta_destino_id === id || ["ingreso", "reembolso"].includes(m.tipo);
  // Tarjetas: el corte que se ve (el abierto cierra en el próximo corte) y sus mensualidades, igual que Movimientos en modo corte.
  // Las compras a meses del periodo llevan el número de mensualidad que factura ese corte (0 si entran al siguiente).
  const corteVisto = credito && d.dia_corte ? (pAtras ?? (d.proximo_corte ? { ini: d.ultimo_corte!, fin: d.proximo_corte } : null)) : null;
  const filas: Mov[] = corteVisto ? [
    ...movs.map((m) => (m.meses_msi && m.tipo === "gasto" ? { ...m, msiK: mensualidadEn(m.fecha, mesISO(corteVisto.fin), d.dia_corte!), compra: true } : m)),
    ...msiAnteriores(comprasMsi, masDias(corteVisto.ini, 1)).flatMap((x) => {
      const k = mensualidadEn(x.fecha, mesISO(corteVisto.fin), d.dia_corte!);
      return k >= 1 && k <= x.meses_msi ? [{ ...x, id: `${x.id}-${k}`, movId: x.id, msiK: k, fecha: corteVisto.fin }] : [];
    }),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha)) : movs;
  // Lo que suma al estado de cuenta: las mensualidades por su parte y lo demás completo
  const cargoDe = (m: Mov) => (m.movId || m.compra ? (m.msiK >= 1 ? montoMensualidad(Number(m.monto), m.meses_msi, m.msiK) : 0) : Number(m.monto));
  const deuda = Math.max(0, -n(d.saldo));
  const limite = n(d.limite);
  const usado = limite > 0 ? deuda / limite : 0;

  const listaDe = (fs: Mov[], vacio = credito ? (atras ? "Sin movimientos en este periodo." : "Sin movimientos desde el corte.") : "Sin movimientos este mes.") => (
    <div className="lista">
      {fs.length === 0 && <div className="vacio">{cargandoMovs ? "Cargando…" : vacio}</div>}
      {fs.map((m) => {
        const l = lineaMov(m, uid, nombres);
        const entra = entraMov(m);
        const editable = m.tipo !== "liquidacion" && (l.mio || l.miParte);
        const Fila: any = editable ? Link : "div";
        return (
          <Fila className="fila" key={m.id} {...(editable ? { to: `/editar/${m.movId ?? m.id}` } : {})}>
            <IconoMov m={m} />
            <div className="cuerpo">
              <div className="titulo">{l.titulo}</div>
              <div className="detalle">
                {m.movId ? <span className="etiq">Mensualidad {m.msiK} de {m.meses_msi}</span>
                  : m.meses_msi ? <span className="etiq">{m.meses_msi} MSI{m.compra ? (m.msiK >= 1 ? " · 1.ª en este corte" : " · empieza el siguiente corte") : ""}</span> : null}
                {m.en_saldo_inicial && <span className="etiq">Ya en el saldo</span>}
                {(cobros[m.id] ?? []).map((e) => <EtiqPersona key={e.familiar_id} nombre={familiares.find((f) => f.id === e.familiar_id)?.nombre ?? "Otra persona"} e={e} />)}
                {fechaCorta(m.fecha)}{l.detalle && m.tipo !== "gasto" ? ` · ${l.detalle}` : textoCat(m)}
              </div>
            </div>
            <div className={"monto " + (entra ? "positivo" : "")}>{entra ? "+" : "−"}{fmt(m.movId ? montoMensualidad(Number(m.monto), m.meses_msi, m.msiK) : m.monto)}</div>
          </Fila>
        );
      })}
    </div>
  );
  const lista = listaDe(filas);

  if (d.tipo === "prestamo") {
    const pm = n(cuentas.find((c) => c.id === id)?.pago_mensual);
    const abonado = n(d.mes_entradas) + n(d.mes_ingresos);
    const falta = Math.max(0, Math.min(pm, deuda) - abonado);
    const dp = n((d as any).dia_pago);
    const fPago = dp ? (() => { const h = hoyISO(); const ud = (m: string) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
      const f = (m: string) => `${m.slice(0, 8)}${String(Math.min(dp, ud(m))).padStart(2, "0")}`;
      return f(mesISO(h)) >= h ? f(mesISO(h)) : f(sumarMes(mesISO(h), 1)); })() : null;
    return (
      <>
        <Cabeza titulo={d.nombre} volver />
        <section className="tablero" aria-label="Resumen del préstamo">
          <div className="etiqueta">Deuda o préstamo · te falta pagar</div>
          <div className="cifra">{fmt(deuda, false)}</div>
          {pm > 0 && <div className="sub">{falta > 0 ? <>Pago de este mes: <b>{fmt(falta)}</b>{fPago ? ` · ${fechaCorta(fPago)}` : ""}</> : "El pago de este mes ya está cubierto."}</div>}
          <div className="tablero-trio">
            <div><div className="k">Pagaste este mes</div><div className="v pos">{fmt(abonado, false)}</div></div>
            <div><div className="k">Pago mensual</div><div className="v">{pm > 0 ? fmt(pm, false) : "—"}</div></div>
            <div><div className="k">Cargos del mes</div><div className="v">{fmt(d.mes_gastos, false)}</div></div>
          </div>
        </section>
        <div className="acciones mt-12">
          <Link className="boton" to={`/nuevo?tipo=transferencia&destino=${id}`}>Registrar un pago</Link>
          <Link className="boton claro" to={`/nuevo?cuenta=${id}`}>Intereses o cargo</Link>
        </div>
        <Seccion titulo="Movimientos del mes">{lista}</Seccion>
        <p className="nota">Los pagos son transferencias desde tu cuenta a este préstamo. <Link to={`/cuenta/${id}/editar`}>Editar cuenta</Link></p>
      </>
    );
  }

  if (!credito) {
    const entradas = n(d.mes_ingresos) + n(d.mes_entradas);
    return (
      <>
        <Cabeza titulo={d.nombre} volver />
        <section className="tablero" aria-label="Resumen de la cuenta">
          <div className="etiqueta">{TIPOS_CUENTA[d.tipo] ?? "Cuenta"} · saldo</div>
          <div className={"cifra" + (n(d.saldo) < 0 ? " alerta" : "")}>{fmt(d.saldo, false)}</div>
          <div className="tablero-trio">
            <div><div className="k">Entró este mes</div><div className="v pos">{fmt(entradas, false)}</div></div>
            <div><div className="k">Gastos</div><div className="v">{fmt(d.mes_gastos, false)}</div></div>
            <div><div className="k">Transferido</div><div className="v">{fmt(d.mes_salidas, false)}</div></div>
          </div>
        </section>
        <div className="acciones mt-12">
          <Link className="boton" to={`/nuevo?cuenta=${id}`}><Plus size={18} aria-hidden="true" /> Registrar movimiento</Link>
          <Link className="boton claro" to={`/nuevo?tipo=transferencia&cuenta=${id}`}><ArrowsLeftRight size={18} aria-hidden="true" /> Transferir</Link>
        </div>
        <p className="texto-centro mt-10"><Link className="enlace-chico" to={`/cuenta/${id}/varios`}>Registrar varios gastos a la vez</Link></p>
        <Seccion titulo="Movimientos del mes">{lista}</Seccion>
        <p className="nota"><Link to={`/cuenta/${id}/editar`}>Editar cuenta</Link></p>
      </>
    );
  }

  const pagoCorte = n(d.pago_corte);
  const pagado = n(d.pagado_desde_corte);
  const falta = Math.max(0, Math.round((pagoCorte - pagado) * 100) / 100);
  const estimado = !d.corte_conocido && !d.pago_manual;
  const contado = n(d.periodo_contado), mens = n(d.mensualidades_proximo), dev = n(d.periodo_devoluciones);
  const proximo = Math.max(0, contado + mens - dev);
  const vencido = falta > 0 && diasEntre(hoyISO(), d.fecha_pago!) < 0;
  // El pago lleva precargado lo que falta para no generar intereses
  const aPagar = `/nuevo?tipo=transferencia&destino=${id}${falta > 0 ? `&monto=${falta}` : ""}`;
  const esMensualidad = (m: Mov) => !!(m.movId || m.compra);
  const cargos = filas.filter((m) => !entraMov(m));
  // Mensualidades de los próximos cortes: cada compra a meses suma su mensualidad mientras le queden
  const porvenir = d.proximo_corte ? Array.from({ length: 6 }, (_, k) => ({
    mes: sumarMes(mesISO(d.proximo_corte!), k),
    // El corte abierto toma la cifra de la base, que ya ajusta los centavos de la primera mensualidad
    monto: k === 0 ? mens : (d.msi ?? []).reduce((a, x) => a + (x.restantes > k ? n(x.mensualidad) : 0), 0),
  })).filter((p) => p.monto > 0) : [];
  const porCategoria: Cat[] = Object.values(cargos.reduce((acc: Record<string, Cat>, m) => {
    const nombre = m.categoria ? (m.categoria.padre?.nombre ?? m.categoria.nombre) : m.tipo === "gasto" ? "Sin categoría" : "Otros cargos";
    const icono = m.categoria ? (m.categoria.padre?.icono ?? m.categoria.icono ?? null) : null;
    (acc[nombre] ??= { clave: nombre, nombre, icono, total: 0, subs: [] }).total += cargoDe(m);
    return acc;
  }, {})).filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
  const totalCat = porCategoria.reduce((a, c) => a + c.total, 0);
  const nombrePeriodo = atras === 0 ? `desde el corte del ${fechaCorta(d.ultimo_corte!)}` : `del corte del ${fechaCorta(pAtras!.fin)}`;

  async function fijarFecha(f: string | null) {
    const r = f ? await sb.from("fechas_corte").upsert({ cuenta_id: id, corte: d!.ultimo_corte, fecha_pago: f })
      : await sb.from("fechas_corte").delete().eq("cuenta_id", id).eq("corte", d!.ultimo_corte!);
    if (r.error) return setFallo(errorTexto(r.error));
    setCambiandoFecha(null); aviso(f ? "Fecha de pago cambiada para este corte" : "Fecha de pago según la regla"); cargar();
  }
  // Lo que dice el estado de cuenta de este corte (si lo cuadraste) contra lo que calcula la app
  const cc = d.cuadre_corte;
  const difPago = cc?.pago_banco != null ? Math.round((Number(cc.pago_banco) - pagoCorte) * 100) / 100 : null;

  async function pdf() {
    if (!d || cargandoMovs) return;
    setGenerando(true);
    try {
      const { descargarEstado } = await import("../estadoCuenta");
      const abonos = filas.filter(entraMov);
      // Devoluciones: lo que el comercio te regresa a la tarjeta; pagos: lo que abonas desde otra cuenta
      const esDevolucion = (m: Mov) => ["ingreso", "reembolso"].includes(m.tipo);
      await descargarEstado({
        tarjeta: d.nombre, titular: yo?.nombre ?? "",
        periodo: atras === 0 ? { desde: addDia(d.ultimo_corte!), hasta: d.proximo_corte ?? hoyISO(), abierto: true } : { desde: masDias(pAtras!.ini, 1), hasta: pAtras!.fin, abierto: false },
        corte: { dia: d.dia_corte, pagoDia: d.dia_pago },
        resumen: {
          deuda, limite, msiPorFacturar: n(d.msi_por_facturar),
          devoluciones: abonos.filter(esDevolucion).reduce((a, m) => a + Number(m.monto), 0),
          contado: cargos.filter((m) => !esMensualidad(m)).reduce((a, m) => a + cargoDe(m), 0),
          mensualidades: cargos.filter(esMensualidad).reduce((a, m) => a + cargoDe(m), 0),
          pagos: abonos.filter((m) => !esDevolucion(m)).reduce((a, m) => a + Number(m.monto), 0),
        },
        pago: atras <= 1 ? { monto: pagoCorte, pagado, fecha: d.fecha_pago ?? null, estimado } : null,
        proximo: atras === 0 ? { monto: proximo, fecha: d.fecha_pago_siguiente ?? null } : null,
        movimientos: filas.map((m) => {
          const l = lineaMov(m, uid, nombres);
          const entra = entraMov(m);
          const etiq = m.movId ? `Mensualidad ${m.msiK} de ${m.meses_msi}`
            : m.meses_msi && m.compra ? `${m.meses_msi} MSI · ${m.msiK >= 1 ? "1.ª en este corte" : "empieza el siguiente corte"}` : "";
          const cat = m.categoria ? (m.categoria.padre ? `${m.categoria.padre.nombre} › ${m.categoria.nombre}` : m.categoria.nombre) : "";
          return { fecha: m.fecha, concepto: l.titulo, detalle: [etiq, m.tipo !== "gasto" ? l.detalle : cat].filter(Boolean).join(" · "),
            cargo: entra ? 0 : cargoDe(m), abono: entra ? Number(m.monto) : 0 };
        }),
        msi: (d.msi ?? []).map((x) => ({ descripcion: x.descripcion, meses: x.meses, facturadas: x.facturadas, restantes: x.restantes, mensualidad: n(x.mensualidad) })),
        porvenir,
        aplazados: (d.aplazados ?? []).map((x) => ({ fecha: x.fecha, descripcion: x.descripcion, monto: Number(x.monto) })),
      });
    } catch (e) {
      setFallo(errorTexto(e));
    } finally {
      setGenerando(false);
    }
  }
  const botonPdf = (
    <button className="boton-icono" onClick={pdf} disabled={generando || cargandoMovs} aria-busy={generando}
      aria-label={`Descargar estado de cuenta en PDF (${atras === 0 ? "periodo actual" : `corte del ${fechaCorta(pAtras!.fin)}`})`} title="Estado de cuenta en PDF">
      <FilePdf size={22} aria-hidden="true" />
    </button>
  );
  // Gastos: compras de contado. Meses sin intereses: las mensualidades del corte y las compras a meses nuevas.
  const vistas = {
    todos: { filas, vacio: undefined },
    gastos: { filas: filas.filter((m) => m.tipo === "gasto" && !m.movId && !m.meses_msi), vacio: "Sin gastos de contado en este periodo." },
    msi: { filas: filas.filter((m) => m.movId || (m.tipo === "gasto" && m.meses_msi)), vacio: "Sin mensualidades ni compras a meses en este periodo." },
  }[vista];

  const secciones: Record<IdSeccionTarjeta, () => ReactNode> = {
    resumen: () => (
      <section className="tablero" aria-label="Resumen de la tarjeta">
        <div className="tablero-arriba">
          <div className="tablero-texto">
            <div className="etiqueta">Debes en total</div>
            <div className="cifra">{fmt(deuda, false)}</div>
            <div className="sub">{n(d.msi_por_facturar) > 0 ? <>Incluye <b>{fmt(d.msi_por_facturar, false)}</b> de meses sin intereses por venir.</> : "Sin compras a meses pendientes."}</div>
          </div>
          {limite > 0 && <Anillo usado={usado} avance={0} marca={false} leyenda="del límite" tam={92} />}
        </div>
        <div className="tablero-trio">
          <div><div className="k">Disponible</div><div className="v">{limite > 0 ? fmt(limite - deuda, false) : "—"}</div></div>
          <div><div className="k">Límite</div><div className="v">{limite > 0 ? fmt(limite, false) : "—"}</div></div>
          <div><div className="k">Próximo pago</div><div className="v">{fmt(proximo, false)}</div></div>
        </div>
      </section>
    ),

    pago: () => (
      <Seccion titulo="Tu pago" ayuda={<>Estado de cuenta del {fechaCorta(d.ultimo_corte!)}</>} accion={<Link className="enlace-chico" to={`/ajustes/tarjeta/${id}/cuadrar`}>Cuadrar</Link>}>
      <div className={"tarjeta-pago" + (vencido ? " vencido" : falta === 0 ? " listo" : "")}>
        <div className="cifra-media">{falta === 0 ? "Pagado" : fmt(falta)}</div>
        <div className="sub">
          {falta === 0 ? `Cubriste el pago para no generar intereses${pagoCorte > 0 ? ` (${fmt(pagoCorte)})` : ""}.`
            : <>Para no generar intereses · paga antes del {fechaLarga(d.fecha_pago!)} ({cuando(d.fecha_pago!)})</>}
        </div>
        {pagado > 0 && falta > 0 && <div className="sub">Ya abonaste {fmt(pagado)} de {fmt(pagoCorte)}.</div>}
        {difPago !== null && (Math.abs(difPago) < 0.5
          ? <p className="nota mb-0"><span className="etiq verde">Cuadra</span> con tu estado de cuenta del {fechaCorta(d.ultimo_corte!)}.</p>
          : <p className="nota mb-0"><span className="etiq roja">No cuadra</span> Tu estado de cuenta dice {fmt(cc!.pago_banco)}: {difPago > 0 ? `${fmt(difPago)} más` : `${fmt(-difPago)} menos`} que la app. <Link to={`/ajustes/tarjeta/${id}/cuadrar`}>Revisar</Link></p>)}
        {cambiandoFecha !== null ? (
          <div className="mt-12">
            <Campo etiqueta={`Fecha límite del corte del ${fechaCorta(d.ultimo_corte!)}`} ayuda="Solo para este corte; los siguientes usan la regla de la tarjeta.">
              <input type="date" value={cambiandoFecha} min={d.ultimo_corte} onChange={(e) => setCambiandoFecha(e.target.value)} />
            </Campo>
            <div className="acciones mt-0">
              <button className="boton claro chico" onClick={() => setCambiandoFecha(null)}>Cancelar</button>
              {d.fecha_pago_fijada && <button className="boton claro chico" onClick={() => fijarFecha(null)}>Usar la regla</button>}
              <button className="boton chico" disabled={!cambiandoFecha} onClick={() => fijarFecha(cambiandoFecha)}>Guardar fecha</button>
            </div>
          </div>
        ) : (
          <p className="nota mb-0">
            {d.fecha_pago_fijada ? "Fecha tomada de tu estado de cuenta" : <>Pagas {textoRegla({ pago_regla: d.pago_regla ?? "fijo", dia_pago: d.dia_pago, pago_dias: d.pago_dias ?? null, pago_habil: d.pago_habil ?? "no", dia_corte: d.dia_corte })}</>}
            {" · "}<button className="enlace-chico boton-texto" onClick={() => setCambiandoFecha(d.fecha_pago!)}>Cambiar fecha de este corte</button>
            {" · "}<Link className="enlace-chico" to={`/cuenta/${id}/editar`}>Cambiar regla</Link>
          </p>
        )}
        {estimado && <p className="nota mb-0">Es un estimado: registraste la tarjeta después de este corte. <Link to={`/ajustes/tarjeta/${id}/cuadrar`}>Cuadrar con mi estado de cuenta</Link></p>}
        {!d.saldo_calculado && !estimado && <p className="nota mb-0">Esta tarjeta todavía usa la deuda que capturaste al darla de alta. <Link to={`/ajustes/tarjeta/${id}/cuadrar`}>Cuádrala con tu estado de cuenta</Link> para que se calcule sola.</p>}
        {d.pago_manual && <p className="nota mb-0">Tomado de tu estado de cuenta.</p>}
        {falta > 0 && (
          <div className="acciones"><Link className="boton" to={aPagar}>Registrar pago</Link></div>
        )}
      </div>
      </Seccion>
    ),

    cierre: () => {
      const cerrado = corteVer === "cerrado";
      const fecha = cerrado ? d.ultimo_corte! : d.proximo_corte!;
      const base = cerrado ? pagoCorte : proximo;
      const lista = cuentasDelCorte(personas, id, mesISO(fecha));
      const deOtros = lista.reduce((a, x) => a + x.total, 0);
      const falta = lista.reduce((a, x) => a + x.falta, 0);
      return (
        <Seccion titulo="Cuentas del corte" accion={lista.length ? <Link className="enlace-chico" to="/cobros">Cobros</Link> : undefined}
          ayuda={cerrado ? <>El corte del {fechaCorta(d.ultimo_corte!)}, que pagas antes del {fechaCorta(d.fecha_pago!)}</> : <>Corta el {fechaCorta(d.proximo_corte!)}; sube si compras antes</>}>
          <Segmentos etiqueta="Qué corte ver" valor={corteVer} onCambio={setCorteVer} opciones={[{ v: "cerrado", t: "Corte cerrado" }, { v: "abierto", t: "Periodo abierto" }]} />
          <div className="panel mt-0">
            <div className="comp-total">
              <div><div className="k">{cerrado ? "Pago del corte" : "Llevas"}</div><div className="v">{fmt(base, false)}</div></div>
              <div><div className="k">De otros</div><div className="v positivo">{fmt(deOtros, false)}</div></div>
              <div><div className="k">Tu parte</div><div className="v">{fmt(Math.max(0, base - deOtros), false)}</div></div>
            </div>
            {lista.length > 0 ? (
              <div className="lista plana">
                {lista.map((x) => (
                  <Link key={x.id} className="fila" to="/cobros">
                    <div className="cuerpo">
                      <div className="titulo">{familiares.find((f) => f.id === x.id)?.nombre ?? "Otra persona"}</div>
                      <div className="detalle">
                        {x.falta < 0.005 ? <span className="etiq verde">Ya te pagó</span> : x.pagado > 0.004 ? <span className="etiq">Te pagó {fmt(x.pagado, false)}</span> : null}
                        {x.cargos.map((c) => c.texto).join(" · ")}
                      </div>
                    </div>
                    <div className={"monto" + (x.falta >= 0.005 ? " positivo" : "")}>{fmt(x.total)}<small>{x.falta >= 0.005 ? `falta ${fmt(x.falta, false)}` : "pagado"}</small></div>
                  </Link>
                ))}
              </div>
            ) : <div className="vacio p-8-0">Nadie más tiene cargos en este corte: todo es tuyo.</div>}
            {lista.length > 0 && <p className="nota">{falta >= 0.005 ? <>Te falta cobrar <b>{fmt(falta, false)}</b> de este corte.</> : "Ya te pagaron todo lo de este corte."}</p>}
          </div>
        </Seccion>
      );
    },

    periodo: () => (
      <Seccion titulo="Periodo actual" ayuda={<>Del {fechaCorta(addDia(d.ultimo_corte!))} al {fechaCorta(d.proximo_corte!)} (corte) · se paga antes del {fechaCorta(d.fecha_pago_siguiente!)}</>}>
      <div className="lista">
        <div className="fila"><div className="cuerpo"><div className="titulo">Compras de contado</div></div><div className="monto">{fmt(contado)}</div></div>
        <div className="fila"><div className="cuerpo"><div className="titulo">Mensualidades MSI de este corte</div></div><div className="monto">{fmt(mens)}</div></div>
        {dev > 0 && <div className="fila"><div className="cuerpo"><div className="titulo">Devoluciones y abonos</div></div><div className="monto positivo">−{fmt(dev)}</div></div>}
        <div className="fila"><div className="cuerpo"><div className="titulo"><strong>Llevas para el próximo pago</strong></div>
          <div className="detalle">Sube si compras antes del {fechaCorta(d.proximo_corte!)}</div></div><div className="monto"><strong>{fmt(proximo)}</strong></div></div>
        {n(d.periodo_msi_nuevas) > 0 && (
          <div className="fila"><div className="cuerpo"><div className="titulo">Compras nuevas a meses</div>
            <div className="detalle">Ya cuentan arriba solo por su primera mensualidad</div></div><div className="monto">{fmt(d.periodo_msi_nuevas)}</div></div>
        )}
      </div>
      </Seccion>
    ),

    porvenir: () => porvenir.length > 0 && (
      <Seccion titulo="Mensualidades por venir" ayuda={<>Te falta pagar a meses: {fmt(d.msi_por_facturar)}</>} accion={<Link className="enlace-chico" to="/msi">Proyección</Link>}>
        <div className="lista">
          {porvenir.map((p, k) => (
            <div className="fila" key={p.mes}>
              <div className="cuerpo"><div className="titulo">Corte de {nombreMes(p.mes)}</div>
                {k === 0 && <div className="detalle">El corte que está abierto</div>}
                <div className="barra"><span style={{ width: `${(p.monto / porvenir[0].monto) * 100}%` }} /></div></div>
              <div className="monto">{fmt(p.monto)}</div>
            </div>
          ))}
        </div>
      </Seccion>
    ),

    categorias: () => (
      <Seccion titulo="En qué se va" ayuda={<>Cargos {nombrePeriodo}</>}>
        <div className="panel">
          {porCategoria.length === 0
            ? <div className="vacio p-8-0">{cargandoMovs ? "Cargando…" : "Sin cargos en este periodo."}</div>
            : <DesgloseCategorias cats={porCategoria} total={totalCat} />}
        </div>
      </Seccion>
    ),

    msi: () => (d.msi?.length ?? 0) > 0 && (
      <Seccion titulo="Meses sin intereses" contador={d.msi!.length} ayuda={<>Por facturar: {fmt(d.msi_por_facturar)}</>} accion={<Link className="enlace-chico" to="/msi">Proyección</Link>}>
        <div className="lista">
          {d.msi!.map((x) => (
            <Link className="fila" key={x.id} to={`/editar/${x.id}`}>
              <span className="ico" aria-hidden="true"><CalendarDots size={20} /></span>
              <div className="cuerpo"><div className="titulo">{x.descripcion}</div>
                <div className="detalle">
                  {(cobros[x.id] ?? []).map((e) => <EtiqPersona key={e.familiar_id} nombre={familiares.find((f) => f.id === e.familiar_id)?.nombre ?? "Otra persona"} e={e} />)}
                  {x.facturadas} de {x.meses} cobradas · faltan {x.restantes}</div>
                <div className="barra"><span style={{ width: `${(x.facturadas / x.meses) * 100}%` }} /></div></div>
              <div className="monto">{fmt(x.mensualidad)}<small>al mes</small></div>
            </Link>
          ))}
        </div>
      </Seccion>
    ),

    aplazados: () => (d.aplazados?.length ?? 0) > 0 && (
      <Seccion titulo="Cargos aplazados" contador={d.aplazados!.length} ayuda="Aún no suman a tu deuda: entran el día en que el banco los cobra">
        <div className="lista">
          {d.aplazados!.map((x) => (
            <Link className="fila" key={x.id} to={`/editar/${x.id}`}>
              <span className="ico" aria-hidden="true"><Clock size={20} /></span>
              <div className="cuerpo"><div className="titulo">{x.descripcion}</div>
                <div className="detalle">{x.meses ? <span className="etiq">{x.meses} MSI</span> : null}Se cobra el {fechaLarga(x.fecha)}{x.fecha_compra ? ` · compra del ${fechaCorta(x.fecha_compra)}` : ""}</div></div>
              <div className="monto">{fmt(x.monto)}{x.meses ? <small>{fmt(Number(x.monto) / x.meses, false)} al mes</small> : null}</div>
            </Link>
          ))}
        </div>
        <p className="nota">Total: {fmt(d.aplazados!.reduce((a, x) => a + Number(x.monto), 0))}.</p>
      </Seccion>
    ),

    movimientos: () => (
      <Seccion titulo="Movimientos">
      <div className="selector-mes">
        <button onClick={() => setAtras(atras + 1)} disabled={!d.dia_corte || atras >= 36} aria-label="Periodo de corte anterior">‹</button>
        <span>{atras === 0 ? `Desde el corte del ${fechaCorta(d.ultimo_corte!)}` : `Corte del ${fechaCorta(pAtras!.fin)}`}</span>
        <button onClick={() => setAtras(atras - 1)} disabled={atras === 0} aria-label="Periodo de corte siguiente">›</button>
      </div>
      {pAtras && (
        <>
          <p className="nota mt-n6 mb-8">Del {fechaCorta(masDias(pAtras.ini, 1))} al {fechaCorta(pAtras.fin)}. Incluye las mensualidades de compras a meses que factura ese corte. Los cargos suman cada mensualidad por su parte, como el estado de cuenta.</p>
          {!cargandoMovs && (
            <div className="trio mt-0 mb-14">
              <div><div className="k">Cargos</div><div className="v">{fmt(cargos.reduce((a, m) => a + cargoDe(m), 0), false)}</div></div>
              <div><div className="k">Pagos y abonos</div><div className="v positivo">{fmt(filas.filter(entraMov).reduce((a, m) => a + Number(m.monto), 0), false)}</div></div>
              <div><div className="k">Movimientos</div><div className="v">{filas.length}</div></div>
            </div>
          )}
        </>
      )}
      <Segmentos etiqueta="Qué movimientos ver" valor={vista} onCambio={setVista} opciones={[
        { v: "todos", t: "Todos" }, { v: "gastos", t: "Gastos" }, { v: "msi", t: "Meses sin intereses" },
      ]} />
      {vista !== "todos" && !cargandoMovs && vistas.filas.length > 0 && (
        <p className="nota mt-n6 mb-8">{vistas.filas.length} {vistas.filas.length === 1 ? "cargo" : "cargos"} · {fmt(vistas.filas.reduce((a, m) => a + cargoDe(m), 0))} en este corte{vista === "msi" ? ", contando cada mensualidad por su parte" : ""}.</p>
      )}
      {listaDe(vistas.filas, vistas.vacio)}
      </Seccion>
    ),
  };
  const orden = configTarjeta ?? configTarjetaInicial();

  return (
    <>
      <Cabeza titulo={d.nombre} volver accion={
        <div className="flex gap-8">
          {botonPdf}
          <Link to={`/cuenta/${id}/editar`} className="boton-icono" aria-label={`Editar ${d.nombre}`} title="Editar tarjeta"><PencilSimple size={22} /></Link>
          <Link to="/tarjetas/personalizar" className="boton-icono" aria-label="Personalizar tarjetas"><SquaresFour size={22} /></Link>
        </div>
      } />
      {orden.filter((c) => c.visible).map((c, i) => (
        <Fragment key={c.id}>
          {secciones[c.id]()}
          {i === 0 && acciones()}
        </Fragment>
      ))}
      {!orden.some((c) => c.visible) && acciones()}
      {fallo && <p className="error" role="alert">{fallo}</p>}
      <p className="nota mt-14">Corte día {d.dia_corte} · pagas {textoRegla({ pago_regla: d.pago_regla ?? "fijo", dia_pago: d.dia_pago, pago_dias: d.pago_dias ?? null, pago_habil: d.pago_habil ?? "no", dia_corte: d.dia_corte })}.
        {d.cuadre ? <> Último cuadre: {fechaCorta(d.cuadre.created_at.slice(0, 10))}{d.cuadre.tipo === "saldo" && d.cuadre.saldo_banco != null && d.cuadre.saldo_app != null && Math.abs(Number(d.cuadre.saldo_banco) - Number(d.cuadre.saldo_app)) >= 0.5 ? " (no cuadró)" : ""}.</> : null} <Link to={`/ajustes/tarjeta/${id}/cuadrar`}>Cuadrar con mi estado de cuenta</Link> · <Link to={`/cuenta/${id}/editar`}>Editar tarjeta</Link> · <Link to="/tarjetas/personalizar">Personalizar esta pantalla</Link></p>
    </>
  );

  function acciones() {
    return (
      <>
        <div className="acciones mt-12">
          <Link className="boton" to={`/nuevo?cuenta=${id}`}><Plus size={18} aria-hidden="true" /> Registrar gasto</Link>
          <Link className="boton claro" to={aPagar}><ArrowsLeftRight size={18} aria-hidden="true" /> Pagar tarjeta</Link>
        </div>
        <p className="texto-centro mt-10"><Link className="enlace-chico" to={`/cuenta/${id}/varios`}>Registrar varios gastos a la vez</Link></p>
      </>
    );
  }
}

function addDia(f: string) {
  const d = new Date(f + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function textoCat(m: Mov) {
  const c = m.categoria ? (m.categoria.padre ? `${m.categoria.padre.nombre} › ${m.categoria.nombre}` : m.categoria.nombre) : "";
  return c && c !== (m.descripcion || m.comercio) ? ` · ${c}` : "";
}

function EtiqPersona({ nombre, e }: { nombre: string; e?: EstadoMov }) {
  const est = textoEstado(e);
  return <span className={"etiq" + (est?.listo ? " verde" : "")}>{nombre}{est ? ` · ${est.t}` : ""}</span>;
}

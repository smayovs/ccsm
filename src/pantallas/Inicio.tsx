import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, CreditCard, HandCoins, Repeat } from "lucide-react";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { diasEntre, fechaCorta, fmt, hoyISO, mesISO, nombreMes, proximoCobro, sumarMes, TIPOS_CUENTA } from "../util";
import { IconoCuenta } from "../iconos";
import { BarrasFlujo, BarrasMes, RitmoGasto } from "../graficas";
import { agruparCategorias, DesgloseCategorias, FilaCat } from "../desglose";
import { cargarMsi, CompraMsi, proyeccionMsi } from "../msi";

type Saldo = { id: string; nombre: string; tipo: string; mia: boolean; conjunta: boolean; propietario_nombre: string | null;
  saldo: number; limite_credito: number | null; proximo_pago: string | null; dia_pago: number | null; msi_por_facturar: number; activa: boolean };
type Resumen = { ingresos: number; gastos: number; ahorro: number; por_revisar: number; dias_restantes: number | null };
type Tarjeta = { id: string; falta: number; fecha_pago: string | null; pagado_mes: number; estimado: boolean };

const n = (x: unknown) => Number(x ?? 0);

export default function Inicio() {
  const { yo, otros, cuentas } = useApp();
  const [saldos, setSaldos] = useState<Saldo[]>([]);
  const [res, setRes] = useState<Resumen | null>(null);
  const [cats, setCats] = useState<FilaCat[]>([]);
  const [abonosPrestamo, setAbonosPrestamo] = useState<Record<string, number>>({});
  const [diario, setDiario] = useState<Record<number, number>>({});
  const [tarjetas, setTarjetas] = useState<Record<string, Tarjeta>>({});
  const [balance, setBalance] = useState<{ nombre: string; me_debe: number }[]>([]);
  const [subs, setSubs] = useState<{ t: string; f: string; m: number }[]>([]);
  const [todasCats, setTodasCats] = useState(false);
  const [listo, setListo] = useState(false);
  const [msi, setMsi] = useState<CompraMsi[]>([]);
  const mes = mesISO();
  const hoy = hoyISO();

  useEffect(() => {
    Promise.all([
      sb.rpc("saldos_cuentas"), sb.rpc("resumen_mes", { p_mes: mes }), sb.rpc("gastos_detalle", { p_desde: mes, p_hasta: sumarMes(mes, 1) }),
      sb.rpc("balance_hogar"), sb.from("suscripciones").select("servicio, monto, frecuencia_meses, fecha_referencia").eq("activa", true),
      sb.rpc("gasto_diario", { p_mes: mes }), cargarMsi(),
      sb.from("movimientos").select("cuenta_destino_id, monto, cuenta_destino:cuentas!movimientos_cuenta_destino_id_fkey(tipo)")
        .in("tipo", ["transferencia", "liquidacion"]).gte("fecha", mes).not("cuenta_destino_id", "is", null),
    ]).then(async ([s, r, c, b, su, g, md, ab]) => {
      setMsi(md.filter((x) => x.estado === "Activa"));
      const abonos: Record<string, number> = {};
      for (const x of (ab.data ?? []) as any[]) if (x.cuenta_destino?.tipo === "prestamo") abonos[x.cuenta_destino_id] = (abonos[x.cuenta_destino_id] ?? 0) + n(x.monto);
      setAbonosPrestamo(abonos);
      const lista = (s.data ?? []) as Saldo[];
      setSaldos(lista);
      setRes(((r.data ?? [])[0] ?? null) as Resumen | null);
      setCats(((c.data ?? []) as any[]).map((x) => ({ ...x, monto: n(x.monto) })));
      setBalance((b.data ?? []) as { nombre: string; me_debe: number }[]);
      const dd: Record<number, number> = {};
      for (const x of (g.data ?? []) as { dia: string; monto: number }[]) dd[Number(x.dia.slice(8, 10))] = n(x.monto);
      setDiario(dd);
      const prox: { t: string; f: string; m: number }[] = [];
      for (const x of (su.data ?? []) as any[]) {
        const f = proximoCobro(x.fecha_referencia, x.frecuencia_meses);
        if (f && diasEntre(hoy, f) <= 7) prox.push({ t: x.servicio, f, m: x.monto });
      }
      setSubs(prox);
      setListo(true);
      // Detalle de cada tarjeta propia: pago pendiente del corte y pagos del mes
      const mias = lista.filter((x) => (x.mia || x.conjunta) && x.activa && x.tipo === "credito");
      const dets = await Promise.all(mias.map((x) => sb.rpc("detalle_cuenta", { p_cuenta: x.id })));
      const t: Record<string, Tarjeta> = {};
      dets.forEach((d, i) => {
        const v = d.data as any;
        if (!v) return;
        t[mias[i].id] = { id: mias[i].id, falta: Math.max(0, n(v.pago_corte) - n(v.pagado_desde_corte)), fecha_pago: v.fecha_pago ?? null,
          pagado_mes: n(v.mes_entradas) + n(v.mes_ingresos), estimado: v.ultimo_corte ? !v.corte_conocido && !v.pago_manual : false };
      });
      setTarjetas(t);
    });
  }, [mes, hoy]);

  const gastado = n(res?.gastos);
  const totalDias = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
  const diaHoy = Number(hoy.slice(8, 10));
  const proyCierre = diaHoy >= 3 ? (gastado / diaHoy) * totalDias : null;

  const visibles = saldos.filter((s) => s.activa);
  const creditos = visibles.filter((s) => s.tipo === "credito" && (s.mia || s.conjunta));
  const prestamos = visibles.filter((s) => s.tipo === "prestamo" && (s.mia || s.conjunta));
  const pagoMensual = Object.fromEntries(cuentas.map((c) => [c.id, n(c.pago_mensual)]));
  // Pago del préstamo que falta este mes (pago mensual menos lo que ya abonaste)
  const faltaPrestamo = (id: string) => Math.max(0, Math.min(pagoMensual[id], -n(saldos.find((x) => x.id === id)?.saldo)) - (abonosPrestamo[id] ?? 0));
  const ordenTipo = ["debito", "ahorro", "efectivo", "inversion", "prestamo", "credito"];
  const otrasCuentas = visibles.filter((s) => !creditos.includes(s))
    .sort((a, b) => Number(!(a.mia || a.conjunta)) - Number(!(b.mia || b.conjunta)) || ordenTipo.indexOf(a.tipo) - ordenTipo.indexOf(b.tipo));
  const tienes = visibles.filter((s) => (s.mia || s.conjunta) && ["debito", "efectivo", "ahorro"].includes(s.tipo)).reduce((a, s) => a + Math.max(0, n(s.saldo)), 0);
  const porPagarTarjetas = Object.values(tarjetas).reduce((a, t) => a + t.falta, 0);
  const pagadoTarjetas = Object.values(tarjetas).reduce((a, t) => a + t.pagado_mes, 0);
  const porPagarPrestamos = prestamos.reduce((a, p) => a + faltaPrestamo(p.id), 0);
  const sobra = tienes - porPagarTarjetas - porPagarPrestamos;

  const proximos = [
    ...subs.map((x) => ({ ...x, id: "", tipo: "sub" as const })),
    ...creditos.filter((c) => tarjetas[c.id]?.falta > 0 && tarjetas[c.id].fecha_pago && diasEntre(hoy, tarjetas[c.id].fecha_pago!) <= 10)
      .map((c) => ({ id: c.id, t: `Pago ${c.nombre}`, f: tarjetas[c.id].fecha_pago!, m: tarjetas[c.id].falta, tipo: "tarjeta" as const })),
    ...prestamos.filter((p) => faltaPrestamo(p.id) > 0 && p.proximo_pago && diasEntre(hoy, p.proximo_pago) <= 10)
      .map((p) => ({ id: p.id, t: `Pago ${p.nombre}`, f: p.proximo_pago!, m: faltaPrestamo(p.id), tipo: "prestamo" as const })),
  ].sort((a, b) => a.f.localeCompare(b.f));

  const grupos = agruparCategorias(cats);
  const mesTxt = nombreMes(mes).split(" ")[0];
  // Mensualidades: cuánto pagas de compras a meses cada mes (según el corte de cada tarjeta)
  const mesCap = (m: string) => { const t = nombreMes(m).split(" ")[0]; return t[0].toUpperCase() + t.slice(1); };
  const proyMsi = proyeccionMsi(msi, mes, 12).map((p) => ({ ...p, etiqueta: mesCap(p.mes), monto: p.total }));
  const msiHoy = proyMsi[0]?.monto ?? 0;
  const deOtros = proyMsi[0]?.otros ?? 0;
  const debesMsi = msi.reduce((a, x) => a + x.por_facturar, 0);
  const teDebenMsi = msi.reduce((a, x) => a + x.por_facturar * x.fraccionOtros, 0);
  const baja = proyMsi.find((p) => p.monto < msiHoy - 0.5);
  const porTarjeta = Object.entries(msi.filter((x) => x.primer_mes <= mes && x.ultimo_mes >= mes)
    .reduce((acc: Record<string, number>, x) => { acc[x.cuenta ?? "Sin tarjeta"] = (acc[x.cuenta ?? "Sin tarjeta"] ?? 0) + n(x.mensualidad); return acc; }, {}))
    .sort((a, b) => b[1] - a[1]);

  return (
    <>
      <header className="cabeza">
        <div>
          <div className="sub">Hola, {yo?.nombre}</div>
          <h1>{(() => { const t = nombreMes(mes).replace(" de ", " "); return t[0].toUpperCase() + t.slice(1); })()}</h1>
        </div>
      </header>

      {proximos.length > 0 && (
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
      )}

      {cuentas.length === 0 && (
        <Link className="aviso" to="/ajustes/cuentas"><span><strong>Empieza agregando tus cuentas</strong> con su saldo de hoy: débito, tarjetas y ahorro.</span></Link>
      )}

      <section className="tablero" aria-label="Resumen del mes">
        <div className="tablero-texto">
          <div className="etiqueta">Llevas gastado en {mesTxt}</div>
          <div className="cifra">{fmt(gastado, false)}</div>
          {proyCierre !== null && <div className="sub">A este ritmo cerrarías el mes en <b>{fmt(proyCierre, false)}</b>.</div>}
        </div>
        <div className="tablero-trio">
          <div><div className="k">Ingresos</div><div className="v pos">{fmt(res?.ingresos, false)}</div></div>
          <div><div className="k">Gastos</div><div className="v">{fmt(gastado, false)}</div></div>
          <div><div className="k">Ahorro</div><div className={"v " + (n(res?.ahorro) < 0 ? "neg" : "")}>{fmt(res?.ahorro, false)}</div></div>
        </div>
      </section>

      {n(res?.por_revisar) > 0 && (
        <Link className="aviso rojo" to="/pendientes"><span><strong>{res!.por_revisar} por revisar:</strong> movimientos sin clasificar o partes compartidas sin categoría.</span></Link>
      )}
      {otros.length > 0 && balance.map((b) => Math.abs(b.me_debe) >= 0.5 && (
        <Link key={b.nombre} className={"aviso " + (b.me_debe > 0 ? "verde" : "")} to="/hogar">
          <span>{b.me_debe > 0 ? <><strong>{b.nombre} te debe {fmt(b.me_debe)}</strong> de gastos compartidos.</> : <><strong>Le debes {fmt(-b.me_debe)} a {b.nombre}</strong> de gastos compartidos.</>}</span>
        </Link>
      ))}

      {listo && (
        <section className="panel">
          <div className="panel-cabeza"><h2>Tu dinero este mes</h2></div>
          <div className={"veredicto " + (sobra >= 0 ? "pos" : "neg")}>
            <div className="k">{sobra >= 0 ? "Te sobra al cubrir todo" : "Te falta para cubrir todo"}</div>
            <div className="v">{fmt(Math.abs(sobra), false)}</div>
          </div>
          <BarrasFlujo tienes={tienes} tarjetas={porPagarTarjetas} porGastar={porPagarPrestamos} />
          {pagadoTarjetas > 0 && <p className="nota">Este mes ya pagaste <b>{fmt(pagadoTarjetas, false)}</b> a tus tarjetas.</p>}
        </section>
      )}

      {creditos.length > 0 && (
        <>
          <h2>Tarjetas</h2>
          <div className="lista">
            {creditos.map((c) => {
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
      )}

      {msi.length > 0 && (
        <section className="panel">
          <div className="panel-cabeza"><h2>Mensualidades</h2><Link to="/msi" className="enlace-chico">Ver detalle</Link></div>
          <div className="stats" style={{ borderTop: 0, marginTop: 0, paddingTop: 0, marginBottom: 10 }}>
            <div><div className="k">Este mes</div><div className="v">{fmt(msiHoy, false)}</div></div>
            <div><div className="k">Debes en total</div><div className="v">{fmt(debesMsi, false)}</div></div>
            <div><div className="k">De eso te deben</div><div className="v positivo">{fmt(teDebenMsi, false)}</div></div>
          </div>
          <BarrasMes datos={proyMsi} promedio={0} proyeccion serie="Mensualidades" />
          <div className="msi-tarjetas">
            {porTarjeta.map(([t, v]) => <span key={t}><b>{t}</b> {fmt(v, false)}</span>)}
          </div>
          <p className="nota">
            {baja ? <>En {baja.etiqueta.toLowerCase()} bajan a <b>{fmt(baja.monto, false)}</b> al terminar algunas compras.</> : "Sin cambios en los próximos 12 meses."}
            {deOtros > 0.5 && <> De este mes, <b>{fmt(deOtros, false)}</b> son la parte de otras personas.</>}
          </p>
        </section>
      )}

      {listo && gastado > 0 && (
        <section className="panel">
          <div className="panel-cabeza"><h2>Ritmo de gasto</h2><Link to="/movimientos" className="enlace-chico">Ver movimientos</Link></div>
          <RitmoGasto diario={diario} dias={totalDias} hoy={diaHoy} presupuesto={0} mesTxt={mesTxt} />
        </section>
      )}

      {grupos.length > 0 && (
        <section className="panel">
          <div className="panel-cabeza"><h2>En qué se va</h2><Link to="/analisis" className="enlace-chico">Análisis</Link></div>
          <DesgloseCategorias cats={todasCats ? grupos : grupos.slice(0, 6)} total={grupos.reduce((a, c) => a + c.total, 0)} />
          {grupos.length > 6 && <button className="boton claro chico ancho" style={{ marginTop: 12 }} onClick={() => setTodasCats(!todasCats)}>{todasCats ? "Ver menos" : `Ver las ${grupos.length} categorías`}</button>}
        </section>
      )}

      <h2>Cuentas</h2>
      <div className="lista">
        {otrasCuentas.length === 0 && <div className="vacio">Sin otras cuentas. <Link to="/ajustes/cuentas">Agregar</Link></div>}
        {otrasCuentas.map((s, i) => {
          const nuevoGrupo = i === 0 || otrasCuentas[i - 1].tipo !== s.tipo || otrasCuentas[i - 1].mia !== s.mia;
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
      {subs.length === 0 && proximos.length === 0 && (
        <p className="nota" style={{ display: "flex", gap: 6, alignItems: "center" }}><CalendarClock size={16} /> Sin pagos en los próximos días.</p>
      )}
    </>
  );
}

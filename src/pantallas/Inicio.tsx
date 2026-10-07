import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, ChevronRight, CreditCard, Repeat } from "lucide-react";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { diasEntre, fechaCorta, fmt, hoyISO, mesISO, nombreMes, proximoCobro, sumarMes, TIPOS_CUENTA } from "../util";
import { IconoCategoria, IconoCuenta } from "../iconos";
import { Anillo, BarrasFlujo, BarrasMes, RitmoGasto } from "../graficas";

type Saldo = { id: string; nombre: string; tipo: string; mia: boolean; conjunta: boolean; propietario_nombre: string | null;
  saldo: number; limite_credito: number | null; proximo_pago: string | null; msi_por_facturar: number; activa: boolean };
type Resumen = { ingresos: number; gastos: number; ahorro: number; presupuesto: number; por_revisar: number; dias_restantes: number | null };
type CatRes = { categoria_id: string | null; nombre: string; presupuesto: number; gastado: number };
type Tarjeta = { id: string; falta: number; fecha_pago: string | null; pagado_mes: number; estimado: boolean };

const n = (x: unknown) => Number(x ?? 0);

export default function Inicio() {
  const { yo, otros, cuentas, categorias } = useApp();
  const [saldos, setSaldos] = useState<Saldo[]>([]);
  const [res, setRes] = useState<Resumen | null>(null);
  const [cats, setCats] = useState<CatRes[]>([]);
  const [diario, setDiario] = useState<Record<number, number>>({});
  const [tarjetas, setTarjetas] = useState<Record<string, Tarjeta>>({});
  const [balance, setBalance] = useState<{ nombre: string; me_debe: number }[]>([]);
  const [subs, setSubs] = useState<{ t: string; f: string; m: number }[]>([]);
  const [todasCats, setTodasCats] = useState(false);
  const [listo, setListo] = useState(false);
  const [msi, setMsi] = useState<any[]>([]);
  const mes = mesISO();
  const hoy = hoyISO();

  useEffect(() => {
    Promise.all([
      sb.rpc("saldos_cuentas"), sb.rpc("resumen_mes", { p_mes: mes }), sb.rpc("resumen_categorias", { p_mes: mes }),
      sb.rpc("balance_hogar"), sb.from("suscripciones").select("servicio, monto, frecuencia_meses, fecha_referencia").eq("activa", true),
      sb.rpc("gasto_diario", { p_mes: mes }), sb.rpc("msi_detalle"),
    ]).then(async ([s, r, c, b, su, g, md]) => {
      setMsi(((md.data ?? []) as any[]).filter((x) => x.estado === "Activa"));
      const lista = (s.data ?? []) as Saldo[];
      setSaldos(lista);
      setRes(((r.data ?? [])[0] ?? null) as Resumen | null);
      setCats((c.data ?? []) as CatRes[]);
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

  const presupuesto = n(res?.presupuesto);
  const gastado = n(res?.gastos);
  const dias = res?.dias_restantes ?? 1;
  const totalDias = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
  const diaHoy = Number(hoy.slice(8, 10));
  const avanceMes = Math.min(1, diaHoy / totalDias);
  const usado = presupuesto > 0 ? gastado / presupuesto : 0;
  const restante = Math.max(0, presupuesto - gastado);
  const puedes = presupuesto > 0 ? restante / Math.max(1, dias) : null;

  const visibles = saldos.filter((s) => s.activa);
  const creditos = visibles.filter((s) => s.tipo === "credito" && (s.mia || s.conjunta));
  const ordenTipo = ["debito", "ahorro", "efectivo", "inversion", "credito"];
  const otrasCuentas = visibles.filter((s) => !creditos.includes(s))
    .sort((a, b) => Number(!(a.mia || a.conjunta)) - Number(!(b.mia || b.conjunta)) || ordenTipo.indexOf(a.tipo) - ordenTipo.indexOf(b.tipo));
  const tienes = visibles.filter((s) => (s.mia || s.conjunta) && ["debito", "efectivo", "ahorro"].includes(s.tipo)).reduce((a, s) => a + Math.max(0, n(s.saldo)), 0);
  const porPagarTarjetas = Object.values(tarjetas).reduce((a, t) => a + t.falta, 0);
  const pagadoTarjetas = Object.values(tarjetas).reduce((a, t) => a + t.pagado_mes, 0);
  const sobra = tienes - porPagarTarjetas - restante;

  const proximos = [
    ...subs.map((x) => ({ ...x, id: "", tipo: "sub" as const })),
    ...creditos.filter((c) => tarjetas[c.id]?.falta > 0 && tarjetas[c.id].fecha_pago && diasEntre(hoy, tarjetas[c.id].fecha_pago!) <= 10)
      .map((c) => ({ id: c.id, t: `Pago ${c.nombre}`, f: tarjetas[c.id].fecha_pago!, m: tarjetas[c.id].falta, tipo: "tarjeta" as const })),
  ].sort((a, b) => a.f.localeCompare(b.f));

  const iconoDe = Object.fromEntries(categorias.map((c) => [c.id, c.icono]));
  const conGasto = cats.filter((c) => n(c.presupuesto) > 0 || n(c.gastado) > 0)
    .sort((a, b) => n(b.gastado) - n(a.gastado));
  const maxCat = Math.max(1, ...conGasto.map((c) => Math.max(n(c.gastado), n(c.presupuesto))));
  const mesTxt = nombreMes(mes).split(" ")[0];
  // Mensualidades: cuánto pagas de compras a meses cada mes (según el corte de cada tarjeta)
  const mesCap = (m: string) => { const t = nombreMes(m).split(" ")[0]; return t[0].toUpperCase() + t.slice(1); };
  const proyMsi = Array.from({ length: 12 }, (_, k) => sumarMes(mes, k)).map((m) => ({
    mes: m, etiqueta: mesCap(m), monto: msi.filter((x) => x.primer_mes <= m && x.ultimo_mes >= m).reduce((a, x) => a + n(x.mensualidad), 0),
  }));
  const msiHoy = proyMsi[0]?.monto ?? 0;
  const deOtros = msi.filter((x) => x.familiar && x.primer_mes <= mes && x.ultimo_mes >= mes).reduce((a, x) => a + n(x.mensualidad), 0);
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
                  <span className="ico" aria-hidden="true">{p.tipo === "sub" ? <Repeat size={20} /> : <CreditCard size={20} />}</span>
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
        {puedes !== null ? (
          <div className="tablero-arriba">
            <Anillo usado={usado} avance={avanceMes} />
            <div className="tablero-texto">
              <div className="etiqueta">Puedes gastar hoy</div>
              <div className={"cifra" + (presupuesto - gastado < 0 ? " alerta" : "")}>{fmt(puedes, false)}</div>
              <div className="sub">
                {presupuesto - gastado >= 0
                  ? <>Te quedan <b>{fmt(restante, false)}</b> de {fmt(presupuesto, false)} para {dias} {dias === 1 ? "día" : "días"}.</>
                  : <>Te pasaste <b>{fmt(gastado - presupuesto, false)}</b> del presupuesto.</>}
              </div>
              <div className={"ritmo " + (usado > 1 ? "exceso" : usado > avanceMes + 0.05 ? "rapido" : "ok")}>
                {usado > 1 ? "Presupuesto rebasado" : usado > avanceMes + 0.05 ? "Vas más rápido que el mes" : "Vas a buen ritmo"}
              </div>
            </div>
          </div>
        ) : (
          <Link className="tablero-cta" to="/ajustes/categorias"><b>Define tu presupuesto mensual</b> para saber cuánto puedes gastar cada día. <ChevronRight size={18} /></Link>
        )}
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
          <BarrasFlujo tienes={tienes} tarjetas={porPagarTarjetas} porGastar={restante} />
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
            <div><div className="k">Compras activas</div><div className="v">{msi.length}</div></div>
            <div><div className="k">Por pagar</div><div className="v">{fmt(msi.reduce((a, x) => a + n(x.por_facturar), 0), false)}</div></div>
          </div>
          <BarrasMes datos={proyMsi} promedio={0} proyeccion serie="Mensualidades" />
          <div className="msi-tarjetas">
            {porTarjeta.map(([t, v]) => <span key={t}><b>{t}</b> {fmt(v, false)}</span>)}
          </div>
          <p className="nota">
            {baja ? <>En {baja.etiqueta.toLowerCase()} bajan a <b>{fmt(baja.monto, false)}</b> al terminar algunas compras.</> : "Sin cambios en los próximos 12 meses."}
            {deOtros > 0 && <> De este mes, <b>{fmt(deOtros, false)}</b> son de compras que te pagan otras personas.</>}
          </p>
        </section>
      )}

      {presupuesto > 0 && listo && (
        <section className="panel">
          <div className="panel-cabeza"><h2>Ritmo de gasto</h2><Link to="/movimientos" className="enlace-chico">Ver movimientos</Link></div>
          <RitmoGasto diario={diario} dias={totalDias} hoy={diaHoy} presupuesto={presupuesto} mesTxt={mesTxt} />
        </section>
      )}

      {conGasto.length > 0 && (
        <section className="panel">
          <div className="panel-cabeza"><h2>En qué se va</h2><Link to="/analisis" className="enlace-chico">Análisis</Link></div>
          <div className="cats">
            {(todasCats ? conGasto : conGasto.slice(0, 6)).map((c) => {
              const g = n(c.gastado), p = n(c.presupuesto);
              const exceso = p > 0 && g > p;
              return (
                <div className="cat" key={c.nombre}>
                  <IconoCategoria nombre={c.nombre} icono={c.categoria_id ? iconoDe[c.categoria_id] : null} />
                  <div className="cat-cuerpo">
                    <div className="cat-linea"><span className="cat-nombre">{c.nombre}</span>
                      <span className={"cat-monto" + (exceso ? " neg" : "")}>{fmt(g, false)}{p > 0 && <small> / {fmt(p, false)}</small>}</span></div>
                    <div className="cat-riel">
                      <span className={exceso ? "alerta" : ""} style={{ width: `${(Math.min(g, p > 0 ? Math.max(g, p) : g) / maxCat) * 100}%` }} />
                      {p > 0 && <i style={{ left: `${(p / maxCat) * 100}%` }} title="Presupuesto" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {conGasto.length > 6 && <button className="boton claro chico ancho" style={{ marginTop: 10 }} onClick={() => setTodasCats(!todasCats)}>{todasCats ? "Ver menos" : `Ver las ${conGasto.length}`}</button>}
          <p className="nota">La marca vertical es el presupuesto de cada categoría.</p>
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
            {nuevoGrupo && <div className="subgrupo">{s.mia || s.conjunta ? ({ debito: "Débito", ahorro: "Ahorro", efectivo: "Efectivo", inversion: "Inversión", credito: "Crédito" } as Record<string, string>)[s.tipo] ?? "Otras" : "De tu pareja"}</div>}
            <Fila className="fila" to={`/cuenta/${s.id}`}>
              <IconoCuenta tipo={s.tipo} conjunta={s.conjunta} />
              <div className="cuerpo"><div className="titulo">{s.nombre}</div><div className="detalle">{dueno}</div></div>
              <div className={"monto " + (n(s.saldo) < 0 ? "negativo" : "")}>{fmt(s.saldo)}</div>
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

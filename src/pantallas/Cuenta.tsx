import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza, Campo } from "../ui";
import { diasEntre, errorTexto, fechaCorta, fechaLarga, fmt, hoyISO, limpiarMonto, mesISO, TIPOS_CUENTA } from "../util";
import { IconoMov, lineaMov, SELECT_MOV, type Mov } from "./Movimientos";
import { cargarCobros, textoEstado, type EstadoMov } from "../cobros";

type Detalle = {
  saldo: number; tipo: string; nombre: string; limite: number | null; dia_corte: number | null; dia_pago: number | null;
  mes_gastos: number; mes_ingresos: number; mes_entradas: number; mes_salidas: number;
  ultimo_corte?: string; proximo_corte?: string; fecha_pago?: string; fecha_pago_siguiente?: string;
  corte_conocido?: boolean; pago_manual?: boolean; pago_corte?: number; pagado_desde_corte?: number; msi_por_facturar?: number;
  periodo_contado?: number; periodo_msi_nuevas?: number; periodo_devoluciones?: number; mensualidades_proximo?: number;
  msi?: { id: string; descripcion: string; meses: number; mensualidad: number; facturadas: number; restantes: number }[];
};

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
  const { uid, otros, yo, aviso, familiares } = useApp();
  const [d, setD] = useState<Detalle | null>(null);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [fallo, setFallo] = useState("");
  const [cobros, setCobros] = useState<Record<string, EstadoMov[]>>({});
  const nombres = useMemo(() => Object.fromEntries([...otros, ...(yo ? [yo] : [])].map((m) => [m.user_id, m.nombre])), [otros, yo]);

  const cargar = useCallback(async () => {
    const r = await sb.rpc("detalle_cuenta", { p_cuenta: id });
    if (r.error) { setFallo(errorTexto(r.error)); return; }
    const det = r.data as Detalle;
    setD(det);
    const desde = det.tipo === "credito" && det.ultimo_corte ? det.ultimo_corte : null;
    let q = sb.from("movimientos").select(SELECT_MOV).or(`cuenta_id.eq.${id},cuenta_destino_id.eq.${id}`);
    q = desde ? q.gt("fecha", desde) : q.gte("fecha", mesISO());
    const m = await q.order("fecha", { ascending: false }).order("created_at", { ascending: false });
    setMovs((m.data ?? []).filter((x: any) => x.origen !== "Saldo inicial"));
    cargarCobros().then((c) => setCobros(c.movs));
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);



  if (fallo && !d) return (<><Cabeza titulo="Cuenta" volver /><p className="error" role="alert">{fallo}</p></>);
  if (!d) return (<><Cabeza titulo="Cuenta" volver /><div className="vacio">Cargando…</div></>);

  const credito = d.tipo === "credito" && d.ultimo_corte;
  const deuda = Math.max(0, -n(d.saldo));
  const limite = n(d.limite);
  const usado = limite > 0 ? deuda / limite : 0;

  const lista = (
    <div className="lista">
      {movs.length === 0 && <div className="vacio">{credito ? "Sin movimientos desde el corte." : "Sin movimientos este mes."}</div>}
      {movs.map((m) => {
        const l = lineaMov(m, uid, nombres);
        const entra = m.cuenta_destino_id === id || ["ingreso", "reembolso"].includes(m.tipo);
        const editable = m.tipo !== "liquidacion" && (l.mio || l.miParte);
        const Fila: any = editable ? Link : "div";
        return (
          <Fila className="fila" key={m.id} {...(editable ? { to: `/editar/${m.id}` } : {})}>
            <IconoMov m={m} />
            <div className="cuerpo">
              <div className="titulo">{l.titulo}</div>
              <div className="detalle">
                {m.meses_msi && <span className="etiq">{m.meses_msi} MSI</span>}
                {m.en_saldo_inicial && <span className="etiq">Ya en el saldo</span>}
                {(cobros[m.id] ?? []).map((e) => <EtiqPersona key={e.familiar_id} nombre={familiares.find((f) => f.id === e.familiar_id)?.nombre ?? "Otra persona"} e={e} />)}
                {fechaCorta(m.fecha)}{l.detalle && m.tipo !== "gasto" ? ` · ${l.detalle}` : textoCat(m)}
              </div>
            </div>
            <div className={"monto " + (entra ? "positivo" : "")}>{entra ? "+" : "−"}{fmt(m.monto)}</div>
          </Fila>
        );
      })}
    </div>
  );

  if (!credito) {
    const entradas = n(d.mes_ingresos) + n(d.mes_entradas);
    return (
      <>
        <Cabeza titulo={d.nombre} volver />
        <section className="heroe">
          <div className="etiqueta">{TIPOS_CUENTA[d.tipo] ?? "Cuenta"} · saldo</div>
          <div className={"cifra" + (n(d.saldo) < 0 ? " alerta" : "")}>{fmt(d.saldo, false)}</div>
        </section>
      <div className="acciones" style={{ marginTop: 12 }}><Link className="boton" to={`/nuevo?cuenta=${id}`}>+ Registrar movimiento en {d.nombre}</Link></div>
        <div className="trio">
          <div><div className="k">Entró este mes</div><div className="v positivo">{fmt(entradas, false)}</div></div>
          <div><div className="k">Gastos</div><div className="v">{fmt(d.mes_gastos, false)}</div></div>
          <div><div className="k">Transferido</div><div className="v">{fmt(d.mes_salidas, false)}</div></div>
        </div>
        <h2>Movimientos del mes</h2>
        {lista}
        <p className="nota"><Link to="/ajustes/cuentas">Editar cuenta</Link></p>
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

  return (
    <>
      <Cabeza titulo={d.nombre} volver />
      <section className="heroe">
        <div className="etiqueta">Debes en total</div>
        <div className="cifra">{fmt(deuda, false)}</div>
        <div className="sub">
          {n(d.msi_por_facturar) > 0 ? `Incluye ${fmt(d.msi_por_facturar, false)} de meses sin intereses por venir.` : "Sin compras a meses pendientes."}
        </div>
        {limite > 0 && (
          <div className="franja" aria-hidden="true">
            <div className="riel"><div className={"lleno" + (usado > 0.8 ? " alerta" : "")} style={{ width: `${Math.min(100, usado * 100)}%` }} /></div>
            <div className="leyenda"><span>Usado {Math.round(usado * 100)}%</span><span>Disponible {fmt(limite - deuda, false)} de {fmt(limite, false)}</span></div>
          </div>
        )}
      </section>
      <div className="acciones" style={{ marginTop: 12 }}><Link className="boton" to={`/nuevo?cuenta=${id}`}>+ Registrar movimiento en {d.nombre}</Link></div>

      <h2>Tu pago</h2>
      <div className={"tarjeta-pago" + (vencido ? " vencido" : falta === 0 ? " listo" : "")}>
        <div className="etiqueta">Estado de cuenta del {fechaCorta(d.ultimo_corte!)}</div>
        <div className="cifra-media">{falta === 0 ? "Pagado" : fmt(falta)}</div>
        <div className="sub">
          {falta === 0 ? `Cubriste el pago para no generar intereses${pagoCorte > 0 ? ` (${fmt(pagoCorte)})` : ""}.`
            : <>Para no generar intereses · paga antes del {fechaLarga(d.fecha_pago!)} ({cuando(d.fecha_pago!)})</>}
        </div>
        {pagado > 0 && falta > 0 && <div className="sub">Ya abonaste {fmt(pagado)} de {fmt(pagoCorte)}.</div>}
        {estimado && <p className="nota" style={{ marginBottom: 0 }}>Es un estimado: registraste la tarjeta después de este corte. <Link to={`/ajustes/tarjeta/${id}/cuadrar`}>Cuadrar con mi estado de cuenta</Link></p>}
        {d.pago_manual && <p className="nota" style={{ marginBottom: 0 }}>Tomado de tu estado de cuenta.</p>}
        {falta > 0 && (
          <div className="acciones"><Link className="boton" to={`/nuevo?tipo=transferencia&destino=${id}`}>Registrar pago</Link></div>
        )}
      </div>

      <h2>Periodo actual</h2>
      <p className="nota" style={{ marginTop: -4, marginBottom: 8 }}>Del {fechaCorta(addDia(d.ultimo_corte!))} al {fechaCorta(d.proximo_corte!)} (corte). Se paga antes del {fechaCorta(d.fecha_pago_siguiente!)}.</p>
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

      {(d.msi?.length ?? 0) > 0 && (
        <>
          <h2>Meses sin intereses</h2>
          <div className="lista">
            {d.msi!.map((x) => (
              <Link className="fila" key={x.id} to={`/editar/${x.id}`}>
                <div className="cuerpo"><div className="titulo">{x.descripcion}</div>
                  <div className="detalle">
                    {(cobros[x.id] ?? []).map((e) => <EtiqPersona key={e.familiar_id} nombre={familiares.find((f) => f.id === e.familiar_id)?.nombre ?? "Otra persona"} e={e} />)}
                    {x.facturadas} de {x.meses} cobradas · faltan {x.restantes}</div>
                  <div className="barra"><span style={{ width: `${(x.facturadas / x.meses) * 100}%` }} /></div></div>
                <div className="monto">{fmt(x.mensualidad)}<small>al mes</small></div>
              </Link>
            ))}
          </div>
          <p className="nota">Por facturar: {fmt(d.msi_por_facturar)}. <Link to="/msi">Ver proyección</Link></p>
        </>
      )}

      <h2>Movimientos desde el corte</h2>
      {lista}
      {fallo && <p className="error" role="alert">{fallo}</p>}
      <div className="acciones"><Link className="boton claro" to={`/ajustes/tarjeta/${id}/cuadrar`}>Cuadrar con mi estado de cuenta</Link></div>
      <p className="nota">Corte día {d.dia_corte} · pago día {d.dia_pago}. <Link to="/ajustes/cuentas">Editar tarjeta</Link></p>
    </>
  );
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

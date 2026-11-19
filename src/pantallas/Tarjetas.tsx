import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza, Cargando, Seccion } from "../ui";
import { CaretRight, Plus } from "../phosphor";
import { IconoCuenta } from "../iconos";
import { diasEntre, fechaCorta, fmt, hoyISO, mesISO } from "../util";
import { cargarCobros, cuentasDelCorte, type Persona } from "../cobros";
import { guardarCache, leerCache } from "../cache";

// Lo que la pestaña usa de detalle_cuenta de cada tarjeta
type Det = {
  saldo: number; limite: number | null; ultimo_corte?: string; proximo_corte?: string; fecha_pago?: string;
  corte_conocido?: boolean; pago_manual?: boolean; pago_corte?: number; pagado_desde_corte?: number;
  periodo_contado?: number; periodo_devoluciones?: number; mensualidades_proximo?: number;
};

const n = (x: unknown) => Number(x ?? 0);
const enDias = (f: string) => {
  const d = diasEntre(hoyISO(), f);
  return d === 0 ? "hoy" : d === 1 ? "mañana" : d < 0 ? `venció hace ${-d} ${d === -1 ? "día" : "días"}` : `en ${d} días`;
};

// Pestaña Tarjetas: qué pagar y cuándo, y cómo va el periodo abierto de cada tarjeta (lo que llevas y lo que te deben)
export default function Tarjetas() {
  const { uid, cuentas, familiares } = useApp();
  const [det, setDet] = useState<Record<string, Det> | null>(() => leerCache(uid, "tarjetas"));
  const [personas, setPersonas] = useState<Record<string, Persona>>({});
  const [fallo, setFallo] = useState(false);
  useEffect(() => {
    sb.rpc("detalle_tarjetas").then(({ data, error }) => {
      if (error || !data) return setFallo(true);
      setDet(data as Record<string, Det>);
      guardarCache(uid, "tarjetas", data);
    }, () => setFallo(true));
    cargarCobros().then((c) => setPersonas(c.personas), () => {});
  }, [uid]);

  const tarjetas = cuentas.filter((c) => c.tipo === "credito" && c.activa && (c.propietario_id === uid || !c.propietario_id) && det?.[c.id]).map((c) => {
    const d = det![c.id];
    const falta = Math.max(0, Math.round((n(d.pago_corte) - n(d.pagado_desde_corte)) * 100) / 100);
    const llevas = Math.max(0, n(d.periodo_contado) + n(d.mensualidades_proximo) - n(d.periodo_devoluciones));
    // Lo que te deben en esta tarjeta: del corte que pagas ahora y del periodo abierto
    const deCorte = d.ultimo_corte ? cuentasDelCorte(personas, c.id, mesISO(d.ultimo_corte)) : [];
    const deAbierto = d.proximo_corte ? cuentasDelCorte(personas, c.id, mesISO(d.proximo_corte)) : [];
    return { c, d, falta, llevas, deudaTotal: Math.max(0, -n(d.saldo)), limite: n(d.limite),
      debenCorte: deCorte.reduce((a, x) => a + x.falta, 0), otrosAbierto: deAbierto.reduce((a, x) => a + x.total, 0),
      quienes: deAbierto.map((x) => familiares.find((f) => f.id === x.id)?.nombre ?? "Otra persona"),
      estimado: !d.corte_conocido && !d.pago_manual };
  });

  if (!det) return <><Cabeza titulo="Tarjetas" />{fallo ? <p className="error" role="alert">No se pudieron cargar tus tarjetas. Revisa tu conexión.</p> : <Cargando />}</>;

  const porPagar = tarjetas.filter((t) => t.falta > 0 && t.d.fecha_pago).sort((a, b) => a.d.fecha_pago!.localeCompare(b.d.fecha_pago!));
  const abiertos = tarjetas.filter((t) => t.d.proximo_corte).sort((a, b) => a.d.proximo_corte!.localeCompare(b.d.proximo_corte!));
  const totalPagar = porPagar.reduce((a, t) => a + t.falta, 0);
  const totalDeben = tarjetas.reduce((a, t) => a + t.debenCorte, 0);
  const deuda = tarjetas.reduce((a, t) => a + t.deudaTotal, 0);
  const limite = tarjetas.reduce((a, t) => a + t.limite, 0);

  return (
    <>
      <Cabeza titulo="Tarjetas" accion={<Link to="/ajustes/tarjeta-nueva" className="boton-icono acento" aria-label="Agregar tarjeta"><Plus size={22} /></Link>} />
      <section className="tablero" aria-label="Resumen de tus tarjetas">
        <div className="etiqueta">Por pagar para no generar intereses</div>
        <div className="cifra">{fmt(totalPagar, false)}</div>
        <div className="sub">{porPagar.length ? <>La próxima: <b>{porPagar[0].c.nombre}</b> {enDias(porPagar[0].d.fecha_pago!)} ({fechaCorta(porPagar[0].d.fecha_pago!)})</> : "Todas tus tarjetas están al corriente."}</div>
        <div className="tablero-trio">
          <div><div className="k">Te deben de esos cortes</div><div className="v pos">{fmt(totalDeben, false)}</div></div>
          <div><div className="k">Debes en total</div><div className="v">{fmt(deuda, false)}</div></div>
          <div><div className="k">Disponible</div><div className="v">{limite > 0 ? fmt(limite - deuda, false) : "—"}</div></div>
        </div>
      </section>

      {porPagar.length > 0 && (
        <Seccion titulo="Por pagar" contador={porPagar.length} ayuda="Del corte que ya cerró; «te deben» es la parte de otras personas en ese corte que aún no te pagan">
          <div className="lista">
            {porPagar.map((t) => {
              const d = diasEntre(hoyISO(), t.d.fecha_pago!);
              return (
                <Link key={t.c.id} className="fila" to={`/cuenta/${t.c.id}`}>
                  <IconoCuenta tipo="credito" conjunta={!t.c.propietario_id} />
                  <div className="cuerpo">
                    <div className="titulo">{t.c.nombre}</div>
                    <div className="detalle"><span className={"etiq" + (d <= 3 ? " roja" : "")}>{enDias(t.d.fecha_pago!)} · {fechaCorta(t.d.fecha_pago!)}</span></div>
                    <div className="detalle">{t.debenCorte > 0.5 ? <>Te deben <b className="positivo">{fmt(t.debenCorte, false)}</b></> : "Todo es tuyo"}</div>
                  </div>
                  <div className="monto">{fmt(t.falta, false)}{t.estimado ? "*" : ""}<small>{t.debenCorte > 0.5 ? `tu parte ${fmt(Math.max(0, t.falta - t.debenCorte), false)}` : "pagar"}</small></div>
                  <CaretRight size={16} className="flecha" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
          {porPagar.some((t) => t.estimado) && <p className="nota">* Estimado: registraste la tarjeta después de ese corte.</p>}
        </Seccion>
      )}

      <Seccion titulo="Periodos abiertos" ayuda="Lo que llevas en cada tarjeta para su próximo corte, de la que cierra antes a la que cierra después">
        <div className="lista">
          {abiertos.length === 0 && <div className="vacio">Agrega tus tarjetas con su día de corte para ver sus periodos. <Link to="/ajustes/tarjeta-nueva">Agregar tarjeta</Link></div>}
          {abiertos.map((t) => {
            const d = diasEntre(hoyISO(), t.d.proximo_corte!);
            return (
              <Link key={t.c.id} className="fila" to={`/cuenta/${t.c.id}`}>
                <IconoCuenta tipo="credito" conjunta={!t.c.propietario_id} />
                <div className="cuerpo">
                  <div className="titulo">{t.c.nombre}</div>
                  <div className="detalle"><span className={"etiq" + (d <= 3 ? " roja" : "")}>Corta {enDias(t.d.proximo_corte!)} · {fechaCorta(t.d.proximo_corte!)}</span></div>
                  <div className="detalle">{t.otrosAbierto > 0.5 ? <>De otros <b className="positivo">{fmt(t.otrosAbierto, false)}</b> · {t.quienes.join(", ")}</> : "Todo es tuyo"}</div>
                  {t.limite > 0 && <div className="barra"><span className={t.deudaTotal / t.limite > 0.8 ? "alerta" : ""} style={{ width: `${Math.min(100, (t.deudaTotal / t.limite) * 100)}%` }} /></div>}
                </div>
                <div className="monto">{fmt(t.llevas, false)}<small>llevas</small></div>
                <CaretRight size={16} className="flecha" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
        <p className="nota">«Llevas» suma las compras de contado y las mensualidades de este corte, menos devoluciones. La barra es cuánto usas del límite.</p>
      </Seccion>
    </>
  );
}

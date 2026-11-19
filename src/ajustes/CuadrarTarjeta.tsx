import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza, Campo, Cargando, Seccion, Segmentos, useUnaVez } from "../ui";
import { FilePdf } from "../phosphor";
import { conDia, diasEntre, errorTexto, fechaCorta, fmt, limpiarMonto, mesISO, sumarMes } from "../util";
import { cargarMensualidades, fechaParaPago, type FilaMsi } from "./saldosTarjeta";
import { leerEstado, textoDePdf, type EstadoLeido, type MovLeido } from "../leerEstado";

type Det = {
  nombre: string; saldo: number; dia_corte: number; ultimo_corte: string; fecha_pago: string; pago_corte: number; pagado_desde_corte: number;
  msi_por_facturar: number; saldo_calculado: boolean; banco_incluye_msi: boolean;
};
type MovApp = { id: string; fecha: string; monto: number; tipo: string; descripcion: string | null; comercio: string | null; cuenta_destino_id: string | null };

const n = (x: unknown) => Number(x ?? 0);
const igual = (a: number, b: number) => Math.abs(a - b) < 0.5;

// Cuadrar una tarjeta con el banco. No cambia la deuda: compara lo que calcula la app con el estado de cuenta (a mano
// o leyendo el PDF) o con el saldo de hoy, y señala qué revisar. La primera vez cambia la tarjeta a deuda calculada:
// empieza en ese corte, con lo que aún no pagas de ese estado de cuenta como un cargo visible.
export default function CuadrarTarjeta() {
  const { id = "" } = useParams();
  const { cuentas, recargar, aviso } = useApp();
  const nav = useNavigate();
  const unaVez = useUnaVez();
  const c = cuentas.find((x) => x.id === id);
  const [d, setD] = useState<Det | null>(null);
  const [modo, setModo] = useState<"estado" | "saldo">("estado");
  const [movs, setMovs] = useState<MovApp[]>([]);
  const [msi, setMsi] = useState<FilaMsi[]>([]);
  const [leido, setLeido] = useState<EstadoLeido | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [pagoBanco, setPagoBanco] = useState("");
  const [saldoCorte, setSaldoCorte] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [nBanco, setNBanco] = useState<Record<string, string>>({});
  const [palomeados, setPalomeados] = useState<Set<string>>(new Set());
  const [saldoHoy, setSaldoHoy] = useState("");
  const [incluyeMsi, setIncluyeMsi] = useState<"si" | "no">("no");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!c?.dia_corte) return;
    sb.rpc("detalle_cuenta", { p_cuenta: id }).then(({ data, error }) => {
      if (error) return setError(errorTexto(error));
      const det = data as Det;
      setD(det); setFechaLimite(det.fecha_pago); setIncluyeMsi(det.banco_incluye_msi ? "si" : "no");
      // Movimientos del corte que cerró (del corte anterior al último), sin las compras a meses: esas se comparan aparte
      const anterior = conDia(sumarMes(mesISO(det.ultimo_corte), -1), det.dia_corte);
      sb.from("movimientos").select("id, fecha, monto, tipo, descripcion, comercio, cuenta_destino_id, meses_msi, origen")
        .or(`cuenta_id.eq.${id},cuenta_destino_id.eq.${id}`).gt("fecha", anterior).lte("fecha", det.ultimo_corte).order("fecha")
        .then(({ data }) => setMovs(((data ?? []) as any[]).filter((m) => !m.meses_msi && m.origen !== "Saldo inicial")));
    });
    cargarMensualidades(id, c.dia_corte).then(setMsi);
  }, [id, c?.dia_corte]);

  // Cada cargo del PDF se empareja con un movimiento de la app del mismo importe y fecha cercana (cada uno una sola vez)
  const emparejados = useMemo(() => {
    const usados = new Set<string>();
    const faltan: MovLeido[] = [];
    for (const p of leido?.movimientos ?? []) {
      const m = movs.find((x) => !usados.has(x.id) && igual(n(x.monto), p.monto) && Math.abs(diasEntre(x.fecha, p.fecha)) <= 4);
      if (m) usados.add(m.id); else faltan.push(p);
    }
    return { usados, faltan };
  }, [leido, movs]);
  useEffect(() => { if (leido) setPalomeados(new Set(emparejados.usados)); }, [emparejados]);

  if (!c) return <><Cabeza titulo="Cuadrar tarjeta" volver /><Cargando /></>;
  if (!c.dia_corte) return <><Cabeza titulo="Cuadrar tarjeta" volver /><p>Primero escribe el día de corte de {c.nombre}. <Link to={`/cuenta/${id}/editar`}>Editar tarjeta</Link></p></>;
  if (!d) return <><Cabeza titulo={`Cuadrar ${c.nombre}`} volver />{error ? <p className="error" role="alert">{error}</p> : <Cargando />}</>;

  async function subirPdf(archivo: File | undefined) {
    if (!archivo) return;
    setError(""); setLeyendo(true);
    try {
      const e = leerEstado(await textoDePdf(archivo));
      setLeido(e);
      if (e.pagoNoIntereses !== null) setPagoBanco(String(e.pagoNoIntereses));
      if (e.saldoCorte !== null) setSaldoCorte(String(e.saldoCorte));
      if (e.fechaLimite) setFechaLimite(e.fechaLimite);
      // El «pago N de M» de cada compra a meses de la app, buscando la del PDF por mensualidad o nombre
      const nb: Record<string, string> = {};
      for (const f of msi) {
        const x = e.msi.find((p) => p.m === Number(f.m) && ((p.mensualidad !== null && Math.abs(p.mensualidad - Number(f.mensualidad)) <= 1)
          || p.descripcion.toLowerCase().includes(f.descripcion.toLowerCase().slice(0, 6))));
        if (x) nb[f.id!] = String(x.n);
      }
      setNBanco(nb);
      if (e.pagoNoIntereses === null && !e.movimientos.length) setError("No encontré cifras en este PDF. Escríbelas a mano y pásame el PDF para enseñarle a la app a leer los de este banco.");
    } catch (e) {
      setError("No pude leer el PDF: " + errorTexto(e));
    } finally {
      setLeyendo(false);
    }
  }

  const pdfDeOtroCorte = leido?.fechaCorte && leido.fechaCorte !== d.ultimo_corte;
  const banco = Number(pagoBanco);
  const difPago = pagoBanco !== "" && d.saldo_calculado ? Math.round((banco - n(d.pago_corte)) * 100) / 100 : null;
  const msiDistintas = msi.filter((f) => nBanco[f.id!] && nBanco[f.id!] !== f.n);
  const sinPalomear = leido ? movs.filter((m) => !palomeados.has(m.id)) : [];

  async function guardarEstado() {
    setError("");
    if (pagoBanco === "") return setError("Escribe el pago para no generar intereses de tu estado de cuenta (puede ser 0).");
    // 1) Compras a meses con otro «pago N de M»: se ajusta su fecha para que cuadren las mensualidades
    for (const f of msiDistintas) {
      const { error } = await sb.from("movimientos").update({ fecha: fechaParaPago(d!.dia_corte, Number(nBanco[f.id!])) }).eq("id", f.id!);
      if (error) return setError(errorTexto(error));
    }
    // 2) La primera vez: la tarjeta empieza en este corte con lo pendiente de este estado de cuenta como cargo visible
    if (!d!.saldo_calculado) {
      const { error } = await sb.rpc("iniciar_deuda_calculada", { p_cuenta: id, p_corte: d!.ultimo_corte, p_pendiente: banco });
      if (error) return setError(errorTexto(error));
    }
    // 3) Fecha límite distinta a la de la regla: solo para este corte
    if (fechaLimite && fechaLimite !== d!.fecha_pago) {
      const { error } = await sb.from("fechas_corte").upsert({ cuenta_id: id, corte: d!.ultimo_corte, fecha_pago: fechaLimite });
      if (error) return setError(errorTexto(error));
    }
    // 4) Lo que calcula la app ahora y el cuadre guardado
    const nuevo = (await sb.rpc("detalle_cuenta", { p_cuenta: id })).data as Det;
    const { error } = await sb.from("cuadres").insert({
      cuenta_id: id, tipo: "estado", fuente: leido ? "pdf" : "manual", corte: d!.ultimo_corte,
      saldo_banco: saldoCorte !== "" ? Number(saldoCorte) : null, pago_banco: banco, pago_app: n(nuevo?.pago_corte),
      datos: { leido: leido ? { ...leido, movimientos: leido.movimientos.length, msi: leido.msi } : null,
        msi: msi.map((f) => ({ id: f.id, app: f.n, banco: nBanco[f.id!] ?? null, de: f.m })), sin_palomear: sinPalomear.map((m) => m.id) },
    });
    if (error) return setError(errorTexto(error));
    await recargar();
    const dif = Math.round((banco - n(nuevo?.pago_corte)) * 100) / 100;
    aviso(igual(dif, 0) ? `${c!.nombre} cuadra con tu estado de cuenta` : `No cuadra por ${fmt(Math.abs(dif))}: revisa los movimientos`);
    nav(`/cuenta/${id}`, { replace: true });
  }

  const deudaApp = Math.max(0, -n(d.saldo));
  const compararCon = incluyeMsi === "si" ? deudaApp : Math.max(0, deudaApp - n(d.msi_por_facturar));
  const difSaldo = saldoHoy !== "" ? Math.round((Number(saldoHoy) - compararCon) * 100) / 100 : null;
  async function guardarSaldo() {
    setError("");
    if (saldoHoy === "") return setError("Escribe el saldo que te muestra hoy la app de tu banco.");
    if ((incluyeMsi === "si") !== d!.banco_incluye_msi) await sb.from("cuentas").update({ banco_incluye_msi: incluyeMsi === "si" }).eq("id", id);
    const { error } = await sb.from("cuadres").insert({ cuenta_id: id, tipo: "saldo", saldo_banco: Number(saldoHoy), saldo_app: compararCon });
    if (error) return setError(errorTexto(error));
    await recargar();
    aviso(igual(difSaldo!, 0) ? `${c!.nombre} cuadra con tu banco` : `No cuadra por ${fmt(Math.abs(difSaldo!))}`);
    nav(`/cuenta/${id}`, { replace: true });
  }

  const textoMov = (m: MovApp) => m.descripcion || m.comercio || (m.cuenta_destino_id === id ? "Pago" : "Movimiento");
  const entra = (m: MovApp) => m.cuenta_destino_id === id || ["ingreso", "reembolso"].includes(m.tipo);

  return (
    <>
      <Cabeza titulo={`Cuadrar ${c.nombre}`} volver />
      {d.saldo_calculado
        ? <Segmentos etiqueta="Con qué cuadrar" valor={modo} onCambio={setModo} opciones={[{ v: "estado", t: "Estado de cuenta" }, { v: "saldo", t: "Saldo de hoy" }]} />
        : <div className="aviso mt-0"><span><strong>Primera vez con el cálculo nuevo.</strong> Cuadra con tu estado de cuenta del {fechaCorta(d.ultimo_corte)}: desde ese corte la deuda saldrá solo de lo que registres, sin «deuda inicial».</span></div>}

      {modo === "estado" ? (
        <>
          <section className="panel mt-12">
            <div className="panel-titulo">Estado de cuenta del {fechaCorta(d.ultimo_corte)}</div>
            <label className="boton claro ancho mb-12">
              <FilePdf size={18} aria-hidden="true" /> {leyendo ? "Leyendo…" : leido ? "Subir otro PDF" : "Subir el PDF del estado de cuenta"}
              <input type="file" accept="application/pdf" hidden onChange={(e) => subirPdf(e.target.files?.[0])} />
            </label>
            {leido && <p className="nota mt-n6 mb-10">Leí del PDF: {[leido.fechaCorte && `corte ${fechaCorta(leido.fechaCorte)}`, leido.pagoNoIntereses !== null && "pago para no generar intereses",
              leido.saldoCorte !== null && "saldo", `${leido.movimientos.length} movimientos`, `${leido.msi.length} compras a meses`].filter(Boolean).join(", ")}. Revisa las cifras.</p>}
            {pdfDeOtroCorte && <p className="error mt-n6">Este PDF es del corte del {fechaCorta(leido!.fechaCorte!)}; aquí se compara el del {fechaCorta(d.ultimo_corte)}.</p>}
            <Campo etiqueta="Pago para no generar intereses"><input className="monto-grande" inputMode="decimal" value={pagoBanco} onChange={(e) => setPagoBanco(limpiarMonto(e.target.value))} placeholder="$0" /></Campo>
            <div className="dos">
              <Campo etiqueta="Saldo al corte (opcional)"><input inputMode="decimal" value={saldoCorte} onChange={(e) => setSaldoCorte(limpiarMonto(e.target.value))} placeholder="$0" /></Campo>
              <Campo etiqueta="Fecha límite de pago"><input type="date" value={fechaLimite} min={d.ultimo_corte} onChange={(e) => setFechaLimite(e.target.value)} /></Campo>
            </div>
            {fechaLimite && fechaLimite !== d.fecha_pago && <p className="nota mt-n6">La app tenía el {fechaCorta(d.fecha_pago)}; se usará el {fechaCorta(fechaLimite)} solo para este corte.</p>}
          </section>

          {d.saldo_calculado ? (
            <div className={"aviso mt-12 " + (difPago === null ? "" : igual(difPago, 0) ? "verde" : "rojo")}>
              <span>{difPago === null ? <>La app calcula <strong>{fmt(d.pago_corte)}</strong> para este corte.</>
                : igual(difPago, 0) ? <><strong>Cuadra.</strong> La app también calcula {fmt(d.pago_corte)}.</>
                : <><strong>No cuadra por {fmt(Math.abs(difPago))}.</strong> La app calcula {fmt(d.pago_corte)}: {difPago > 0 ? "al banco le falta algo que no registraste (un cargo, comisión o mensualidad)" : "registraste algo que el banco no tiene, o falta un pago o devolución"}. Revisa abajo.</>}</span>
            </div>
          ) : pagoBanco !== "" && (
            <p className="nota mt-12">Al guardar, {c.nombre} empieza en el corte del {fechaCorta(d.ultimo_corte)} con <b>{fmt(banco)}</b> pendientes de ese estado de cuenta, como un cargo que verás en sus movimientos.
              {n(d.pagado_desde_corte) > 0 ? <> Ya registraste pagos por <b>{fmt(d.pagado_desde_corte)}</b> desde el corte, que se le restan.</> : " Cuando lo pagues, registra el pago y se cancela."}</p>
          )}

          {msi.length > 0 && (
            <Seccion titulo="Compras a meses" ayuda="El «pago N de M» de cada una, como en tu estado de cuenta">
              <div className="lista">
                {msi.map((f) => {
                  const distinto = !!nBanco[f.id!] && nBanco[f.id!] !== f.n;
                  return (
                    <div className="fila" key={f.id}>
                      <div className="cuerpo"><div className="titulo">{f.descripcion || "Compra a meses"}</div>
                        <div className="detalle">{fmt(Number(f.mensualidad))} al mes · la app lleva {f.n} de {f.m}{distinto ? <> · <span className="etiq roja">se corrige a {nBanco[f.id!]}</span></> : null}</div></div>
                      <input className="input-chico" aria-label={`Pago número de ${f.descripcion}`} inputMode="numeric" value={nBanco[f.id!] ?? f.n}
                        onChange={(e) => setNBanco({ ...nBanco, [f.id!]: e.target.value.replace(/\D/g, "") })} />
                    </div>
                  );
                })}
              </div>
              <p className="nota">¿Falta alguna? <Link to={`/nuevo?cuenta=${id}`}>Regístrala</Link> con su fecha real y los meses.</p>
            </Seccion>
          )}

          {movs.length > 0 && (
            <Seccion titulo="Movimientos del corte" ayuda={leido ? "Palomeados: los que también vienen en el PDF" : "Palomea los que vienen en tu estado de cuenta"}>
              <div className="lista">
                {movs.map((m) => (
                  <label className="fila" key={m.id}>
                    <input type="checkbox" checked={palomeados.has(m.id)} onChange={() => { const s = new Set(palomeados); s.has(m.id) ? s.delete(m.id) : s.add(m.id); setPalomeados(s); }} />
                    <div className="cuerpo"><div className="titulo">{textoMov(m)}</div><div className="detalle">{fechaCorta(m.fecha)}</div></div>
                    <div className={"monto" + (entra(m) ? " positivo" : "")}>{entra(m) ? "−" : ""}{fmt(m.monto)}</div>
                  </label>
                ))}
              </div>
              {leido && sinPalomear.length > 0 && <p className="nota">{sinPalomear.length} {sinPalomear.length === 1 ? "movimiento no aparece" : "movimientos no aparecen"} en el PDF: revisa si la fecha o el importe están bien.</p>}
            </Seccion>
          )}

          {emparejados.faltan.length > 0 && (
            <Seccion titulo="En el banco y no en la app" contador={emparejados.faltan.length}>
              <div className="lista">
                {emparejados.faltan.map((p, i) => (
                  <div className="fila" key={i}>
                    <div className="cuerpo"><div className="titulo">{p.descripcion}</div><div className="detalle">{fechaCorta(p.fecha)}{p.abono ? " · abono" : ""}</div></div>
                    <div className="monto">{fmt(p.monto)}</div>
                    {!p.abono && <Link className="enlace-chico" to={`/nuevo?cuenta=${id}&monto=${p.monto}&fecha=${p.fecha}&desc=${encodeURIComponent(p.descripcion)}`}>Registrar</Link>}
                  </div>
                ))}
              </div>
            </Seccion>
          )}

          {error && <p className="error" role="alert">{error}</p>}
          <div className="acciones"><button className="boton" onClick={unaVez(guardarEstado)}>{d.saldo_calculado ? "Guardar cuadre" : "Empezar desde este corte"}</button></div>
        </>
      ) : (
        <>
          <section className="panel mt-12">
            <Campo etiqueta="Saldo que te muestra hoy la app de tu banco"><input className="monto-grande" inputMode="decimal" value={saldoHoy} onChange={(e) => setSaldoHoy(limpiarMonto(e.target.value))} placeholder="$0" /></Campo>
            {n(d.msi_por_facturar) > 0 && <>
              <span className="campo mb-6"><span>¿Ese saldo incluye los meses que faltan ({fmt(d.msi_por_facturar)})?</span></span>
              <Segmentos etiqueta="Incluye meses" valor={incluyeMsi} onCambio={setIncluyeMsi} opciones={[{ v: "no", t: "No" }, { v: "si", t: "Sí, los incluye" }]} />
            </>}
          </section>
          <div className={"aviso mt-12 " + (difSaldo === null ? "" : igual(difSaldo, 0) ? "verde" : "rojo")}>
            <span>{difSaldo === null ? <>La app calcula <strong>{fmt(compararCon)}</strong>{incluyeMsi === "no" && n(d.msi_por_facturar) > 0 ? " sin los meses por facturar" : ""}.</>
              : igual(difSaldo, 0) ? <><strong>Cuadra.</strong> La app también calcula {fmt(compararCon)}.</>
              : <><strong>No cuadra por {fmt(Math.abs(difSaldo))}.</strong> La app calcula {fmt(compararCon)}. {difSaldo > 0 ? "Puede faltar un cargo por registrar (o uno que el banco ya aplicó y tú tienes con otra fecha)." : "Puede faltar un pago o devolución, o un cargo que el banco aún no aplica."} <Link to={`/cuenta/${id}`}>Ver movimientos</Link></>}</span>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="acciones"><button className="boton" onClick={unaVez(guardarSaldo)}>Guardar cuadre</button></div>
        </>
      )}
    </>
  );
}

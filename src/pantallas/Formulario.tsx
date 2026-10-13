import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza, Campo, Cargando, Segmentos, SelectorCategoria } from "../ui";
import { errorTexto, fechaLarga, fmt, hoyISO, limpiarMonto } from "../util";
import { SELECT_MOV, textoCategoria } from "./Movimientos";
import { facturadas, fechaParaPago } from "../ajustes/saldosTarjeta";
import { parteDePareja } from "../dinero";

type Tipo = "gasto" | "ingreso" | "transferencia" | "reembolso";
type Comp = "no" | "mitad" | "pct" | "monto" | "todo";

// Cómo se guarda en "repartos" cada forma de compartir con tu pareja
function modoReparto(comp: Exclude<Comp, "no">, valor: string) {
  if (comp === "mitad") return { modo: "porcentaje", valor: 50 };
  if (comp === "todo") return { modo: "porcentaje", valor: 100 };
  if (comp === "pct") return { modo: "porcentaje", valor: Number(valor) };
  return { modo: "monto", valor: Number(valor) };
}

export default function Formulario() {
  const { id } = useParams();
  const [qs] = useSearchParams();
  const nav = useNavigate();
  const { uid, cuentas, categorias, familiares, otros, aviso, yo, recargar } = useApp();
  const otro = otros[0];
  const activas = cuentas.filter((c) => c.activa);

  const [cargado, setCargado] = useState(!id);
  const [ajeno, setAjeno] = useState<any>(null); // gasto de mi pareja con una parte mía
  const [tipo, setTipo] = useState<Tipo>((qs.get("tipo") as Tipo) || "gasto");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [cuenta, setCuenta] = useState(qs.get("cuenta") ?? (qs.get("destino")
    ? (activas.find((a) => a.id !== qs.get("destino") && !["credito", "prestamo"].includes(a.tipo)) ?? activas.find((a) => a.id !== qs.get("destino")))?.id
    : activas[0]?.id) ?? "");
  const [destino, setDestino] = useState(qs.get("destino") ?? "");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [familiar, setFamiliar] = useState(qs.get("familiar") ?? "");
  const [meses, setMeses] = useState("");
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [modoDiv, setModoDiv] = useState<"iguales" | "montos">("iguales");
  const [conmigo, setConmigo] = useState(true);
  const [montosDiv, setMontosDiv] = useState<Record<string, string>>({});
  const [cobroCompleto, setCobroCompleto] = useState<"mes" | "completo">("mes");
  const [comp, setComp] = useState<Comp>("no");
  const [valorComp, setValorComp] = useState("");
  const [revisar, setRevisar] = useState(false);
  const [enSaldoInicial, setEnSaldoInicial] = useState(false);
  const [sumarASaldo, setSumarASaldo] = useState(false);
  // Cargo aplazado: compras hoy y el banco lo cobra en una fecha posterior
  const [aplazado, setAplazado] = useState(false);
  const [fechaCobro, setFechaCobro] = useState("");
  // Compras a meses de antes del alta de la tarjeta
  const [nPago, setNPago] = useState("");
  const [msiIncluida, setMsiIncluida] = useState<"si" | "no">("si");
  const [msiFalta, setMsiFalta] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  // para la parte ajena
  const [miCat, setMiCat] = useState<string | null>(null);
  const [disputa, setDisputa] = useState(false);
  const [nota, setNota] = useState("");

  useEffect(() => {
    if (!id) return;
    sb.from("movimientos").select(SELECT_MOV).eq("id", id).single().then(({ data: m }) => {
      if (!m) { setError("No encontré ese movimiento."); setCargado(true); return; }
      if (m.creado_por !== uid) {
        const r = (m.repartos ?? []).find((x: any) => x.user_id === uid);
        setAjeno(m); setMiCat(r?.categoria_id ?? null); setDisputa(r?.estado === "disputa"); setNota(r?.nota ?? "");
        setCargado(true); return;
      }
      setTipo(m.tipo); setMonto(String(m.monto)); setFecha(m.fecha); setCuenta(m.cuenta_id ?? "");
      setDestino(m.cuenta_destino_id ?? ""); setCategoria(m.categoria_id); setDescripcion(m.descripcion ?? m.comercio ?? "");
      setFamiliar(m.familiar_id ?? (m.partes?.length ? "__dividir" : ""));
      if (m.partes?.length) {
        setSeleccion(m.partes.map((x: any) => x.familiar_id)); setModoDiv("montos");
        setMontosDiv(Object.fromEntries(m.partes.map((x: any) => [x.familiar_id, String(x.monto)])));
      } setMeses(m.meses_msi ? String(m.meses_msi) : ""); setCobroCompleto(m.cobro_completo ? "completo" : "mes"); setRevisar(m.revisar); setEnSaldoInicial(!!m.en_saldo_inicial); setSumarASaldo(!!m.sumar_a_saldo);
      if (m.tipo === "gasto" && (m.fecha_compra || m.fecha > hoyISO())) { setAplazado(true); setFechaCobro(m.fecha); setFecha(m.fecha_compra ?? m.fecha); }
      const r = (m.repartos ?? [])[0];
      if (r) {
        if (r.modo === "porcentaje" && Number(r.valor) === 50) setComp("mitad");
        else if (r.modo === "porcentaje" && Number(r.valor) === 100) setComp("todo");
        else if (r.modo === "porcentaje") { setComp("pct"); setValorComp(String(r.valor)); }
        else { setComp("monto"); setValorComp(String(r.valor)); }
      }
      setCargado(true);
    });
  }, [id, uid]);

  const montoNum = Number(String(monto).replace(/[^\d.]/g, ""));
  const dividir = familiar === "__dividir";
  const familiarReal = dividir ? "" : familiar;
  const cuota = Math.floor((montoNum / Math.max(1, seleccion.length + (conmigo ? 1 : 0))) * 100) / 100;
  const partes = dividir ? seleccion.map((f) => ({ familiar_id: f, monto: modoDiv === "iguales" ? cuota : Number(montosDiv[f] || 0) })) : [];
  const sumaPartes = partes.reduce((a, x) => a + x.monto, 0);
  const cuentaSel = cuentas.find((c) => c.id === cuenta);
  const esAplazado = tipo === "gasto" && cuentaSel?.tipo === "credito" && aplazado && !!fechaCobro;
  const msiPrevia = !esAplazado && tipo === "gasto" && Number(meses) > 1 && cuentaSel?.tipo === "credito" && !!cuentaSel.dia_corte && fecha < cuentaSel.fecha_saldo_inicial;
  const nCalc = msiPrevia ? facturadas(fecha, cuentaSel!.dia_corte!, Number(meses)) : 0;
  const nEfectivo = nPago !== "" ? Math.min(Number(nPago), Number(meses)) : nCalc;
  const mensualidadPrev = Number(meses) > 0 ? Math.round((montoNum / Number(meses)) * 100) / 100 : 0;
  // Sin mensualidades cobradas falta el total exacto (la primera mensualidad absorbe los centavos)
  const faltaCalc = nEfectivo <= 0 ? montoNum : Math.round(mensualidadPrev * Math.max(0, Number(meses) - nEfectivo) * 100) / 100;
  // Los gastos de la cuenta conjunta ya son de los dos: no se comparten
  const esConjunta = !!cuentaSel && !cuentaSel.propietario_id;
  // Lo que se comparte con tu pareja es lo que queda después de las partes de familiares (igual que la base de datos).
  // Con la cuenta conjunta no se comparte: tu parte es todo lo que queda.
  const { base, parte: parteOtro, tuParte } = parteDePareja(montoNum, dividir ? sumaPartes : 0, esConjunta ? "no" : comp, Number(valorComp || 0));

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!(montoNum > 0)) return setError("Escribe un monto mayor a cero.");
    if (!cuenta) return setError("Elige la cuenta.");
    if (tipo === "transferencia" && (!destino || destino === cuenta)) return setError("Elige una cuenta destino distinta.");
    if (tipo === "reembolso" && !familiar) return setError("Elige quién te pagó.");
    if (tipo === "gasto" && aplazado && cuentaSel?.tipo === "credito" && !(fechaCobro > fecha)) return setError("La fecha en que se cobra debe ser posterior a la fecha de compra.");
    if (tipo === "gasto" && dividir) {
      if (!seleccion.length) return setError("Elige con quién se divide el gasto.");
      if (partes.some((x) => !(x.monto > 0))) return setError("Escribe la parte de cada persona.");
      if (sumaPartes > montoNum + 0.01) return setError("Las partes suman más que el gasto.");
    }
    if (comp !== "no" && !familiarReal && !esConjunta && parteOtro > base + 0.001)
      return setError(dividir ? "La parte de tu pareja no puede ser mayor que lo que queda después de las otras partes." : "La parte de tu pareja no puede ser mayor que el gasto.");
    setOcupado(true);
    const fila: any = {
      tipo, monto: montoNum, fecha, cuenta_id: cuenta,
      cuenta_destino_id: tipo === "transferencia" ? destino : null,
      categoria_id: tipo === "gasto" || tipo === "ingreso" ? categoria : null,
      descripcion: descripcion.trim() || null,
      familiar_id: tipo === "gasto" || tipo === "reembolso" ? (familiarReal || null) : null,
      meses_msi: tipo === "gasto" && Number(meses) > 1 ? Number(meses) : null,
      cobro_completo: tipo === "gasto" && Number(meses) > 1 && (!!familiarReal || dividir) && cobroCompleto === "completo",
      revisar: false,
      // Al editar se respetan las banderas que ya tenía (cambiarlas movería la deuda de la tarjeta)
      en_saldo_inicial: (!id && msiPrevia) || (enSaldoInicial && !!cuentaSel && fecha <= cuentaSel.fecha_saldo_inicial),
      sumar_a_saldo: (id || !msiPrevia) && sumarASaldo && !!cuentaSel && fecha < cuentaSel.fecha_saldo_inicial,
      fecha_compra: null,
    };
    // Cargo aplazado: el movimiento vive en la fecha en que el banco lo cobra; hasta entonces no suma a la deuda
    if (esAplazado) Object.assign(fila, { fecha: fechaCobro, fecha_compra: fecha, en_saldo_inicial: false, sumar_a_saldo: false });
    // Si el gasto pasa a ser de otra persona, se paga con la cuenta conjunta o deja de ser gasto, no se comparte con tu pareja
    const compEf = tipo !== "gasto" || familiarReal || esConjunta ? "no" : comp;
    const conPartes = tipo === "gasto" && dividir;
    // Si tu estado de cuenta dice otro número de pago, la fecha se ajusta para que las mensualidades cuadren con tu corte
    if (msiPrevia && nPago !== "" && nEfectivo !== nCalc) fila.fecha = fechaParaPago(cuentaSel!.dia_corte!, nEfectivo);
    if (!id) fila.origen = "App";
    const reparto = otro && compEf !== "no" ? { user_id: otro.user_id, ...modoReparto(compEf, valorComp) } : null;
    // Compra a meses que no estaba en lo que debías al dar de alta: se suma a la deuda solo lo que falta pagar
    const ajuste = !id && msiPrevia && msiIncluida === "no" ? (msiFalta !== "" ? Number(msiFalta) : faltaCalc) : null;
    // Todo en un solo paso en la base de datos: o se guarda completo o no se guarda nada
    const { error } = await sb.rpc("guardar_movimiento", {
      p_id: id ?? null, p_mov: fila, p_partes: conPartes ? partes : null, p_reparto: reparto, p_ajuste_saldo: ajuste,
    });
    if (error) { setOcupado(false); return setError(errorTexto(error)); }
    if (ajuste) await recargar();
    setOcupado(false);
    aviso(id ? "Cambios guardados" : "Movimiento guardado");
    nav(-1);
  }

  async function borrar() {
    setOcupado(true);
    const { error } = await sb.from("movimientos").delete().eq("id", id!);
    setOcupado(false);
    if (error) return setError(errorTexto(error));
    aviso("Movimiento borrado"); nav(-1);
  }

  async function guardarParte() {
    setOcupado(true);
    const { error } = await sb.from("repartos").update({ categoria_id: miCat, estado: disputa ? "disputa" : "ok", nota: nota.trim() || null })
      .eq("movimiento_id", ajeno.id).eq("user_id", uid);
    setOcupado(false);
    if (error) return setError(errorTexto(error));
    aviso("Tu parte quedó guardada"); nav(-1);
  }

  if (!cargado) return <Cargando />;

  if (ajeno) {
    const r = (ajeno.repartos ?? []).find((x: any) => x.user_id === uid);
    const pagador = otros.find((o) => o.user_id === ajeno.creado_por)?.nombre ?? "Tu pareja";
    return (
      <>
        <Cabeza titulo="Gasto compartido" volver />
        <div className="lista">
          <div className="fila"><div className="cuerpo"><div className="titulo">{ajeno.descripcion || ajeno.comercio || textoCategoria(ajeno) || "Gasto"}</div>
            <div className="detalle">Pagó {pagador} · {fechaLarga(ajeno.fecha)}{ajeno.meses_msi ? ` · ${ajeno.meses_msi} MSI` : ""}</div></div>
            <div className="monto">{fmt(ajeno.monto)}</div></div>
          <div className="fila"><div className="cuerpo"><div className="titulo">Tu parte</div>
            <div className="detalle">{r?.modo === "porcentaje" ? `${Number(r.valor)}% del total` : "Monto fijo"}{ajeno.meses_msi ? " · se suma a lo que debes conforme se factura cada mensualidad" : ""}</div></div>
            <div className="monto negativo">{fmt(r?.monto)}</div></div>
        </div>
        <h2>En tus gastos</h2>
        <SelectorCategoria cats={categorias} tipo="gasto" valor={miCat} onCambio={setMiCat} uid={uid} />
        <label className="casilla"><input type="checkbox" checked={disputa} onChange={(e) => setDisputa(e.target.checked)} /> No estoy de acuerdo con este reparto</label>
        {disputa && <Campo etiqueta={`Nota para ${pagador}`}><textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="¿No era 40%?" /></Campo>}
        <p className="nota">Solo {pagador} puede cambiar el monto o el reparto.</p>
        <div className="acciones"><button className="boton" onClick={guardarParte} disabled={ocupado}>Guardar</button></div>
        {error && <p className="error" role="alert">{error}</p>}
      </>
    );
  }

  const tiposOp: { v: Tipo; t: string }[] = [{ v: "gasto", t: "Gasto" }, { v: "ingreso", t: "Ingreso" }, { v: "transferencia", t: "Transferencia" }, { v: "reembolso", t: "Reembolso" }];

  return (
    <>
      <Cabeza titulo={id ? "Editar movimiento" : "Nuevo movimiento"} volver />
      {revisar && <div className="aviso rojo mt-0 mb-14">Este movimiento entró sin clasificar. Revisa la cuenta y la categoría.</div>}
      <form onSubmit={guardar}>
        <Segmentos etiqueta="Tipo" valor={tipo} onCambio={setTipo} opciones={tiposOp} />
        <Campo etiqueta="Monto">
          <input className="monto-grande" inputMode="decimal" placeholder="$0" value={monto} onChange={(e) => setMonto(limpiarMonto(e.target.value))} autoFocus={!id} />
        </Campo>
        <div className="dos">
          <Campo etiqueta={tipo === "transferencia" ? "Desde" : tipo === "gasto" ? "Pagué con" : "Entró a"}>
            <select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
              <option value="">Elige…</option>
              {activas.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.propietario_id ? "" : " (conjunta)"}</option>)}
            </select>
          </Campo>
          {tipo === "transferencia" ? (
            <Campo etiqueta="Hacia">
              <select value={destino} onChange={(e) => setDestino(e.target.value)}>
                <option value="">Elige…</option>
                {activas.filter((c) => c.id !== cuenta).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Campo>
          ) : (
            <Campo etiqueta="Fecha"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
          )}
        </div>
        {tipo === "transferencia" && (
          <>
            <Campo etiqueta="Fecha"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
            <p className="nota mt-n6 mb-14">El pago de una tarjeta es una transferencia (débito → tarjeta), no un gasto.</p>
          </>
        )}

        {(tipo === "gasto" || tipo === "ingreso") && (
          <SelectorCategoria cats={categorias} tipo={tipo} valor={categoria} onCambio={setCategoria} uid={uid} incluirHogar={tipo === "gasto"} />
        )}

        {cuentaSel && fecha < cuentaSel.fecha_saldo_inicial && !msiPrevia && !esAplazado && (
          <>
            <p className="nota mt-n6 mb-8">Esta fecha es anterior al alta de {cuentaSel.nombre} ({new Date(cuentaSel.fecha_saldo_inicial + "T12:00:00Z").toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" })}). Si la deuda o saldo que capturaste ese día ya lo incluía, déjalo así; si no, márcalo para sumarlo.</p>
            <label className="casilla"><input type="checkbox" checked={sumarASaldo} onChange={(e) => setSumarASaldo(e.target.checked)} /> No estaba incluido: súmalo al saldo de {cuentaSel.nombre}</label>
          </>
        )}
        {cuentaSel && fecha === cuentaSel.fecha_saldo_inicial && tipo !== "transferencia" && !esAplazado && (
          <label className="casilla"><input type="checkbox" checked={enSaldoInicial} onChange={(e) => setEnSaldoInicial(e.target.checked)} /> Ya estaba incluido en el saldo con que diste de alta {cuentaSel.nombre}</label>
        )}
        <Campo etiqueta="Descripción"><input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder={tipo === "gasto" ? "Comercio o nota" : ""} /></Campo>

        {tipo === "reembolso" && (
          <Campo etiqueta="¿Quién te pagó?" ayuda={otro ? `Si te pagó ${otro.nombre}, usa Saldar en la pantalla Hogar.` : undefined}>
            <select value={familiar} onChange={(e) => setFamiliar(e.target.value)}>
              <option value="">Elige…</option>
              {familiares.filter((f) => f.activo).map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
          </Campo>
        )}

        {tipo === "gasto" && (
          <>
            <div className="dos">
              <Campo etiqueta="¿Para quién?" ayuda="Lo de otras personas se carga a tu cuenta igual, no cuenta en tus gastos y se va a Cobros.">
                <select value={familiar} onChange={(e) => setFamiliar(e.target.value)}>
                  <option value="">Para mí</option>
                  {familiares.filter((f) => f.activo).map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                  {familiares.some((f) => f.activo) && <option value="__dividir">Dividir…</option>}
                </select>
              </Campo>
              <Campo etiqueta="Meses sin intereses">
                <select value={meses} onChange={(e) => setMeses(e.target.value)}>
                  <option value="">Sin meses</option>
                  {[3, 6, 9, 10, 12, 13, 18, 24].map((n) => <option key={n} value={n}>{n} meses</option>)}
                </select>
              </Campo>
            </div>
            {Number(meses) > 1 && montoNum > 0 && <p className="nota mt-n6 mb-14">{Number(meses)} mensualidades de {fmt(montoNum / Number(meses))}. Registra el total de la compra.</p>}
            {cuentaSel?.tipo === "credito" && (
              <>
                <label className="casilla"><input type="checkbox" checked={aplazado} onChange={(e) => setAplazado(e.target.checked)} /> Cargo aplazado (el banco lo cobra después)</label>
                {aplazado && (
                  <>
                    <Campo etiqueta={Number(meses) > 1 ? "Fecha del primer cargo" : "Fecha en que se cobra"}><input type="date" value={fechaCobro} min={fecha} onChange={(e) => setFechaCobro(e.target.value)} /></Campo>
                    <p className="nota mt-n6 mb-14">Hasta esa fecha no suma a tu deuda ni a tu pago; lo verás en {cuentaSel.nombre} como cargo aplazado.{Number(meses) > 1 ? " Las mensualidades empiezan a contar desde ese cargo." : ""}</p>
                  </>
                )}
              </>
            )}
            {msiPrevia && (
              <div className="caja-dividir">
                <div className="sub mb-8">Compra de antes de dar de alta {cuentaSel!.nombre}</div>
                <p className="nota mt-0">Según tu día de corte ({cuentaSel!.dia_corte}), llevas <b>{nCalc} de {meses}</b> mensualidades cobradas. Si tu estado de cuenta dice otro número, corrígelo:</p>
                <Campo etiqueta="Pago número en tu estado de cuenta">
                  <input inputMode="numeric" value={nPago === "" ? String(nCalc) : nPago} onChange={(e) => setNPago(e.target.value.replace(/\D/g, ""))} />
                </Campo>
                {!id && (
                  <>
                    <Segmentos etiqueta="¿Estaba en lo que debías?" valor={msiIncluida} onCambio={setMsiIncluida} opciones={[
                      { v: "si", t: "Ya estaba en mi deuda" }, { v: "no", t: "No, súmala" }]} />
                    {msiIncluida === "si"
                      ? <p className="nota mt-n6">Lo que te falta ya estaba en lo que capturaste como deuda al dar de alta {cuentaSel!.nombre}; solo se agregan sus mensualidades.</p>
                      : <Campo etiqueta="Lo que te falta pagar de esta compra" ayuda="Se suma a la deuda de la tarjeta. Incluye la mensualidad de este mes si todavía no la pagas.">
                          <input inputMode="decimal" value={msiFalta === "" ? String(faltaCalc) : msiFalta} onChange={(e) => setMsiFalta(limpiarMonto(e.target.value))} />
                        </Campo>}
                  </>
                )}
              </div>
            )}
            {dividir && (
              <div className="caja-dividir">
                <div className="sub mb-8">¿Entre quiénes?</div>
                <div className="chips">
                  <button type="button" aria-pressed={conmigo} onClick={() => setConmigo(!conmigo)} disabled={modoDiv === "montos"}>Yo</button>
                  {familiares.filter((f) => f.activo || seleccion.includes(f.id)).map((f) => (
                    <button type="button" key={f.id} aria-pressed={seleccion.includes(f.id)}
                      onClick={() => setSeleccion(seleccion.includes(f.id) ? seleccion.filter((x) => x !== f.id) : [...seleccion, f.id])}>{f.nombre}</button>
                  ))}
                </div>
                <Segmentos etiqueta="Cómo dividir" valor={modoDiv} onCambio={(v) => {
                  if (v === "montos") setMontosDiv(Object.fromEntries(seleccion.map((f) => [f, montosDiv[f] || (cuota ? String(cuota) : "")])));
                  setModoDiv(v);
                }} opciones={[{ v: "iguales", t: "Partes iguales" }, { v: "montos", t: "Por monto" }]} />
                {seleccion.length > 0 && (
                  <div className="lista">
                    {seleccion.map((f) => (
                      <div className="fila" key={f}>
                        <div className="cuerpo"><div className="titulo">{familiares.find((x) => x.id === f)?.nombre}</div></div>
                        {modoDiv === "iguales"
                          ? <div className="monto">{fmt(cuota)}</div>
                          : <input className="monto-chico" inputMode="decimal" aria-label={`Parte de ${familiares.find((x) => x.id === f)?.nombre}`} value={montosDiv[f] ?? ""}
                              onChange={(e) => setMontosDiv({ ...montosDiv, [f]: limpiarMonto(e.target.value) })} placeholder="$0" />}
                      </div>
                    ))}
                    <div className="fila"><div className="cuerpo"><div className="titulo">Tu parte</div><div className="detalle">Cuenta en tus gastos</div></div>
                      <div className={"monto" + (tuParte < -0.01 ? " negativo" : "")}>{fmt(tuParte)}</div></div>
                  </div>
                )}
                <p className="nota">Cada parte se va a Cobros de esa persona y entra en su mensaje de WhatsApp.</p>
              </div>
            )}
            {Number(meses) > 1 && (familiarReal || dividir) && (
              <>
                <Segmentos etiqueta="¿Cómo se lo cobras?" valor={cobroCompleto} onCambio={setCobroCompleto} opciones={[
                  { v: "mes", t: "Por mensualidad" }, { v: "completo", t: "Todo en un pago" }]} />
                <p className="nota mt-n6 mb-14">
                  {cobroCompleto === "completo"
                    ? (dividir ? "Cada quien te debe su parte completa desde hoy. Tú sigues pagando la tarjeta a meses."
                      : `${familiares.find((f) => f.id === familiar)?.nombre ?? "Esta persona"} te debe ${montoNum > 0 ? fmt(montoNum) : "el total"} desde hoy. Tú sigues pagando la tarjeta a meses.`)
                    : dividir ? "Cada quien te debe su parte de cada mensualidad conforme te la factura el banco." : "Te debe cada mensualidad conforme te la factura el banco."}
                </p>
              </>
            )}

            {otro && !familiarReal && esConjunta && (
              <p className="nota mb-14">Se paga con la cuenta conjunta: ya es de los dos, así que no se comparte con {otro.nombre}.</p>
            )}
            {otro && !familiarReal && !esConjunta && (
              <>
                <span className="campo mb-6"><span>¿Compartido con {otro.nombre}?</span></span>
                <Segmentos etiqueta="Compartido" valor={comp} onCambio={setComp} opciones={[
                  { v: "no", t: "No" }, { v: "mitad", t: "50/50" }, { v: "pct", t: "%" }, { v: "monto", t: "Monto" }, { v: "todo", t: `Todo de ${otro.nombre}` },
                ]} />
                {(comp === "pct" || comp === "monto") && (
                  <Campo etiqueta={comp === "pct" ? `Porcentaje que le toca a ${otro.nombre}` : `Monto que le toca a ${otro.nombre}`}>
                    <input inputMode="decimal" value={valorComp} onChange={(e) => setValorComp(limpiarMonto(e.target.value))} placeholder={comp === "pct" ? "40" : "$0"} />
                  </Campo>
                )}
                {comp !== "no" && montoNum > 0 && (
                  <p className="nota mt-n6 mb-14">
                    A {otro.nombre} le tocan {fmt(parteOtro)}; a ti {fmt(base - parteOtro)}.
                    {dividir && sumaPartes > 0 && ` Se reparte lo que queda después de las otras partes (${fmt(base)}).`}
                    {Number(meses) > 1 && " Su parte se suma a lo que te debe conforme se factura cada mensualidad."}
                  </p>
                )}
              </>
            )}
          </>
        )}

        <div className="acciones">
          <button className="boton" disabled={ocupado}>{ocupado ? "Guardando…" : id ? "Guardar cambios" : "Guardar"}</button>
        </div>
        {id && (
          <div className="acciones">
            {confirmarBorrar
              ? <><button type="button" className="boton claro" onClick={() => setConfirmarBorrar(false)}>Cancelar</button>
                  <button type="button" className="boton peligro" onClick={borrar} disabled={ocupado}>Sí, borrar</button></>
              : <button type="button" className="boton peligro" onClick={() => setConfirmarBorrar(true)}>Borrar movimiento</button>}
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </form>
      {!id && yo && <p className="nota mt-18">Los pagos con Apple Pay se registran solos con tu atajo; aquí van efectivo, transferencias y lo demás.</p>}
    </>
  );
}

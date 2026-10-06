import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza, Campo, Segmentos, SelectorCategoria } from "../ui";
import { errorTexto, fechaLarga, fmt, hoyISO, limpiarMonto } from "../util";
import { SELECT_MOV, textoCategoria } from "./Movimientos";

type Tipo = "gasto" | "ingreso" | "transferencia" | "reembolso";
type Comp = "no" | "mitad" | "pct" | "monto" | "todo";

export default function Formulario() {
  const { id } = useParams();
  const [qs] = useSearchParams();
  const nav = useNavigate();
  const { uid, cuentas, categorias, familiares, otros, aviso, yo } = useApp();
  const otro = otros[0];
  const activas = cuentas.filter((c) => c.activa);

  const [cargado, setCargado] = useState(!id);
  const [ajeno, setAjeno] = useState<any>(null); // gasto de mi pareja con una parte mía
  const [tipo, setTipo] = useState<Tipo>((qs.get("tipo") as Tipo) || "gasto");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [cuenta, setCuenta] = useState(activas[0]?.id ?? "");
  const [destino, setDestino] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [familiar, setFamiliar] = useState(qs.get("familiar") ?? "");
  const [meses, setMeses] = useState("");
  const [comp, setComp] = useState<Comp>("no");
  const [valorComp, setValorComp] = useState("");
  const [revisar, setRevisar] = useState(false);
  const [enSaldoInicial, setEnSaldoInicial] = useState(false);
  const [sumarASaldo, setSumarASaldo] = useState(false);
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
      setFamiliar(m.familiar_id ?? ""); setMeses(m.meses_msi ? String(m.meses_msi) : ""); setRevisar(m.revisar); setEnSaldoInicial(!!m.en_saldo_inicial); setSumarASaldo(!!m.sumar_a_saldo);
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
  const cuentaSel = cuentas.find((c) => c.id === cuenta);
  const parteOtro = comp === "mitad" ? montoNum / 2 : comp === "todo" ? montoNum
    : comp === "pct" ? montoNum * Number(valorComp || 0) / 100 : comp === "monto" ? Number(valorComp || 0) : 0;

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!(montoNum > 0)) return setError("Escribe un monto mayor a cero.");
    if (!cuenta) return setError("Elige la cuenta.");
    if (tipo === "transferencia" && (!destino || destino === cuenta)) return setError("Elige una cuenta destino distinta.");
    if (tipo === "reembolso" && !familiar) return setError("Elige quién te pagó.");
    if (comp !== "no" && parteOtro > montoNum) return setError("La parte de tu pareja no puede ser mayor que el gasto.");
    setOcupado(true);
    const fila: any = {
      tipo, monto: montoNum, fecha, cuenta_id: cuenta,
      cuenta_destino_id: tipo === "transferencia" ? destino : null,
      categoria_id: tipo === "gasto" || tipo === "ingreso" ? categoria : null,
      descripcion: descripcion.trim() || null,
      familiar_id: tipo === "gasto" || tipo === "reembolso" ? (familiar || null) : null,
      meses_msi: tipo === "gasto" && Number(meses) > 1 ? Number(meses) : null,
      revisar: false,
      en_saldo_inicial: enSaldoInicial && !!cuentaSel && fecha <= cuentaSel.fecha_saldo_inicial,
      sumar_a_saldo: sumarASaldo && !!cuentaSel && fecha < cuentaSel.fecha_saldo_inicial,
    };
    let movId = id;
    if (id) {
      const { error } = await sb.from("movimientos").update(fila).eq("id", id);
      if (error) { setOcupado(false); return setError(errorTexto(error)); }
    } else {
      fila.origen = "App";
      const { data, error } = await sb.from("movimientos").insert(fila).select("id").single();
      if (error) { setOcupado(false); return setError(errorTexto(error)); }
      movId = data.id;
    }
    if (otro && movId) {
      if (tipo === "gasto" && comp !== "no") {
        const r = comp === "mitad" ? { modo: "porcentaje", valor: 50 } : comp === "todo" ? { modo: "porcentaje", valor: 100 }
          : comp === "pct" ? { modo: "porcentaje", valor: Number(valorComp) } : { modo: "monto", valor: Number(valorComp) };
        const { error } = await sb.from("repartos").upsert({ movimiento_id: movId, user_id: otro.user_id, ...r }, { onConflict: "movimiento_id,user_id" });
        if (error) { setOcupado(false); return setError(errorTexto(error)); }
      } else if (id) {
        await sb.from("repartos").delete().eq("movimiento_id", movId);
      }
    }
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

  if (!cargado) return <div className="cargando">Cargando…</div>;

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
        <h2>En tu presupuesto</h2>
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
      {revisar && <div className="aviso rojo" style={{ marginTop: 0, marginBottom: 14 }}>Este movimiento entró sin clasificar. Revisa la cuenta y la categoría.</div>}
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
            <p className="nota" style={{ marginTop: -6, marginBottom: 14 }}>El pago de una tarjeta es una transferencia (débito → tarjeta), no un gasto.</p>
          </>
        )}

        {(tipo === "gasto" || tipo === "ingreso") && (
          <SelectorCategoria cats={categorias} tipo={tipo} valor={categoria} onCambio={setCategoria} uid={uid} incluirHogar={tipo === "gasto"} />
        )}

        {cuentaSel && fecha < cuentaSel.fecha_saldo_inicial && (
          <>
            <p className="nota" style={{ marginTop: -6, marginBottom: 8 }}>Esta fecha es anterior al alta de {cuentaSel.nombre} ({new Date(cuentaSel.fecha_saldo_inicial + "T12:00:00Z").toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" })}). Si la deuda o saldo que capturaste ese día ya lo incluía, déjalo así; si no, márcalo para sumarlo.</p>
            <label className="casilla"><input type="checkbox" checked={sumarASaldo} onChange={(e) => setSumarASaldo(e.target.checked)} /> No estaba incluido: súmalo al saldo de {cuentaSel.nombre}</label>
          </>
        )}
        {cuentaSel && fecha === cuentaSel.fecha_saldo_inicial && tipo !== "transferencia" && (
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
              <Campo etiqueta="¿Para quién?" ayuda="Si es de otra persona, se carga a tu cuenta igual, no cuenta en tu presupuesto y se va a Cobros.">
                <select value={familiar} onChange={(e) => setFamiliar(e.target.value)}>
                  <option value="">Para mí</option>
                  {familiares.filter((f) => f.activo).map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                </select>
              </Campo>
              <Campo etiqueta="Meses sin intereses">
                <select value={meses} onChange={(e) => setMeses(e.target.value)}>
                  <option value="">Sin meses</option>
                  {[3, 6, 9, 10, 12, 13, 18, 24].map((n) => <option key={n} value={n}>{n} meses</option>)}
                </select>
              </Campo>
            </div>
            {Number(meses) > 1 && montoNum > 0 && <p className="nota" style={{ marginTop: -6, marginBottom: 14 }}>{Number(meses)} mensualidades de {fmt(montoNum / Number(meses))}. Registra el total de la compra.</p>}

            {otro && !familiar && (
              <>
                <span className="campo" style={{ marginBottom: 6 }}><span>¿Compartido con {otro.nombre}?</span></span>
                <Segmentos etiqueta="Compartido" valor={comp} onCambio={setComp} opciones={[
                  { v: "no", t: "No" }, { v: "mitad", t: "50/50" }, { v: "pct", t: "%" }, { v: "monto", t: "Monto" }, { v: "todo", t: `Todo de ${otro.nombre}` },
                ]} />
                {(comp === "pct" || comp === "monto") && (
                  <Campo etiqueta={comp === "pct" ? `Porcentaje que le toca a ${otro.nombre}` : `Monto que le toca a ${otro.nombre}`}>
                    <input inputMode="decimal" value={valorComp} onChange={(e) => setValorComp(limpiarMonto(e.target.value))} placeholder={comp === "pct" ? "40" : "$0"} />
                  </Campo>
                )}
                {comp !== "no" && montoNum > 0 && (
                  <p className="nota" style={{ marginTop: -6, marginBottom: 14 }}>
                    A {otro.nombre} le tocan {fmt(parteOtro)}; a ti {fmt(montoNum - parteOtro)}.
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
      {!id && yo && <p className="nota" style={{ marginTop: 18 }}>Los pagos con Apple Pay se registran solos con tu atajo; aquí van efectivo, transferencias y lo demás.</p>}
    </>
  );
}

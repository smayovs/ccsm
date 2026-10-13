import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza, Campo, Cargando, useUnaVez } from "../ui";
import { errorTexto, fechaCorta, fechaLarga, fmt, hoyISO, limpiarMonto } from "../util";
import { siguienteFecha, TEXTO_REPETIR, type IngresoProgramado as IP } from "../ingresos";

// Confirmar un ingreso programado con el monto real, cambiarle la fecha o descartarlo
export default function IngresoProgramado() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { cuentas, aviso } = useApp();
  const unaVez = useUnaVez();
  const [ip, setIp] = useState<IP | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [cuenta, setCuenta] = useState("");
  const [nuevaFecha, setNuevaFecha] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    sb.from("ingresos_programados").select("id, fecha, monto, cuenta_id, categoria_id, descripcion, repetir").eq("id", id).maybeSingle()
      .then(({ data }) => {
        if (!data) return setNoExiste(true);
        const x = { ...data, monto: Number(data.monto) } as IP;
        setIp(x);
        setMonto(String(x.monto));
        setCuenta(x.cuenta_id ?? "");
        setNuevaFecha(x.fecha);
        // Si llegó antes de lo esperado, la fecha es hoy; si ya pasó la fecha esperada, se propone esa
        setFecha(x.fecha < hoyISO() ? x.fecha : hoyISO());
      });
  }, [id]);

  if (noExiste) return <><Cabeza titulo="Ingreso programado" volver /><div className="vacio">Este ingreso ya se confirmó o se borró.</div></>;
  if (!ip) return <><Cabeza titulo="Ingreso programado" volver /><Cargando /></>;

  const activas = cuentas.filter((c) => c.activa && !["credito", "prestamo"].includes(c.tipo));
  const hoy = hoyISO();
  const montoNum = Number(monto) || 0;

  async function confirmar() {
    setError("");
    if (!(montoNum > 0)) return setError("Escribe el monto que llegó.");
    const { error } = await sb.rpc("confirmar_ingreso", { p_id: id, p_monto: montoNum, p_fecha: fecha, p_cuenta: cuenta || null });
    if (error) return setError(errorTexto(error));
    const sig = siguienteFecha(ip!.fecha, ip!.repetir);
    aviso(sig ? `Ingreso confirmado. El siguiente queda para el ${fechaCorta(sig)}` : "Ingreso confirmado");
    nav(-1);
  }
  async function moverFecha(f: string, texto: string) {
    setError("");
    const { error } = await sb.from("ingresos_programados").update({ fecha: f }).eq("id", id);
    if (error) return setError(errorTexto(error));
    aviso(texto);
    nav(-1);
  }
  async function borrar() {
    setError("");
    const { error } = await sb.from("ingresos_programados").delete().eq("id", id);
    if (error) return setError(errorTexto(error));
    aviso(ip!.repetir ? "Programación borrada" : "Ingreso descartado");
    nav(-1);
  }
  const sig = siguienteFecha(ip.fecha, ip.repetir);

  return (
    <>
      <Cabeza titulo={ip.descripcion} volver />
      <section className="panel mt-0">
        <div className="sub">{ip.fecha <= hoy ? "Esperado el" : "Se espera el"} {fechaLarga(ip.fecha)}{ip.repetir ? ` · ${TEXTO_REPETIR[ip.repetir]}` : ""}</div>
        <div className="cifra-media num">~{fmt(ip.monto)}</div>
        <p className="nota mt-0">Aún no suma a tus saldos. Confírmalo cuando llegue, con el monto real.</p>
      </section>

      <h2>¿Ya llegó?</h2>
      <Campo etiqueta="Monto que llegó">
        <input className="monto-grande" inputMode="decimal" value={monto} onChange={(e) => setMonto(limpiarMonto(e.target.value))} />
      </Campo>
      <div className="dos">
        <Campo etiqueta="Entró a">
          <select value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
            <option value="">Elige…</option>
            {activas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Fecha en que llegó"><input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} /></Campo>
      </div>
      <div className="acciones mt-0">
        <button className="boton" disabled={!cuenta} onClick={unaVez(confirmar)}>Confirmar ingreso</button>
      </div>
      {ip.repetir && <p className="nota">Al confirmarlo, el siguiente queda programado para el {fechaCorta(sig!)} con este monto.</p>}

      <h2>¿Todavía no llega?</h2>
      <Campo etiqueta="Nueva fecha esperada"><input type="date" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} /></Campo>
      <div className="acciones mt-0">
        <button className="boton claro" disabled={!nuevaFecha || nuevaFecha === ip.fecha} onClick={unaVez(() => moverFecha(nuevaFecha, `Ahora se espera el ${fechaCorta(nuevaFecha)}`))}>Cambiar fecha</button>
        {ip.repetir && <button className="boton claro" onClick={unaVez(() => moverFecha(sig!, `Saltado. El siguiente es el ${fechaCorta(sig!)}`))}>Saltar esta vez</button>}
      </div>
      <div className="acciones">
        <button className="boton peligro" onClick={unaVez(borrar)}>{ip.repetir ? "Borrar la programación" : "Descartar, no va a llegar"}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

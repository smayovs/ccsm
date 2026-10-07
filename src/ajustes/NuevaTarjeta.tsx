import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza, Campo, useUnaVez } from "../ui";
import { errorTexto, fmt, hoyISO, limpiarMonto } from "../util";

// Alta sencilla: a partir de hoy, cada gasto (de contado o a meses) suma a la deuda y cada pago la baja
export default function NuevaTarjeta() {
  const { uid, cuentas, recargar, aviso } = useApp();
  const nav = useNavigate();
  const unaVez = useUnaVez();
  const [nombre, setNombre] = useState("");
  const [wallet, setWallet] = useState("");
  const [limite, setLimite] = useState("");
  const [corte, setCorte] = useState("");
  const [pago, setPago] = useState("");
  const [deuda, setDeuda] = useState("");
  const [error, setError] = useState("");
  const [creada, setCreada] = useState<string | null>(null);

  async function guardar() {
    setError("");
    if (!nombre.trim()) return setError("Escribe el nombre de la tarjeta.");
    const c = Number(corte), p = Number(pago);
    if (!(c >= 1 && c <= 31) || !(p >= 1 && p <= 31)) return setError("Escribe el día de corte y el día límite de pago (1 a 31).");
    if (c === p) return setError("El día de pago normalmente es distinto al de corte (unos 20 días después). Revísalo en tu estado de cuenta.");
    const { data, error } = await sb.from("cuentas").insert({
      propietario_id: uid, nombre: nombre.trim(), tipo: "credito", saldo_inicial: -(Number(deuda) || 0), fecha_saldo_inicial: hoyISO(),
      dia_corte: c, dia_pago: p, limite_credito: Number(limite) || null,
      nombre_wallet: wallet.trim() || null, visibilidad: "privada", orden: cuentas.length,
    }).select("id").single();
    if (error) return setError(errorTexto(error));
    await recargar();
    aviso("Tarjeta agregada");
    setCreada(data.id);
  }

  if (creada) return (
    <>
      <Cabeza titulo={nombre} volver />
      <div className="aviso verde" style={{ marginTop: 0 }}><span><strong>{nombre} quedó lista.</strong> {Number(deuda) > 0 ? `Empieza con una deuda de ${fmt(Number(deuda))}.` : "Empieza en $0."}</span></div>
      <p>Desde hoy, cada compra con esta tarjeta (Apple Pay, atajo o la app) suma a la deuda y baja tu crédito disponible, también las compras a meses. Cada pago que hagas la reduce.</p>
      <h2>¿Traías compras a meses?</h2>
      <p className="nota" style={{ marginTop: -4 }}>Regístralas como un gasto normal con su fecha real y los meses. La app calcula con tu día de corte cuántas mensualidades llevas y te deja corregirlo si tu estado de cuenta dice otra cosa.</p>
      <div className="acciones">
        <Link className="boton" to={`/nuevo?cuenta=${creada}`}>Registrar una compra a meses</Link>
      </div>
      <div className="acciones">
        <button className="boton claro" onClick={() => nav(`/cuenta/${creada}`, { replace: true })}>Ver la tarjeta</button>
      </div>
      <p className="nota">Si el pago o la deuda no coinciden con tu banco, en el detalle de la tarjeta está <b>Cuadrar con mi estado de cuenta</b>.</p>
    </>
  );

  return (
    <>
      <Cabeza titulo="Nueva tarjeta de crédito" volver />
      <Campo etiqueta="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Santander LikeU" autoFocus /></Campo>
      <Campo etiqueta="Palabra con la que aparece en Apple Pay" ayuda="Así los pagos con Apple Pay se cargan a esta tarjeta. Ej. LikeU, Oro.">
        <input value={wallet} onChange={(e) => setWallet(e.target.value)} />
      </Campo>
      <div className="dos">
        <Campo etiqueta="Día de corte"><input inputMode="numeric" value={corte} onChange={(e) => setCorte(e.target.value.replace(/\D/g, ""))} placeholder="10" /></Campo>
        <Campo etiqueta="Día límite de pago"><input inputMode="numeric" value={pago} onChange={(e) => setPago(e.target.value.replace(/\D/g, ""))} placeholder="30" /></Campo>
      </div>
      <Campo etiqueta="Límite de crédito"><input inputMode="decimal" value={limite} onChange={(e) => setLimite(limpiarMonto(e.target.value))} placeholder="$30,000" /></Campo>
      <Campo etiqueta="¿Cuánto debes hoy? (opcional)" ayuda="El saldo o deuda total que te muestra la app de tu banco. Si lo dejas vacío, la tarjeta empieza en $0 y solo cuenta lo que registres desde hoy.">
        <input inputMode="decimal" value={deuda} onChange={(e) => setDeuda(limpiarMonto(e.target.value))} placeholder="$0" />
      </Campo>
      {Number(limite) > 0 && <p className="nota" style={{ marginTop: -6 }}>Crédito disponible: {fmt(Number(limite) - (Number(deuda) || 0))}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones"><button className="boton" onClick={unaVez(guardar)}>Guardar tarjeta</button></div>
    </>
  );
}

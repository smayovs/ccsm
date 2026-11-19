import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza, Campo, Segmentos, useUnaVez } from "../ui";
import { errorTexto, fechaCorta, fmt, limpiarMonto, masDias } from "../util";
import { ultimoCorte } from "./saldosTarjeta";
import { errorRegla, reglaDe, reglaFila, ReglaPagoCampos } from "./ReglaPagoCampos";

// Alta sin deuda inicial: la tarjeta empieza en su último corte y su deuda es lo que registres después
// (compra por compra y tus compras a meses). Si ese estado de cuenta aún no está pagado, su pago queda como un cargo visible.
export default function NuevaTarjeta() {
  const { uid, cuentas, recargar, aviso } = useApp();
  const nav = useNavigate();
  const unaVez = useUnaVez();
  const [nombre, setNombre] = useState("");
  const [wallet, setWallet] = useState("");
  const [limite, setLimite] = useState("");
  const [corte, setCorte] = useState("");
  const [regla, setRegla] = useState(reglaDe({ dia_pago: null, pago_regla: "dias", pago_dias: 20 }));
  const [pagado, setPagado] = useState<"si" | "no">("si");
  const [pendiente, setPendiente] = useState("");
  const [error, setError] = useState("");
  const [creada, setCreada] = useState<string | null>(null);
  const c = Number(corte);
  const ult = c >= 1 && c <= 31 ? ultimoCorte(c) : null;

  async function guardar() {
    setError("");
    if (!nombre.trim()) return setError("Escribe el nombre de la tarjeta.");
    if (!ult) return setError("Escribe el día de corte (1 a 31).");
    const er = errorRegla(regla);
    if (er) return setError(er);
    if (pagado === "no" && !(Number(pendiente) > 0)) return setError("Escribe cuánto te falta pagar de tu último estado de cuenta.");
    const { data, error } = await sb.from("cuentas").insert({
      propietario_id: uid, nombre: nombre.trim(), tipo: "credito", saldo_inicial: 0, fecha_saldo_inicial: ult,
      dia_corte: c, limite_credito: Number(limite) || null, ...reglaFila(regla),
      nombre_wallet: wallet.trim() || null, visibilidad: "privada", orden: cuentas.length,
    }).select("id").single();
    if (error) return setError(errorTexto(error));
    const r = await sb.rpc("iniciar_deuda_calculada", { p_cuenta: data.id, p_corte: ult, p_pendiente: pagado === "no" ? Number(pendiente) : 0 });
    if (r.error) return setError(errorTexto(r.error));
    await recargar();
    aviso("Tarjeta agregada");
    setCreada(data.id);
  }

  if (creada) return (
    <>
      <Cabeza titulo={nombre} volver />
      <div className="aviso verde mt-0"><span><strong>{nombre} quedó lista.</strong> {pagado === "no" ? `Empieza con ${fmt(Number(pendiente))} pendientes de tu estado de cuenta del ${fechaCorta(ult!)}.` : "Empieza al corriente."}</span></div>
      <p>Ahora registra lo que llevas desde el <b>{fechaCorta(masDias(ult!, 1))}</b>, compra por compra, y las compras a meses que sigues pagando. La deuda de la tarjeta es la suma de eso, menos tus pagos.</p>
      <div className="acciones">
        <Link className="boton" to={`/nuevo?cuenta=${creada}`}>Registrar una compra</Link>
      </div>
      <p className="nota">Para una compra a meses de antes, ponle su fecha real y los meses en «Más opciones»: la app calcula cuántas mensualidades llevas y te deja corregir el «pago N de M» de tu estado de cuenta.</p>
      <div className="acciones">
        <button className="boton claro" onClick={() => nav(`/cuenta/${creada}`, { replace: true })}>Ver la tarjeta</button>
      </div>
      <p className="nota">Cuando termines, en la tarjeta usa <b>Cuadrar</b> para comparar con el saldo de tu banco o con tu estado de cuenta.</p>
    </>
  );

  return (
    <>
      <Cabeza titulo="Nueva tarjeta de crédito" volver />
      <section className="panel mt-0">
        <div className="panel-titulo">Tarjeta</div>
        <Campo etiqueta="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Santander LikeU" autoFocus /></Campo>
        <Campo etiqueta="Palabra con la que aparece en Apple Pay" ayuda="Así los pagos con Apple Pay se cargan a esta tarjeta. Ej. LikeU, Oro.">
          <input value={wallet} onChange={(e) => setWallet(e.target.value)} />
        </Campo>
      </section>
      <section className="panel">
        <div className="panel-titulo">Fechas y límite</div>
        <div className="dos">
          <Campo etiqueta="Día de corte"><input inputMode="numeric" value={corte} onChange={(e) => setCorte(e.target.value.replace(/\D/g, ""))} placeholder="10" /></Campo>
          <Campo etiqueta="Límite de crédito"><input inputMode="decimal" value={limite} onChange={(e) => setLimite(limpiarMonto(e.target.value))} placeholder="$30,000" /></Campo>
        </div>
        <ReglaPagoCampos r={regla} onCambio={setRegla} diaCorte={ult ? c : null} />
      </section>
      {ult && (
        <section className="panel">
          <div className="panel-titulo">Tu último estado de cuenta</div>
          <span className="campo mb-6"><span>¿Ya pagaste el del corte del {fechaCorta(ult)}?</span></span>
          <Segmentos etiqueta="¿Ya lo pagaste?" valor={pagado} onCambio={setPagado} opciones={[{ v: "si", t: "Sí, al corriente" }, { v: "no", t: "Aún no" }]} />
          {pagado === "no" ? (
            <Campo etiqueta="Pago para no generar intereses" ayuda="Lo que te falta pagar de ese estado de cuenta. Queda como un cargo visible y se cancela cuando registres tu pago.">
              <input inputMode="decimal" value={pendiente} onChange={(e) => setPendiente(limpiarMonto(e.target.value))} placeholder="$0" />
            </Campo>
          ) : <p className="nota mt-n6">Las compras hasta el {fechaCorta(ult)} ya están pagadas, así que no se registran. Solo lo que va del {fechaCorta(masDias(ult, 1))} en adelante y tus compras a meses.</p>}
        </section>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones guardar-fijo"><button className="boton" onClick={unaVez(guardar)}>Guardar tarjeta</button></div>
    </>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza, Campo } from "../ui";
import { errorTexto, fmt, hoyISO, limpiarMonto } from "../util";
import { aplicarSaldos, filasInvalidas, BloqueSaldos, deudaTotal, faltante, ListaMensualidades, saldosVacios, type FilaMsi, type Saldos } from "./saldosTarjeta";

export default function NuevaTarjeta() {
  const { uid, cuentas, recargar, aviso } = useApp();
  const nav = useNavigate();
  const [paso, setPaso] = useState(1);
  const [nombre, setNombre] = useState("");
  const [wallet, setWallet] = useState("");
  const [limite, setLimite] = useState("");
  const [corte, setCorte] = useState("");
  const [pago, setPago] = useState("");
  const [msi, setMsi] = useState<FilaMsi[]>([]);
  const [s, setS] = useState<Saldos>(saldosVacios);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [creada, setCreada] = useState<{ id: string; dia_corte: number } | null>(null);
  const deuda = deudaTotal(s, msi);

  function siguiente() {
    setError("");
    if (paso === 1) {
      if (!nombre.trim()) return setError("Escribe el nombre de la tarjeta.");
      const c = Number(corte), p = Number(pago);
      if (!(c >= 1 && c <= 31) || !(p >= 1 && p <= 31)) return setError("Escribe el día de corte y el día límite de pago (1 a 31).");
    }
    if (paso === 2 && filasInvalidas(msi).length) return setError("Revisa las compras a meses: falta la mensualidad o el pago número es mayor que el total.");
    setPaso(paso + 1);
  }

  async function guardar() {
    setError(""); setOcupado(true);
    // Si un intento anterior ya creó la tarjeta, solo se reintentan los saldos (no se duplica)
    let data = creada;
    if (!data) {
    const r = await sb.from("cuentas").insert({
      propietario_id: uid, nombre: nombre.trim(), tipo: "credito", saldo_inicial: 0, fecha_saldo_inicial: hoyISO(),
      dia_corte: Number(corte), dia_pago: Number(pago), limite_credito: Number(limite) || null,
      nombre_wallet: wallet.trim() || null, visibilidad: "privada", orden: cuentas.length,
    }).select("id, dia_corte").single();
    if (r.error) { setOcupado(false); return setError(errorTexto(r.error)); }
    data = r.data as { id: string; dia_corte: number }; setCreada(data);
    }
    const e2 = await aplicarSaldos({ id: data.id, dia_corte: data.dia_corte }, msi, s, []);
    setOcupado(false);
    if (e2) return setError("La tarjeta se creó, pero no se guardaron sus saldos: " + errorTexto(e2) + ". Toca Guardar otra vez para reintentar.");
    await recargar();
    aviso("Tarjeta agregada");
    setPaso(5);
  }

  const pasos = ["La tarjeta", "Compras a meses", "Saldo y pago", "Revisar"];
  const conMsi = msi.filter((f) => Number(f.mensualidad) > 0);
  return (
    <>
      <Cabeza titulo="Nueva tarjeta de crédito" volver />
      {paso <= 4 && <p className="sub" style={{ marginTop: -10, marginBottom: 16 }}>Paso {paso} de 4 · {pasos[paso - 1]}</p>}

      {paso === 1 && (
        <>
          <Campo etiqueta="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="TDC Santander LikeU" autoFocus /></Campo>
          <Campo etiqueta="Palabra con la que aparece en Wallet" ayuda="Así los pagos con Apple Pay se cargan a esta tarjeta. Ej. LikeU, Oro.">
            <input value={wallet} onChange={(e) => setWallet(e.target.value)} />
          </Campo>
          <div className="dos">
            <Campo etiqueta="Día de corte"><input inputMode="numeric" value={corte} onChange={(e) => setCorte(e.target.value.replace(/\D/g, ""))} placeholder="10" /></Campo>
            <Campo etiqueta="Día límite de pago"><input inputMode="numeric" value={pago} onChange={(e) => setPago(e.target.value.replace(/\D/g, ""))} placeholder="30" /></Campo>
          </div>
          <Campo etiqueta="Límite de crédito"><input inputMode="decimal" value={limite} onChange={(e) => setLimite(limpiarMonto(e.target.value))} placeholder="$30,000" /></Campo>
          <p className="nota">Los encuentras en tu estado de cuenta o en la app del banco.</p>
        </>
      )}

      {paso === 2 && (
        <>
          <p style={{ marginTop: 0 }}>Copia de tu último estado de cuenta cada compra a meses que sigues pagando: la <b>mensualidad</b> y el <b>pago “N de M”</b> tal como aparece. Si no tienes, sigue.</p>
          <ListaMensualidades filas={msi} onCambio={setMsi} />
          {conMsi.length > 0 && <p className="nota">Te faltan {fmt(msi.reduce((a, f) => a + faltante(f), 0))} de meses sin intereses.</p>}
        </>
      )}

      {paso === 3 && <BloqueSaldos s={s} onCambio={setS} filas={msi} limite={Number(limite) || 0} corte={Number(corte)} />}

      {paso === 4 && (
        <>
          <div className="lista">
            <div className="fila"><div className="cuerpo"><div className="titulo">{nombre}</div><div className="detalle">Corte día {corte} · pago día {pago}{wallet ? ` · Wallet: ${wallet}` : ""}</div></div></div>
            <div className="fila"><div className="cuerpo"><div className="titulo">Deuda total hoy</div><div className="detalle">Incluye lo que falta de meses sin intereses</div></div><div className="monto negativo">{fmt(deuda)}</div></div>
            {Number(limite) > 0 && <div className="fila"><div className="cuerpo"><div className="titulo">Crédito disponible</div></div><div className="monto">{fmt(Number(limite) - deuda)}</div></div>}
            <div className="fila"><div className="cuerpo"><div className="titulo">Pago de este mes</div><div className="detalle">Para no generar intereses</div></div>
              <div className="monto">{s.yaPagado ? "Pagado" : Number(s.pago) > 0 ? fmt(Number(s.pago)) : "La app lo estima"}</div></div>
            <div className="fila"><div className="cuerpo"><div className="titulo">Compras a meses</div><div className="detalle">{conMsi.length || "Ninguna"}</div></div></div>
          </div>
          <p className="nota">A partir de hoy, cada compra con esta tarjeta (Apple Pay, atajo o la app) aumenta la deuda, y cada pago que hagas la reduce.</p>
        </>
      )}

      {paso === 5 && (
        <>
          <div className="aviso verde" style={{ marginTop: 0 }}><span><strong>{nombre} quedó lista.</strong> Su deuda de hoy es {fmt(deuda)}.</span></div>
          <p>Lo que compraste antes de hoy ya está dentro de esa deuda. Si quieres que cuente en tu presupuesto, regístralo con su fecha real: sumará a tus gastos sin mover el saldo de la tarjeta.</p>
          <div className="acciones">
            <button className="boton claro" onClick={() => nav("/ajustes/cuentas", { replace: true })}>Ver mis cuentas</button>
            <button className="boton" onClick={() => nav("/nuevo", { replace: true })}>Registrar una compra</button>
          </div>
        </>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      {paso <= 4 && (
        <div className="acciones">
          {paso > 1 && <button className="boton claro" onClick={() => setPaso(paso - 1)}>Atrás</button>}
          {paso < 4 ? <button className="boton" onClick={siguiente}>{paso === 2 && !conMsi.length ? "No tengo, seguir" : "Siguiente"}</button>
            : <button className="boton" onClick={guardar} disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar tarjeta"}</button>}
        </div>
      )}
    </>
  );
}

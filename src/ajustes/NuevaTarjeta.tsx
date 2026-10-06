import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { sb } from "../supabase";
import { useApp, type Cuenta } from "../contexto";
import { Cabeza, Campo } from "../ui";
import { errorTexto, fmt, hoyISO, mesISO, sumarMes, limpiarMonto } from "../util";

// Fecha de compra equivalente a "llevo n mensualidades facturadas" según el día de corte
export function fechaParaFacturadas(corte: number | null, n: number) {
  const hoy = hoyISO();
  if (n <= 0) return hoy;
  const [y, m, d] = hoy.split("-").map(Number);
  const c = Math.min(corte ?? 31, new Date(Date.UTC(y, m, 0)).getUTCDate());
  let ultimoCorte = mesISO(hoy);
  if (d < c) ultimoCorte = sumarMes(ultimoCorte, -1);
  return sumarMes(ultimoCorte, -(n - 1));
}

export type MsiFila = { descripcion: string; monto: string; meses: string; facturadas: string };
const filaVacia = (): MsiFila => ({ descripcion: "", monto: "", meses: "12", facturadas: "0" });

export const pendienteDe = (f: MsiFila) => {
  const monto = Number(f.monto) || 0, meses = Number(f.meses) || 0, fact = Math.min(Number(f.facturadas) || 0, meses);
  return meses > 0 ? (monto / meses) * (meses - fact) : 0;
};

// Lista editable de compras a meses que ya traías
export function ListaMsi({ filas, onCambio }: { filas: MsiFila[]; onCambio: (f: MsiFila[]) => void }) {
  const set = (i: number, k: keyof MsiFila, v: string) => onCambio(filas.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  return (
    <>
      {filas.map((f, i) => {
        const meses = Number(f.meses) || 0;
        return (
          <div key={i} className="lista" style={{ padding: "14px 14px 2px", marginBottom: 12 }}>
            <Campo etiqueta="¿Qué compraste?"><input value={f.descripcion} onChange={(e) => set(i, "descripcion", e.target.value)} placeholder="Refrigerador" /></Campo>
            <div className="dos">
              <Campo etiqueta="Monto total de la compra"><input inputMode="decimal" value={f.monto} onChange={(e) => set(i, "monto", limpiarMonto(e.target.value))} placeholder="$12,000" /></Campo>
              <Campo etiqueta="Meses">
                <select value={f.meses} onChange={(e) => set(i, "meses", e.target.value)}>
                  {[3, 6, 9, 10, 12, 13, 15, 18, 20, 24, 36, 48].map((n) => <option key={n} value={n}>{n} meses</option>)}
                </select>
              </Campo>
            </div>
            <Campo etiqueta="Mensualidades que ya te han cobrado" ayuda="Las que ya aparecieron en estados de cuenta anteriores. Si la compraste después de tu último corte, deja 0.">
              <select value={f.facturadas} onChange={(e) => set(i, "facturadas", e.target.value)}>
                {Array.from({ length: meses }, (_, n) => <option key={n} value={n}>{n} de {meses}</option>)}
              </select>
            </Campo>
            {Number(f.monto) > 0 && (
              <p className="nota" style={{ marginTop: -6, marginBottom: 12 }}>
                Mensualidad de {fmt(Number(f.monto) / meses)} · faltan {meses - Number(f.facturadas)} · por pagar {fmt(pendienteDe(f))}
              </p>
            )}
            <button type="button" className="boton chico peligro" style={{ marginBottom: 12 }} onClick={() => onCambio(filas.filter((_, j) => j !== i))}>Quitar</button>
          </div>
        );
      })}
      <button type="button" className="boton claro ancho" onClick={() => onCambio([...filas, filaVacia()])}>
        {filas.length ? "Agregar otra compra a meses" : "Agregar una compra a meses"}
      </button>
    </>
  );
}

export async function guardarMsiExistentes(cuenta: Pick<Cuenta, "id" | "dia_corte">, filas: MsiFila[]) {
  const validas = filas.filter((f) => Number(f.monto) > 0 && Number(f.meses) > 1);
  if (!validas.length) return null;
  const { error } = await sb.from("movimientos").insert(validas.map((f) => ({
    tipo: "gasto", monto: Number(f.monto), cuenta_id: cuenta.id, meses_msi: Number(f.meses),
    fecha: fechaParaFacturadas(cuenta.dia_corte, Number(f.facturadas)),
    descripcion: f.descripcion.trim() || "Compra a meses", origen: "Saldo inicial", en_saldo_inicial: true,
  })));
  return error;
}

export default function NuevaTarjeta() {
  const { uid, cuentas, recargar, aviso } = useApp();
  const nav = useNavigate();
  const [paso, setPaso] = useState(1);
  const [nombre, setNombre] = useState("");
  const [wallet, setWallet] = useState("");
  const [limite, setLimite] = useState("");
  const [corte, setCorte] = useState("");
  const [pago, setPago] = useState("");
  const [saldoActual, setSaldoActual] = useState("");
  const [saldoMsi, setSaldoMsi] = useState("");
  const [msi, setMsi] = useState<MsiFila[]>([]);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const deuda = (Number(saldoActual) || 0) + (Number(saldoMsi) || 0);
  const disponible = Number(limite) > 0 ? Number(limite) - deuda : null;
  const pendienteRegistrado = msi.reduce((s, f) => s + pendienteDe(f), 0);
  const dif = (Number(saldoMsi) || 0) - pendienteRegistrado;

  function siguiente() {
    setError("");
    if (paso === 1) {
      if (!nombre.trim()) return setError("Escribe el nombre de la tarjeta.");
      const c = Number(corte), p = Number(pago);
      if (!(c >= 1 && c <= 31) || !(p >= 1 && p <= 31)) return setError("Escribe el día de corte y el día límite de pago (1 a 31).");
    }
    setPaso(paso + 1);
  }

  async function guardar() {
    setError(""); setOcupado(true);
    const { data, error } = await sb.from("cuentas").insert({
      propietario_id: uid, nombre: nombre.trim(), tipo: "credito", saldo_inicial: -deuda, fecha_saldo_inicial: hoyISO(),
      dia_corte: Number(corte), dia_pago: Number(pago), limite_credito: Number(limite) || null,
      nombre_wallet: wallet.trim() || null, visibilidad: "privada", orden: cuentas.length,
    }).select("id, dia_corte").single();
    if (error) { setOcupado(false); return setError(errorTexto(error)); }
    const e2 = await guardarMsiExistentes(data, msi);
    setOcupado(false);
    if (e2) return setError("La tarjeta se guardó, pero no las compras a meses: " + errorTexto(e2));
    await recargar();
    aviso("Tarjeta agregada");
    setPaso(5);
  }

  const pasos = ["La tarjeta", "Lo que debes hoy", "Compras a meses", "Revisar"];
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
          <p style={{ marginTop: 0 }}>Abre la app de tu banco y copia estos dos datos tal como aparecen hoy:</p>
          <Campo etiqueta="Saldo actual" ayuda="Lo que debes sin contar meses sin intereses. Suele llamarse “Saldo actual”, “Saldo al día” o “Deuda actual”.">
            <input className="monto-grande" inputMode="decimal" value={saldoActual} onChange={(e) => setSaldoActual(limpiarMonto(e.target.value))} placeholder="$0" />
          </Campo>
          <Campo etiqueta="Saldo de meses sin intereses" ayuda="Lo que falta por facturar de tus compras a meses. Suele llamarse “Saldo MSI” o “Saldo de promociones”. Si no tienes, déjalo vacío.">
            <input inputMode="decimal" value={saldoMsi} onChange={(e) => setSaldoMsi(limpiarMonto(e.target.value))} placeholder="$0" />
          </Campo>
          <div className="trio" style={{ gridTemplateColumns: disponible !== null ? "1fr 1fr" : "1fr" }}>
            <div><div className="k">Deuda total hoy</div><div className="v negativo">{fmt(deuda)}</div></div>
            {disponible !== null && <div><div className="k">Crédito disponible</div><div className="v">{fmt(disponible)}</div></div>}
          </div>
          <p className="nota">Si el disponible coincide con el que te muestra el banco, vas bien.</p>
        </>
      )}

      {paso === 3 && (
        <>
          <p style={{ marginTop: 0 }}>Agrega las compras a meses que sigues pagando. Así la app sabe cuántas mensualidades faltan y cuánto viene cada mes. No se vuelven a sumar a la deuda: ya están en el saldo de MSI.</p>
          <ListaMsi filas={msi} onCambio={setMsi} />
          {Number(saldoMsi) > 0 && (
            <div className={"aviso " + (Math.abs(dif) < 5 ? "verde" : "")}>
              <span>
                {Math.abs(dif) < 5 ? <>Cuadra con el saldo de MSI del banco ({fmt(Number(saldoMsi))}).</>
                  : dif > 0 ? <>Llevas {fmt(pendienteRegistrado)} de {fmt(Number(saldoMsi))} de MSI. Faltan {fmt(dif)} por registrar.</>
                  : <>Lo registrado ({fmt(pendienteRegistrado)}) supera el saldo de MSI del banco ({fmt(Number(saldoMsi))}). Revisa montos o mensualidades.</>}
              </span>
            </div>
          )}
          <p className="nota">Puedes saltarte este paso y agregarlas después desde Más › Compras a meses.</p>
        </>
      )}

      {paso === 4 && (
        <>
          <div className="lista">
            <div className="fila"><div className="cuerpo"><div className="titulo">{nombre}</div><div className="detalle">Corte día {corte} · pago día {pago}{wallet ? ` · Wallet: ${wallet}` : ""}</div></div></div>
            <div className="fila"><div className="cuerpo"><div className="titulo">Deuda total hoy</div><div className="detalle">Saldo {fmt(Number(saldoActual) || 0)} + MSI {fmt(Number(saldoMsi) || 0)}</div></div><div className="monto negativo">{fmt(deuda)}</div></div>
            {disponible !== null && <div className="fila"><div className="cuerpo"><div className="titulo">Crédito disponible</div></div><div className="monto">{fmt(disponible)}</div></div>}
            <div className="fila"><div className="cuerpo"><div className="titulo">Compras a meses</div><div className="detalle">{msi.filter((f) => Number(f.monto) > 0).length || "Ninguna"}{msi.length ? ` · por facturar ${fmt(pendienteRegistrado)}` : ""}</div></div></div>
          </div>
          <p className="nota">A partir de hoy, cada compra con esta tarjeta (Apple Pay, atajo o la app) aumenta la deuda, y cada pago que hagas (transferencia a la tarjeta) la reduce.</p>
        </>
      )}

      {paso === 5 && (
        <>
          <div className="aviso verde" style={{ marginTop: 0 }}><span><strong>{nombre} quedó lista.</strong> Su deuda de hoy es {fmt(deuda)}.</span></div>
          <h2>¿Y las compras de este mes?</h2>
          <p>Ya están dentro de la deuda que capturaste. Si quieres que cuenten en tu presupuesto del mes, regístralas con su fecha real (anterior a hoy): sumarán a tus gastos pero no moverán el saldo de la tarjeta.</p>
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
          {paso < 4 ? <button className="boton" onClick={siguiente}>{paso === 3 && !msi.length ? "No tengo, seguir" : "Siguiente"}</button>
            : <button className="boton" onClick={guardar} disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar tarjeta"}</button>}
        </div>
      )}
    </>
  );
}

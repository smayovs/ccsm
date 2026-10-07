import { sb } from "../supabase";
import { Campo, Segmentos } from "../ui";
import { fmt, hoyISO, limpiarMonto, mesISO, sumarMes } from "../util";

// ---------- Fechas de corte (misma regla que la base de datos) ----------
const ultimoDia = (mes: string) => { const [y, m] = mes.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const conDia = (mes: string, d: number) => `${mes.slice(0, 8)}${String(Math.min(d, ultimoDia(mes))).padStart(2, "0")}`;

// Fecha del último corte que ya ocurrió (hoy cuenta si es día de corte)
export function ultimoCorte(corte: number, hoy = hoyISO()) {
  const mes = mesISO(hoy);
  const f = conDia(mes, corte);
  return f <= hoy ? f : conDia(sumarMes(mes, -1), corte);
}
const masUnDia = (f: string) => { const d = new Date(f + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

// Mensualidades ya cobradas (facturadas) de una compra, igual que _msi_facturadas en la base
export function facturadas(fecha: string, corte: number, meses: number, hoy = hoyISO()) {
  const primer = fecha <= conDia(mesISO(fecha), corte) ? mesISO(fecha) : sumarMes(mesISO(fecha), 1);
  const ult = mesISO(ultimoCorte(corte, hoy));
  const [y1, m1] = primer.split("-").map(Number), [y2, m2] = ult.split("-").map(Number);
  return Math.max(0, Math.min(meses, (y2 - y1) * 12 + (m2 - m1) + 1));
}

// Fecha que hace que la compra lleve exactamente n mensualidades cobradas al último corte
export function fechaParaPago(corte: number, n: number, hoy = hoyISO()) {
  const ult = ultimoCorte(corte, hoy);
  if (n <= 0) return masUnDia(ult);
  return sumarMes(mesISO(ult), -(n - 1));
}

// ---------- Lista de compras a meses capturada como en el estado de cuenta ----------
export type FilaMsi = { id?: string; descripcion: string; mensualidad: string; n: string; m: string; fecha?: string; monto?: number;
  orig?: { descripcion: string; mensualidad: string; n: string; m: string } };
export const filaNueva = (): FilaMsi => ({ descripcion: "", mensualidad: "", n: "1", m: "12" });
export const faltante = (f: FilaMsi) => {
  const men = Number(f.mensualidad) || 0, n = Math.min(Number(f.n) || 0, Number(f.m) || 0), m = Number(f.m) || 0;
  return Math.round(men * (m - n) * 100) / 100;
};

export function ListaMensualidades({ filas, onCambio }: { filas: FilaMsi[]; onCambio: (f: FilaMsi[]) => void }) {
  const set = (i: number, k: keyof FilaMsi, v: string) => onCambio(filas.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  return (
    <>
      {filas.map((f, i) => (
        <div key={f.id ?? `n${i}`} className="lista" style={{ padding: "14px 14px 4px", marginBottom: 12 }}>
          <Campo etiqueta="Compra"><input value={f.descripcion} onChange={(e) => set(i, "descripcion", e.target.value)} placeholder="Refrigerador" /></Campo>
          <div className="tres">
            <Campo etiqueta="Mensualidad"><input inputMode="decimal" value={f.mensualidad} onChange={(e) => set(i, "mensualidad", limpiarMonto(e.target.value))} placeholder="$500" /></Campo>
            <Campo etiqueta="Pago número"><input inputMode="numeric" value={f.n} onChange={(e) => set(i, "n", e.target.value.replace(/\D/g, ""))} placeholder="3" /></Campo>
            <Campo etiqueta="de"><input inputMode="numeric" value={f.m} onChange={(e) => set(i, "m", e.target.value.replace(/\D/g, ""))} placeholder="12" /></Campo>
          </div>
          {Number(f.mensualidad) > 0 && Number(f.m) > 0 && (
            <p className="nota" style={{ marginTop: -6, marginBottom: 10 }}>
              {Number(f.n) > Number(f.m) ? "El pago número no puede ser mayor que el total de meses."
                : <>Compra de {fmt(Number(f.mensualidad) * Number(f.m))} · te faltan {Number(f.m) - Number(f.n)} pagos ({fmt(faltante(f))})</>}
            </p>
          )}
          <button type="button" className="boton chico peligro" style={{ marginBottom: 10 }} onClick={() => {
            if (f.id && !window.confirm(`¿Quitar "${f.descripcion || "esta compra"}"? Se borra de tus movimientos.`)) return;
            onCambio(filas.filter((_, j) => j !== i));
          }}>Quitar</button>
        </div>
      ))}
      <button type="button" className="boton claro ancho" onClick={() => onCambio([...filas, filaNueva()])}>
        {filas.length ? "Agregar otra compra a meses" : "Agregar una compra a meses"}
      </button>
    </>
  );
}

// ---------- Saldos: deuda total y pago del estado de cuenta ----------
export type Saldos = { saldoBanco: string; incluyeMeses: "si" | "no"; pago: string; yaPagado: boolean };
export const saldosVacios: Saldos = { saldoBanco: "", incluyeMeses: "no", pago: "", yaPagado: false };
export const deudaTotal = (s: Saldos, filas: FilaMsi[]) =>
  (Number(s.saldoBanco) || 0) + (s.incluyeMeses === "no" ? filas.reduce((a, f) => a + faltante(f), 0) : 0);

export function BloqueSaldos({ s, onCambio, filas, limite, corte }: { s: Saldos; onCambio: (s: Saldos) => void; filas: FilaMsi[]; limite: number; corte: number }) {
  const meses = filas.reduce((a, f) => a + faltante(f), 0);
  const deuda = deudaTotal(s, filas);
  const fCorte = corte ? ultimoCorte(corte) : null;
  return (
    <>
      <Campo etiqueta="Saldo que te muestra el banco hoy" ayuda="El saldo o deuda actual de la tarjeta en la app de tu banco.">
        <input className="monto-grande" inputMode="decimal" value={s.saldoBanco} onChange={(e) => onCambio({ ...s, saldoBanco: limpiarMonto(e.target.value) })} placeholder="$0" />
      </Campo>
      {meses > 0 && (
        <>
          <span className="campo" style={{ marginBottom: 6 }}><span>¿Ese saldo ya incluye lo que te falta de meses ({fmt(meses)})?</span></span>
          <Segmentos etiqueta="Incluye meses" valor={s.incluyeMeses} onCambio={(v) => onCambio({ ...s, incluyeMeses: v })}
            opciones={[{ v: "no", t: "No, súmalo" }, { v: "si", t: "Sí, ya viene incluido" }]} />
        </>
      )}
      <Campo etiqueta={`Pago para no generar intereses${fCorte ? ` (estado de cuenta del ${new Date(fCorte + "T12:00:00Z").toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" })})` : ""}`}
        ayuda="Viene en tu último estado de cuenta. Si ya abonaste una parte, escribe solo lo que te falta.">
        <input inputMode="decimal" value={s.pago} onChange={(e) => onCambio({ ...s, pago: limpiarMonto(e.target.value) })} placeholder="$0" disabled={s.yaPagado} />
      </Campo>
      <label className="casilla"><input type="checkbox" checked={s.yaPagado} onChange={(e) => onCambio({ ...s, yaPagado: e.target.checked })} /> Ya lo pagué completo</label>
      <div className="trio" style={{ gridTemplateColumns: limite > 0 ? "1fr 1fr" : "1fr" }}>
        <div><div className="k">Deuda total</div><div className="v negativo">{fmt(deuda)}</div></div>
        {limite > 0 && <div><div className="k">Crédito disponible</div><div className="v">{fmt(limite - deuda)}</div></div>}
      </div>
      <p className="nota">{limite > 0 ? "Si el disponible coincide con el que te muestra el banco, cuadra. " : ""}La deuda total incluye todo lo que te falta pagar de meses sin intereses.</p>
    </>
  );
}

// ---------- Guardar: deja la tarjeta exactamente como dice tu estado de cuenta ----------
export function filasInvalidas(filas: FilaMsi[]) {
  return filas.filter((f) => (f.id || Number(f.mensualidad) > 0) &&
    (!(Number(f.mensualidad) > 0) || !(Number(f.m) >= 2) || Number(f.n) > Number(f.m) || f.n === ""));
}

export async function aplicarSaldos(cuenta: { id: string; dia_corte: number }, filas: FilaMsi[], s: Saldos, existentes: FilaMsi[]) {
  const hoy = hoyISO();
  const corte = cuenta.dia_corte;
  if (filasInvalidas(filas).length) return { message: "Revisa las compras a meses: falta la mensualidad o el pago número es mayor que el total." };
  const validas = filas.filter((f) => Number(f.mensualidad) > 0);
  // 1) Solo se mandan los cambios reales; lo que no tocaste se queda igual
  const cambios = validas.map((f): Record<string, unknown> => {
    const m = Number(f.m), n = Number(f.n), men = Number(f.mensualidad);
    const c: Record<string, unknown> = { meses: m };
    if (!f.id || !f.orig) {
      return { meses: m, monto: Math.round(men * m * 100) / 100, fecha: fechaParaPago(corte, n, hoy), descripcion: f.descripcion.trim() || "Compra a meses" };
    }
    if (f.mensualidad !== f.orig.mensualidad || f.m !== f.orig.m) c.monto = Math.round(men * m * 100) / 100;
    if (f.n !== f.orig.n || f.m !== f.orig.m) c.fecha = fechaParaPago(corte, n, hoy);
    if (f.descripcion.trim() !== f.orig.descripcion.trim()) c.descripcion = f.descripcion.trim();
    return { id: f.id, ...c };
  });
  // 2) Quitar solo lo que marcaste para quitar (con confirmación en pantalla)
  const quitadas = existentes.filter((e) => e.id && !filas.some((f) => f.id === e.id));
  for (const q of quitadas) {
    const { error } = await sb.from("movimientos").delete().eq("id", q.id!);
    if (error) return error;
  }
  // 3) Todo lo demás en un solo paso en el servidor
  const { error } = await sb.rpc("cuadrar_tarjeta", {
    p_cuenta: cuenta.id, p_cambios: cambios, p_deuda: Math.round(deudaTotal(s, validas) * 100) / 100,
    p_pago: s.yaPagado ? 0 : s.pago !== "" ? Number(s.pago) : null, p_corte: ultimoCorte(corte, hoy),
  });
  return error;
}

// Carga las compras a meses activas de una tarjeta en el formato del estado de cuenta
export async function cargarMensualidades(cuentaId: string, corte: number): Promise<FilaMsi[]> {
  const { data } = await sb.from("movimientos").select("id, fecha, descripcion, comercio, monto, meses_msi")
    .eq("cuenta_id", cuentaId).eq("tipo", "gasto").not("meses_msi", "is", null).order("fecha");
  return ((data ?? []) as any[]).map((x) => {
    const v = { descripcion: x.descripcion || x.comercio || "", mensualidad: String(Math.round((Number(x.monto) / x.meses_msi) * 100) / 100),
      m: String(x.meses_msi), n: String(facturadas(x.fecha, corte, x.meses_msi)) };
    return { id: x.id, fecha: x.fecha, monto: Number(x.monto), ...v, orig: { ...v } };
  }).filter((f) => Number(f.n) < Number(f.m));
}

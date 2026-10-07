import { useEffect, useState } from "react";
import { IconoCuenta } from "../iconos";
import { useNavigate } from "react-router-dom";
import { sb } from "../supabase";
import { useApp, type Cuenta } from "../contexto";
import { Cabeza, Campo, useUnaVez } from "../ui";
import { errorTexto, hoyISO, TIPOS_CUENTA, VISIBILIDAD, limpiarMonto } from "../util";

type Edit = Omit<Cuenta, "saldo_inicial" | "dia_corte" | "dia_pago" | "limite_credito" | "pago_mensual"> & {
  saldo_inicial: string; dia_corte: string; dia_pago: string; limite_credito: string; pago_mensual: string; conjunta: boolean;
};

export default function Cuentas() {
  const { uid, otros, recargar, aviso } = useApp();
  const [todas, setTodas] = useState<Cuenta[]>([]);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [error, setError] = useState("");
  const [eligiendo, setEligiendo] = useState(false);
  const [ordenando, setOrdenando] = useState(false);
  const unaVez = useUnaVez();
  const nav = useNavigate();
  const cargar = () => sb.from("cuentas").select("*").order("orden").order("nombre").then(({ data }) => setTodas((data ?? []) as Cuenta[]));
  useEffect(() => { cargar(); }, []);

  const nueva = (tipo = "debito"): Edit => ({ id: "", nombre: "", tipo, pago_mensual: "", propietario_id: uid, saldo_inicial: "", fecha_saldo_inicial: hoyISO(),
    dia_corte: "", dia_pago: "", limite_credito: "", nombre_wallet: "", visibilidad: "privada", activa: true, orden: todas.length, conjunta: false });

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); if (!edit) return; setError("");
    const saldo = Number(edit.saldo_inicial || 0);
    const fila: any = {
      nombre: edit.nombre.trim(), tipo: edit.tipo,
      saldo_inicial: edit.tipo === "credito" || edit.tipo === "prestamo" ? -Math.abs(saldo) : saldo,
      fecha_saldo_inicial: edit.fecha_saldo_inicial,
      dia_corte: edit.tipo === "credito" && edit.dia_corte ? Number(edit.dia_corte) : null,
      dia_pago: (edit.tipo === "credito" || edit.tipo === "prestamo") && edit.dia_pago ? Number(edit.dia_pago) : null,
      pago_mensual: edit.tipo === "prestamo" && edit.pago_mensual ? Number(edit.pago_mensual) : null,
      limite_credito: edit.tipo === "credito" && edit.limite_credito ? Number(edit.limite_credito) : null,
      nombre_wallet: edit.nombre_wallet?.trim() || null, visibilidad: edit.visibilidad, activa: edit.activa, orden: edit.orden,
    };
    if (!fila.nombre) return setError("Escribe el nombre de la cuenta.");
    if (fila.dia_pago !== null && !(fila.dia_pago >= 1 && fila.dia_pago <= 31)) return setError("El día de pago va de 1 a 31.");
    const r = edit.id
      ? await sb.from("cuentas").update(fila).eq("id", edit.id)
      : await sb.from("cuentas").insert({ ...fila, propietario_id: edit.conjunta ? null : uid });
    if (r.error) return setError(errorTexto(r.error));
    aviso("Cuenta guardada"); setEdit(null); cargar(); recargar();
  }
  async function borrar() {
    if (!edit?.id) return;
    if (!window.confirm(`¿Borrar ${edit.nombre}? Si tiene movimientos, mejor márcala como inactiva.`)) return;
    const { error } = await sb.from("cuentas").delete().eq("id", edit.id);
    if (error) return setError(errorTexto(error));
    aviso("Cuenta borrada"); setEdit(null); cargar(); recargar();
  }

  if (edit) {
    const credito = edit.tipo === "credito";
    const prestamo = edit.tipo === "prestamo";
    const deOtro = edit.id && edit.propietario_id && edit.propietario_id !== uid;
    return (
      <>
        <Cabeza titulo={edit.id ? "Editar cuenta" : "Nueva cuenta"} />
        {deOtro ? <p>Esta cuenta es de tu pareja; solo ella puede editarla.</p> : (
          <form onSubmit={(e) => { e.preventDefault(); unaVez(guardar)(e); }}>
            <Campo etiqueta="Nombre"><input value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} placeholder="TDC Santander LikeU" /></Campo>
            <Campo etiqueta="Tipo">
              <select value={edit.tipo} onChange={(e) => setEdit({ ...edit, tipo: e.target.value })}>
                {Object.entries(TIPOS_CUENTA).filter(([v]) => (edit.id || v !== "credito") && (v !== "credito" || credito) && (v !== "prestamo" || prestamo || !edit.id)).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </Campo>
            <div className="dos">
              <Campo etiqueta={credito ? "Deuda total al darla de alta" : prestamo ? "Cuánto debes" : "Saldo"}
                ayuda={credito ? "Saldo actual + saldo de MSI, en positivo. Las compras a meses se registran aparte en Más › Compras a meses." : prestamo ? "Lo que te falta por pagar (el saldo que te da el banco o la persona)." : undefined}>
                <input inputMode="decimal" value={edit.saldo_inicial}
                  onChange={(e) => setEdit({ ...edit, saldo_inicial: credito || prestamo ? limpiarMonto(e.target.value) : (e.target.value.trim().startsWith("-") ? "-" : "") + limpiarMonto(e.target.value) })} />
              </Campo>
              <Campo etiqueta="Al día" ayuda="Solo cuentan movimientos desde esta fecha."><input type="date" value={edit.fecha_saldo_inicial} onChange={(e) => setEdit({ ...edit, fecha_saldo_inicial: e.target.value })} /></Campo>
            </div>
            {credito && (
              <>
                <div className="dos">
                  <Campo etiqueta="Día de corte"><input inputMode="numeric" value={edit.dia_corte} onChange={(e) => setEdit({ ...edit, dia_corte: e.target.value.replace(/\D/g, "") })} placeholder="10" /></Campo>
                  <Campo etiqueta="Día límite de pago"><input inputMode="numeric" value={edit.dia_pago} onChange={(e) => setEdit({ ...edit, dia_pago: e.target.value.replace(/\D/g, "") })} placeholder="30" /></Campo>
                </div>
                <Campo etiqueta="Límite de crédito"><input inputMode="decimal" value={edit.limite_credito} onChange={(e) => setEdit({ ...edit, limite_credito: limpiarMonto(e.target.value) })} /></Campo>
              </>
            )}
            {prestamo && (
              <>
                <div className="dos">
                  <Campo etiqueta="Pago mensual (opcional)"><input inputMode="decimal" value={edit.pago_mensual} onChange={(e) => setEdit({ ...edit, pago_mensual: limpiarMonto(e.target.value) })} placeholder="$3,500" /></Campo>
                  <Campo etiqueta="Día de pago"><input inputMode="numeric" value={edit.dia_pago} onChange={(e) => setEdit({ ...edit, dia_pago: e.target.value.replace(/\D/g, "") })} placeholder="15" /></Campo>
                </div>
                <p className="nota" style={{ marginTop: -6 }}>Cada pago regístralo como <b>Transferencia</b> de tu cuenta de débito a este préstamo; así baja la deuda. Si aplica intereses, regístralos como gasto en esta cuenta.</p>
              </>
            )}
            {!prestamo && <Campo etiqueta="Nombre en Wallet" ayuda="Una palabra del nombre de la tarjeta en Wallet (ej. LikeU). Así Apple Pay sabe a qué cuenta cargar.">
              <input value={edit.nombre_wallet ?? ""} onChange={(e) => setEdit({ ...edit, nombre_wallet: e.target.value })} />
            </Campo>}
            {!edit.id && otros.length > 0 && (
              <label className="casilla"><input type="checkbox" checked={edit.conjunta} onChange={(e) => setEdit({ ...edit, conjunta: e.target.checked })} /> Cuenta conjunta (los dos registran y la ven completa)</label>
            )}
            {!edit.conjunta && edit.propietario_id !== null && (
              <Campo etiqueta="¿Qué ve tu pareja?">
                <select value={edit.visibilidad} onChange={(e) => setEdit({ ...edit, visibilidad: e.target.value })}>
                  {Object.entries(VISIBILIDAD).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </Campo>
            )}
            <label className="casilla"><input type="checkbox" checked={edit.activa} onChange={(e) => setEdit({ ...edit, activa: e.target.checked })} /> Activa (desactívala si la cancelaste)</label>
            <div className="acciones">
              <button type="button" className="boton claro" onClick={() => setEdit(null)}>Cancelar</button>
              <button className="boton">Guardar</button>
            </div>
            {edit.id && <div className="acciones"><button type="button" className="boton peligro" onClick={borrar}>Borrar cuenta</button></div>}
            {error && <p className="error" role="alert">{error}</p>}
          </form>
        )}
      </>
    );
  }

  const ORDEN_TIPOS = ["credito", "debito", "ahorro", "efectivo", "inversion", "prestamo"];
  const titulosTipo: Record<string, string> = { credito: "Tarjetas de crédito", debito: "Débito", ahorro: "Ahorro", efectivo: "Efectivo", inversion: "Inversión", prestamo: "Deudas y préstamos" };
  const mias = todas.filter((c) => c.propietario_id === uid).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
  async function mover(lista: Cuenta[], i: number, d: number) {
    const j = i + d; if (j < 0 || j >= lista.length) return;
    const nueva = [...lista]; [nueva[i], nueva[j]] = [nueva[j], nueva[i]];
    setTodas(todas.map((c) => { const k = nueva.findIndex((x) => x.id === c.id); return k >= 0 ? { ...c, orden: k } : c; }));
    const r = await Promise.all(nueva.map((c, k) => c.orden === k ? null : sb.from("cuentas").update({ orden: k }).eq("id", c.id)));
    const e = r.find((x) => x?.error); if (e?.error) setError(errorTexto(e.error));
    recargar();
  }
  const grupos: [string, Cuenta[]][] = [
    ...ORDEN_TIPOS.map((t) => [titulosTipo[t], mias.filter((c) => c.tipo === t)] as [string, Cuenta[]]),
    ["Otras", mias.filter((c) => !ORDEN_TIPOS.includes(c.tipo))],
    ["Conjuntas", todas.filter((c) => c.propietario_id === null)],
    ["De tu pareja (las que comparte)", todas.filter((c) => c.propietario_id && c.propietario_id !== uid)],
  ];
  return (
    <>
      <Cabeza titulo="Cuentas" volver accion={<div style={{ display: "flex", gap: 6 }}>
        {mias.length > 1 && <button className={"boton chico" + (ordenando ? "" : " claro")} onClick={() => setOrdenando(!ordenando)}>{ordenando ? "Listo" : "Ordenar"}</button>}
        {!ordenando && <button className="boton chico" onClick={() => setEligiendo(!eligiendo)}>Agregar</button>}
      </div>} />
      {ordenando && <p className="nota" style={{ marginTop: -8 }}>Usa las flechas para cambiar el orden dentro de cada grupo. Así se ven en Inicio y en los menús.</p>}
      {eligiendo && (
        <div className="lista" style={{ marginBottom: 16 }}>
          <button className="fila" onClick={() => nav("/ajustes/tarjeta-nueva")}><IconoCuenta tipo="credito" /><div className="cuerpo"><div className="titulo">Tarjeta de crédito</div><div className="detalle">Nombre, corte, pago y límite; lo demás se acumula solo</div></div><span aria-hidden="true">›</span></button>
          <button className="fila" onClick={() => { setEligiendo(false); setEdit(nueva()); }}><IconoCuenta tipo="debito" /><div className="cuerpo"><div className="titulo">Débito, ahorro, efectivo o inversión</div><div className="detalle">Solo nombre y saldo de hoy</div></div><span aria-hidden="true">›</span></button>
          <button className="fila" onClick={() => { setEligiendo(false); setEdit(nueva("prestamo")); }}><IconoCuenta tipo="prestamo" /><div className="cuerpo"><div className="titulo">Deuda o préstamo</div><div className="detalle">Crédito de auto, hipoteca, préstamo personal o dinero que debes a alguien</div></div><span aria-hidden="true">›</span></button>
        </div>
      )}
      {todas.length === 0 && <p>Agrega tus cuentas con el saldo de hoy: débito, cada tarjeta de crédito y tu cuenta de ahorro.</p>}
      {grupos.map(([t, l]) => l.length > 0 && (
        <section key={t}>
          <h2>{t}</h2>
          <div className="lista">
            {l.map((c, i) => ordenando && c.propietario_id === uid ? (
              <div className="fila" key={c.id}>
                <IconoCuenta tipo={c.tipo} conjunta={false} />
                <div className="cuerpo"><div className="titulo">{c.nombre}</div></div>
                <button className="boton chico claro" aria-label={`Subir ${c.nombre}`} disabled={i === 0} onClick={() => mover(l, i, -1)}>↑</button>
                <button className="boton chico claro" aria-label={`Bajar ${c.nombre}`} disabled={i === l.length - 1} onClick={() => mover(l, i, 1)}>↓</button>
              </div>
            ) : (
              <button className="fila" key={c.id} onClick={() => setEdit({ ...c, saldo_inicial: String(c.tipo === "credito" || c.tipo === "prestamo" ? Math.abs(Number(c.saldo_inicial)) : c.saldo_inicial), pago_mensual: String(c.pago_mensual ?? ""), dia_corte: String(c.dia_corte ?? ""),
                dia_pago: String(c.dia_pago ?? ""), limite_credito: String(c.limite_credito ?? ""), conjunta: c.propietario_id === null })}>
                <IconoCuenta tipo={c.tipo} conjunta={c.propietario_id === null} />
                <div className="cuerpo">
                  <div className="titulo">{c.nombre}</div>
                  <div className="detalle">
                    {!c.activa && <span className="etiq">Inactiva</span>}
                    {TIPOS_CUENTA[c.tipo]}{c.nombre_wallet ? ` · Wallet: ${c.nombre_wallet}` : ""}
                    {c.propietario_id === uid && ` · ${VISIBILIDAD[c.visibilidad].split(":")[0]}`}
                  </div>
                </div>
                <span aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

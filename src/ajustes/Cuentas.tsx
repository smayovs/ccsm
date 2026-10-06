import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { sb } from "../supabase";
import { useApp, type Cuenta } from "../contexto";
import { Cabeza, Campo } from "../ui";
import { errorTexto, hoyISO, TIPOS_CUENTA, VISIBILIDAD, limpiarMonto } from "../util";

type Edit = Omit<Cuenta, "saldo_inicial" | "dia_corte" | "dia_pago" | "limite_credito"> & {
  saldo_inicial: string; dia_corte: string; dia_pago: string; limite_credito: string; conjunta: boolean;
};

export default function Cuentas() {
  const { uid, otros, recargar, aviso } = useApp();
  const [todas, setTodas] = useState<Cuenta[]>([]);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [error, setError] = useState("");
  const [eligiendo, setEligiendo] = useState(false);
  const nav = useNavigate();
  const cargar = () => sb.from("cuentas").select("*").order("orden").order("nombre").then(({ data }) => setTodas((data ?? []) as Cuenta[]));
  useEffect(() => { cargar(); }, []);

  const nueva = (): Edit => ({ id: "", nombre: "", tipo: "debito", propietario_id: uid, saldo_inicial: "", fecha_saldo_inicial: hoyISO(),
    dia_corte: "", dia_pago: "", limite_credito: "", nombre_wallet: "", visibilidad: "privada", activa: true, orden: todas.length, conjunta: false });

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); if (!edit) return; setError("");
    const saldo = Number(edit.saldo_inicial || 0);
    const fila: any = {
      nombre: edit.nombre.trim(), tipo: edit.tipo,
      saldo_inicial: edit.tipo === "credito" ? -Math.abs(saldo) : saldo,
      fecha_saldo_inicial: edit.fecha_saldo_inicial,
      dia_corte: edit.tipo === "credito" && edit.dia_corte ? Number(edit.dia_corte) : null,
      dia_pago: edit.tipo === "credito" && edit.dia_pago ? Number(edit.dia_pago) : null,
      limite_credito: edit.tipo === "credito" && edit.limite_credito ? Number(edit.limite_credito) : null,
      nombre_wallet: edit.nombre_wallet?.trim() || null, visibilidad: edit.visibilidad, activa: edit.activa, orden: edit.orden,
    };
    if (!fila.nombre) return setError("Escribe el nombre de la cuenta.");
    const r = edit.id
      ? await sb.from("cuentas").update(fila).eq("id", edit.id)
      : await sb.from("cuentas").insert({ ...fila, propietario_id: edit.conjunta ? null : uid });
    if (r.error) return setError(errorTexto(r.error));
    aviso("Cuenta guardada"); setEdit(null); cargar(); recargar();
  }
  async function borrar() {
    if (!edit?.id) return;
    const { error } = await sb.from("cuentas").delete().eq("id", edit.id);
    if (error) return setError(errorTexto(error));
    aviso("Cuenta borrada"); setEdit(null); cargar(); recargar();
  }

  if (edit) {
    const credito = edit.tipo === "credito";
    const deOtro = edit.id && edit.propietario_id && edit.propietario_id !== uid;
    return (
      <>
        <Cabeza titulo={edit.id ? "Editar cuenta" : "Nueva cuenta"} />
        {deOtro ? <p>Esta cuenta es de tu pareja; solo ella puede editarla.</p> : (
          <form onSubmit={guardar}>
            <Campo etiqueta="Nombre"><input value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} placeholder="TDC Santander LikeU" /></Campo>
            <Campo etiqueta="Tipo">
              <select value={edit.tipo} onChange={(e) => setEdit({ ...edit, tipo: e.target.value })}>
                {Object.entries(TIPOS_CUENTA).filter(([v]) => edit.id || v !== "credito").map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </Campo>
            <div className="dos">
              <Campo etiqueta={credito ? "Deuda total al darla de alta" : "Saldo"} ayuda={credito ? "Saldo actual + saldo de MSI, en positivo. Las compras a meses se registran aparte en Más › Compras a meses." : undefined}>
                <input inputMode="decimal" value={edit.saldo_inicial}
                  onChange={(e) => setEdit({ ...edit, saldo_inicial: credito ? limpiarMonto(e.target.value) : e.target.value.replace(/[^\d.,-]/g, "").replace(",", ".") })} />
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
            <Campo etiqueta="Nombre en Wallet" ayuda="Una palabra del nombre de la tarjeta en Wallet (ej. LikeU). Así Apple Pay sabe a qué cuenta cargar.">
              <input value={edit.nombre_wallet ?? ""} onChange={(e) => setEdit({ ...edit, nombre_wallet: e.target.value })} />
            </Campo>
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

  const grupos: [string, Cuenta[]][] = [
    ["Mis cuentas", todas.filter((c) => c.propietario_id === uid)],
    ["Conjuntas", todas.filter((c) => c.propietario_id === null)],
    ["De tu pareja (las que comparte)", todas.filter((c) => c.propietario_id && c.propietario_id !== uid)],
  ];
  return (
    <>
      <Cabeza titulo="Cuentas" volver accion={<button className="boton chico" onClick={() => setEligiendo(!eligiendo)}>Agregar</button>} />
      {eligiendo && (
        <div className="lista" style={{ marginBottom: 16 }}>
          <button className="fila" onClick={() => nav("/ajustes/tarjeta-nueva")}><div className="cuerpo"><div className="titulo">Tarjeta de crédito</div><div className="detalle">Asistente: deuda de hoy, corte, pago y compras a meses</div></div><span aria-hidden="true">›</span></button>
          <button className="fila" onClick={() => { setEligiendo(false); setEdit(nueva()); }}><div className="cuerpo"><div className="titulo">Débito, ahorro, efectivo o inversión</div><div className="detalle">Solo nombre y saldo de hoy</div></div><span aria-hidden="true">›</span></button>
        </div>
      )}
      {todas.length === 0 && <p>Agrega tus cuentas con el saldo de hoy: débito, cada tarjeta de crédito y tu cuenta de ahorro.</p>}
      {grupos.map(([t, l]) => l.length > 0 && (
        <section key={t}>
          <h2>{t}</h2>
          <div className="lista">
            {l.map((c) => (
              <button className="fila" key={c.id} onClick={() => setEdit({ ...c, saldo_inicial: String(c.tipo === "credito" ? Math.abs(Number(c.saldo_inicial)) : c.saldo_inicial), dia_corte: String(c.dia_corte ?? ""),
                dia_pago: String(c.dia_pago ?? ""), limite_credito: String(c.limite_credito ?? ""), conjunta: c.propietario_id === null })}>
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
    </>
  );
}

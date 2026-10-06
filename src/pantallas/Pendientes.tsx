import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza, SelectorCategoria } from "../ui";
import { errorTexto, fechaCorta, fmt } from "../util";
import { SELECT_MOV, textoCategoria } from "./Movimientos";

export default function Pendientes({ onCambio }: { onCambio: (n: number) => void }) {
  const { uid, categorias, otros, aviso } = useApp();
  const [revisar, setRevisar] = useState<any[]>([]);
  const [sinCat, setSinCat] = useState<any[]>([]);
  const [disputas, setDisputas] = useState<any[]>([]);
  const [eleccion, setEleccion] = useState<Record<string, string | null>>({});
  const [error, setError] = useState("");
  const nombres: Record<string, string> = Object.fromEntries(otros.map((o) => [o.user_id, o.nombre]));

  const cargar = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      sb.from("movimientos").select(SELECT_MOV).eq("creado_por", uid).eq("revisar", true).order("fecha", { ascending: false }),
      sb.from("repartos").select("movimiento_id, monto, movimiento:movimientos(fecha, descripcion, comercio, monto, creado_por)").eq("user_id", uid).is("categoria_id", null),
      sb.from("repartos").select("movimiento_id, user_id, monto, nota, movimiento:movimientos!inner(fecha, descripcion, comercio, monto, creado_por)").eq("estado", "disputa").eq("movimiento.creado_por", uid),
    ]);
    setRevisar(a.data ?? []); setSinCat(b.data ?? []); setDisputas(c.data ?? []);
    onCambio((a.data?.length ?? 0) + (b.data?.length ?? 0));
  }, [uid, onCambio]);
  useEffect(() => { cargar(); }, [cargar]);

  async function asignar(movId: string) {
    const cat = eleccion[movId];
    if (!cat) return setError("Elige una categoría.");
    const { error } = await sb.from("repartos").update({ categoria_id: cat }).eq("movimiento_id", movId).eq("user_id", uid);
    if (error) return setError(errorTexto(error));
    aviso("Categoría asignada"); cargar();
  }
  async function resolver(movId: string, userId: string) {
    const { error } = await sb.from("repartos").update({ estado: "ok" }).eq("movimiento_id", movId).eq("user_id", userId);
    if (error) return setError(errorTexto(error));
    aviso("Marcado como resuelto"); cargar();
  }

  const nada = !revisar.length && !sinCat.length && !disputas.length;
  return (
    <>
      <Cabeza titulo="Pendientes" volver />
      {nada && <div className="lista"><div className="vacio">Todo en orden: no hay nada por revisar.</div></div>}

      {revisar.length > 0 && (
        <>
          <h2>Por clasificar</h2>
          <p className="nota" style={{ marginTop: -4, marginBottom: 8 }}>Entraron por Apple Pay sin regla o con una tarjeta que no reconocí. Tócalos para corregir; si el comercio es frecuente, agrégalo a <Link to="/ajustes/reglas">Reglas</Link>.</p>
          <div className="lista">
            {revisar.map((m) => (
              <Link className="fila" key={m.id} to={`/editar/${m.id}`}>
                <div className="cuerpo"><div className="titulo">{m.comercio || m.descripcion || "Sin descripción"}</div>
                  <div className="detalle">{fechaCorta(m.fecha)} · {m.cuenta?.nombre ?? "Cuenta sin identificar"} · {textoCategoria(m)}</div></div>
                <div className="monto">{fmt(m.monto)}</div>
              </Link>
            ))}
          </div>
        </>
      )}

      {sinCat.length > 0 && (
        <>
          <h2>Tu parte sin categoría</h2>
          <p className="nota" style={{ marginTop: -4, marginBottom: 8 }}>Gastos compartidos contigo cuya categoría no existe en tu lista. Elige dónde cuentan en tu presupuesto.</p>
          {sinCat.map((r) => (
            <div key={r.movimiento_id} className="lista" style={{ padding: "12px 14px 0", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <div><div style={{ fontWeight: 600 }}>{r.movimiento?.descripcion || r.movimiento?.comercio || "Gasto compartido"}</div>
                  <div className="sub">{fechaCorta(r.movimiento?.fecha)} · pagó {nombres[r.movimiento?.creado_por] ?? "tu pareja"}</div></div>
                <div className="num" style={{ fontWeight: 700 }}>{fmt(r.monto)}</div>
              </div>
              <SelectorCategoria cats={categorias} tipo="gasto" uid={uid} valor={eleccion[r.movimiento_id] ?? null}
                onCambio={(id) => setEleccion({ ...eleccion, [r.movimiento_id]: id })} />
              <div style={{ paddingBottom: 12 }}><button className="boton chico" onClick={() => asignar(r.movimiento_id)}>Asignar</button></div>
            </div>
          ))}
        </>
      )}

      {disputas.length > 0 && (
        <>
          <h2>En disputa</h2>
          <div className="lista">
            {disputas.map((r) => (
              <div className="fila" key={r.movimiento_id} style={{ flexWrap: "wrap" }}>
                <div className="cuerpo">
                  <div className="titulo">{r.movimiento?.descripcion || r.movimiento?.comercio || "Gasto"} · {fmt(r.movimiento?.monto)}</div>
                  <div className="detalle">{nombres[r.user_id]}: “{r.nota || "No está de acuerdo con el reparto"}” · le tocan {fmt(r.monto)}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Link className="boton chico claro" to={`/editar/${r.movimiento_id}`}>Ajustar</Link>
                  <button className="boton chico" onClick={() => resolver(r.movimiento_id, r.user_id)}>Resuelto</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

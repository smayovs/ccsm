import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza, SelectorCategoria } from "../ui";
import { errorTexto, fechaCorta, fmt, hoyISO } from "../util";
import { cargarProgramados, type IngresoProgramado } from "../ingresos";
import { IconoMov, SELECT_MOV, textoCategoria } from "./Movimientos";
import { CheckCircle, Handshake, Wallet } from "../phosphor";

export default function Pendientes({ onCambio }: { onCambio: (n: number) => void }) {
  const { uid, categorias, otros, aviso } = useApp();
  const [revisar, setRevisar] = useState<any[]>([]);
  const [sinCat, setSinCat] = useState<any[]>([]);
  const [disputas, setDisputas] = useState<any[]>([]);
  // Ingresos programados cuya fecha ya llegó: falta confirmarlos con el monto real
  const [porConfirmar, setPorConfirmar] = useState<IngresoProgramado[]>([]);
  const [eleccion, setEleccion] = useState<Record<string, string | null>>({});
  const [error, setError] = useState("");
  const nombres: Record<string, string> = Object.fromEntries(otros.map((o) => [o.user_id, o.nombre]));

  const cargar = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      sb.from("movimientos").select(SELECT_MOV).eq("creado_por", uid).eq("revisar", true).order("fecha", { ascending: false }),
      sb.from("repartos").select("movimiento_id, monto, movimiento:movimientos(fecha, descripcion, comercio, monto, creado_por)").eq("user_id", uid).is("categoria_id", null),
      sb.from("repartos").select("movimiento_id, user_id, monto, nota, movimiento:movimientos!inner(fecha, descripcion, comercio, monto, creado_por)").eq("estado", "disputa").eq("movimiento.creado_por", uid),
    ]);
    const vencidos = await cargarProgramados().then((p) => p.filter((x) => x.fecha <= hoyISO()), () => []);
    setRevisar(a.data ?? []); setSinCat(b.data ?? []); setDisputas(c.data ?? []); setPorConfirmar(vencidos);
    onCambio((a.data?.length ?? 0) + (b.data?.length ?? 0) + vencidos.length);
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

  const nada = !revisar.length && !sinCat.length && !disputas.length && !porConfirmar.length;
  const cabeza = (titulo: string, n: number, ayuda?: ReactNode) => (
    <div className="seccion-cabeza">
      <div><h2>{titulo} <span className="contador">{n}</span></h2>{ayuda && <div className="etiq-periodo">{ayuda}</div>}</div>
    </div>
  );
  return (
    <>
      <Cabeza titulo="Pendientes" volver />
      {nada && (
        <div className="vacio-grande">
          <CheckCircle size={44} aria-hidden="true" />
          <div className="titulo">Todo en orden</div>
          <p className="nota">No hay nada por revisar: todo está clasificado y confirmado.</p>
        </div>
      )}

      {porConfirmar.length > 0 && (
        <section className="seccion">
          {cabeza("Ingresos por confirmar", porConfirmar.length, "Ya pasó su fecha esperada: confírmalos con el monto real o cámbiales la fecha.")}
          <div className="lista">
            {porConfirmar.map((p) => (
              <Link className="fila" key={p.id} to={`/ingreso-programado/${p.id}`}>
                <span className="ico cuenta-ahorro" aria-hidden="true"><Wallet size={20} /></span>
                <div className="cuerpo"><div className="titulo">{p.descripcion}</div><div className="detalle">Esperado el {fechaCorta(p.fecha)}</div></div>
                <div className="monto positivo">~{fmt(p.monto)}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {revisar.length > 0 && (
        <section className="seccion">
          {cabeza("Por clasificar", revisar.length, <>Entraron por Apple Pay sin regla o con una tarjeta que no reconocí. Si el comercio es frecuente, agrégalo a <Link to="/ajustes/reglas">Reglas</Link>.</>)}
          <div className="lista">
            {revisar.map((m) => (
              <Link className="fila" key={m.id} to={`/editar/${m.id}`}>
                <IconoMov m={m} />
                <div className="cuerpo"><div className="titulo">{m.comercio || m.descripcion || "Sin descripción"}</div>
                  <div className="detalle">{fechaCorta(m.fecha)} · {m.cuenta?.nombre ?? "Cuenta sin identificar"}{textoCategoria(m) ? ` · ${textoCategoria(m)}` : ""}</div></div>
                <div className="monto">{fmt(m.monto)}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {sinCat.length > 0 && (
        <section className="seccion">
          {cabeza("Tu parte sin categoría", sinCat.length, "Gastos compartidos contigo cuya categoría no existe en tu lista: elige en cuál cuentan.")}
          {sinCat.map((r) => (
            <div key={r.movimiento_id} className="panel mb-10">
              <div className="flex centrar-v gap-8 mb-10">
                <span className="ico" aria-hidden="true"><Handshake size={20} /></span>
                <div className="crece"><div className="peso-600">{r.movimiento?.descripcion || r.movimiento?.comercio || "Gasto compartido"}</div>
                  <div className="sub">{fechaCorta(r.movimiento?.fecha)} · pagó {nombres[r.movimiento?.creado_por] ?? "tu pareja"}</div></div>
                <div className="num peso-700">{fmt(r.monto)}</div>
              </div>
              <SelectorCategoria cats={categorias} tipo="gasto" uid={uid} valor={eleccion[r.movimiento_id] ?? null}
                onCambio={(id) => setEleccion({ ...eleccion, [r.movimiento_id]: id })} />
              <button className="boton chico ancho" disabled={!eleccion[r.movimiento_id]} onClick={() => asignar(r.movimiento_id)}>Asignar categoría</button>
            </div>
          ))}
        </section>
      )}

      {disputas.length > 0 && (
        <section className="seccion">
          {cabeza("En disputa", disputas.length, "Tu pareja no está de acuerdo con su parte: ajústala o márcala como resuelta.")}
          {disputas.map((r) => (
            <div className="panel mb-10" key={r.movimiento_id}>
              <div className="flex centrar-v gap-8">
                <span className="ico cuenta-credito" aria-hidden="true"><Handshake size={20} /></span>
                <div className="crece"><div className="peso-600">{r.movimiento?.descripcion || r.movimiento?.comercio || "Gasto"}</div>
                  <div className="sub">{fechaCorta(r.movimiento?.fecha)} · total {fmt(r.movimiento?.monto)} · a {nombres[r.user_id]} le tocan {fmt(r.monto)}</div></div>
              </div>
              <p className="cita">“{r.nota || "No está de acuerdo con el reparto"}”</p>
              <div className="acciones mt-0">
                <Link className="boton chico claro" to={`/editar/${r.movimiento_id}`}>Ajustar reparto</Link>
                <button className="boton chico" onClick={() => resolver(r.movimiento_id, r.user_id)}>Resuelto</button>
              </div>
            </div>
          ))}
        </section>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

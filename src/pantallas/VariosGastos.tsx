import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza, useUnaVez } from "../ui";
import { errorTexto, fmt, hoyISO, limpiarMonto } from "../util";

type Fila = { fecha: string; descripcion: string; monto: string; categoria: string; meses: string };
const nueva = (fecha = hoyISO(), categoria = ""): Fila => ({ fecha, descripcion: "", monto: "", categoria, meses: "" });

// Captura rápida de varios gastos en una misma cuenta (por ejemplo, al revisar tu estado de cuenta)
export default function VariosGastos() {
  const { id = "" } = useParams();
  const { uid, cuentas, categorias, aviso } = useApp();
  const nav = useNavigate();
  const unaVez = useUnaVez();
  const cuenta = cuentas.find((c) => c.id === id);
  const [filas, setFilas] = useState<Fila[]>([nueva(), nueva(), nueva()]);
  const [error, setError] = useState("");

  // Categorías de gasto en una sola lista: "Comida", "Comida › Súper", ...
  const opciones = useMemo(() => {
    const visibles = categorias.filter((c) => c.tipo === "gasto" && !c.archivada && (c.propietario_id === uid || c.propietario_id === null));
    const padres = visibles.filter((c) => !c.padre_id).sort((a, b) => Number(a.propietario_id === null) - Number(b.propietario_id === null) || a.orden - b.orden);
    return padres.flatMap((p) => [
      { id: p.id, t: p.nombre },
      ...visibles.filter((s) => s.padre_id === p.id).sort((a, b) => a.orden - b.orden).map((s) => ({ id: s.id, t: `${p.nombre} › ${s.nombre}` })),
    ]);
  }, [categorias, uid]);

  const set = (i: number, k: keyof Fila, v: string) => setFilas(filas.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  const llenas = filas.filter((f) => Number(f.monto) > 0);
  const total = llenas.reduce((a, f) => a + Number(f.monto), 0);

  async function guardar() {
    setError("");
    if (!cuenta) return;
    if (!llenas.length) return setError("Escribe al menos un monto.");
    const sinFecha = llenas.find((f) => !f.fecha);
    if (sinFecha) return setError("Cada gasto necesita fecha.");
    const credito = cuenta.tipo === "credito";
    const { error } = await sb.from("movimientos").insert(llenas.map((f) => {
      const msi = credito && Number(f.meses) > 1 ? Number(f.meses) : null;
      return {
        tipo: "gasto", monto: Number(f.monto), fecha: f.fecha, cuenta_id: cuenta.id, categoria_id: f.categoria || null,
        descripcion: f.descripcion.trim() || null, meses_msi: msi, origen: "App",
        revisar: !f.categoria,
        // Una compra a meses de antes del alta ya estaba dentro de la deuda capturada ese día
        en_saldo_inicial: !!msi && f.fecha < cuenta.fecha_saldo_inicial,
      };
    }));
    if (error) return setError(errorTexto(error));
    aviso(`${llenas.length} ${llenas.length === 1 ? "gasto guardado" : "gastos guardados"}`);
    nav(-1);
  }

  if (!cuenta) return <><Cabeza titulo="Varios gastos" volver /><div className="vacio">Cargando…</div></>;
  const credito = cuenta.tipo === "credito";

  return (
    <>
      <Cabeza titulo={`Gastos en ${cuenta.nombre}`} volver />
      <p className="nota" style={{ marginTop: -8, marginBottom: 12 }}>Captura varios gastos seguidos. Los renglones vacíos no se guardan. Lo que dejes sin categoría queda en Pendientes para clasificarlo después.</p>
      {filas.map((f, i) => (
        <div key={i} className="lista renglon-gasto">
          <div className="rg-arriba">
            <input type="date" aria-label="Fecha" value={f.fecha} onChange={(e) => set(i, "fecha", e.target.value)} />
            <input className="rg-monto" inputMode="decimal" aria-label="Monto" placeholder="$0" value={f.monto} onChange={(e) => set(i, "monto", limpiarMonto(e.target.value))} />
          </div>
          <input aria-label="Descripción" placeholder="Comercio o nota" value={f.descripcion} onChange={(e) => set(i, "descripcion", e.target.value)} />
          <div className="rg-abajo">
            <select aria-label="Categoría" value={f.categoria} onChange={(e) => set(i, "categoria", e.target.value)}>
              <option value="">Sin categoría</option>
              {opciones.map((o) => <option key={o.id} value={o.id}>{o.t}</option>)}
            </select>
            {credito && (
              <select aria-label="Meses sin intereses" value={f.meses} onChange={(e) => set(i, "meses", e.target.value)}>
                <option value="">Contado</option>
                {[3, 6, 9, 10, 12, 13, 18, 24].map((n) => <option key={n} value={n}>{n} MSI</option>)}
              </select>
            )}
            {filas.length > 1 && <button type="button" className="boton chico claro" aria-label="Quitar renglón" onClick={() => setFilas(filas.filter((_, j) => j !== i))}>✕</button>}
          </div>
        </div>
      ))}
      <button type="button" className="boton claro ancho" onClick={() => {
        const ult = filas[filas.length - 1];
        setFilas([...filas, nueva(ult?.fecha || hoyISO(), "")]);
      }}>+ Agregar otro gasto</button>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="total-filtro" style={{ marginTop: 14 }}>
        <span>{llenas.length} {llenas.length === 1 ? "gasto" : "gastos"}</span><b>{fmt(total)}</b>
      </div>
      <div className="acciones">
        <button className="boton" onClick={unaVez(guardar)} disabled={!llenas.length}>Guardar {llenas.length || ""} {llenas.length === 1 ? "gasto" : "gastos"}</button>
      </div>
      <p className="nota">Para dividir un gasto, compartirlo o ponerlo a nombre de otra persona, usa el registro normal.</p>
    </>
  );
}

import { useEffect, useState } from "react";
import { sb } from "../supabase";
import { useApp, nombreCategoria } from "../contexto";
import { Cabeza, Campo, SelectorCategoria } from "../ui";
import { errorTexto } from "../util";

export default function Reglas() {
  const { uid, categorias, otros, aviso } = useApp();
  const [lista, setLista] = useState<any[]>([]);
  const [palabra, setPalabra] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [pct, setPct] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const cargar = () => sb.from("reglas").select("*").order("prioridad").order("palabra_clave").then(({ data }) => setLista(data ?? []));
  useEffect(() => { cargar(); }, []);

  async function agregar(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!palabra.trim() || !cat) return setError("Escribe la palabra y elige la categoría.");
    const { error } = await sb.from("reglas").insert({ palabra_clave: palabra.trim().toUpperCase(), categoria_id: cat, propietario_id: uid,
      compartir_pct: pct ? Number(pct) : null, prioridad: 0 });
    if (error) return setError(errorTexto(error));
    setPalabra(""); setPct(""); aviso("Regla agregada"); cargar();
  }
  async function borrar(id: string) {
    if (!window.confirm("¿Borrar esta regla?")) return;
    const { error } = await sb.from("reglas").delete().eq("id", id);
    if (error) return setError(errorTexto(error));
    cargar();
  }
  async function cambiarPct(id: string, v: string) {
    await sb.from("reglas").update({ compartir_pct: v ? Number(v) : null }).eq("id", id); cargar();
  }

  const visibles = lista.filter((r) => !q || r.palabra_clave.includes(q.toUpperCase()) || nombreCategoria(categorias, r.categoria_id).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <Cabeza titulo="Reglas de Apple Pay" volver />
      <p className="nota" style={{ marginTop: -8 }}>Si el nombre del comercio contiene la palabra, el pago se clasifica solo. Gana la regla más específica; las que agregues tú tienen prioridad.</p>
      <h2>Nueva regla</h2>
      <form onSubmit={agregar}>
        <Campo etiqueta="Palabra en el comercio"><input value={palabra} onChange={(e) => setPalabra(e.target.value)} placeholder="CHEDRAUI" autoCapitalize="characters" /></Campo>
        <SelectorCategoria cats={categorias} tipo="gasto" uid={uid} valor={cat} onCambio={setCat} />
        {otros.length > 0 && (
          <Campo etiqueta={`Compartir con ${otros[0].nombre} (opcional)`} ayuda="Porcentaje que le toca. Ej. 50 para el súper.">
            <input inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value.replace(/\D/g, ""))} placeholder="Sin compartir" />
          </Campo>
        )}
        <button className="boton">Agregar regla</button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
      <h2>Reglas ({lista.length})</h2>
      <input className="buscador" type="search" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="lista">
        {visibles.map((r) => (
          <div className="fila" key={r.id}>
            <div className="cuerpo">
              <div className="titulo">{r.palabra_clave}</div>
              <div className="detalle">{nombreCategoria(categorias, r.categoria_id) || "Categoría borrada"}{r.compartir_pct ? ` · ${Number(r.compartir_pct)}% para ${otros[0]?.nombre ?? "tu pareja"}` : ""}</div>
            </div>
            {otros.length > 0 && (
              <select aria-label="Compartir" value={r.compartir_pct ? String(Number(r.compartir_pct)) : ""} onChange={(e) => cambiarPct(r.id, e.target.value)}
                style={{ padding: "6px", borderRadius: 8, border: "1px solid var(--linea)", background: "var(--fondo)" }}>
                <option value="">Solo mío</option><option value="50">50/50</option><option value="100">Todo de {otros[0].nombre}</option>
                {r.compartir_pct && ![50, 100].includes(Number(r.compartir_pct)) && <option value={String(Number(r.compartir_pct))}>{Number(r.compartir_pct)}%</option>}
              </select>
            )}
            <button className="boton chico peligro" onClick={() => borrar(r.id)} aria-label={`Borrar regla ${r.palabra_clave}`}>Borrar</button>
          </div>
        ))}
      </div>
    </>
  );
}

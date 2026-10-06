import { useState } from "react";
import { sb } from "../supabase";
import { useApp, type Categoria } from "../contexto";
import { Cabeza, Segmentos } from "../ui";
import { errorTexto, fmt, limpiarMonto } from "../util";
import { IconoCategoria, nombreIcono, SelectorIcono } from "../iconos";

export default function Categorias() {
  const { uid, categorias, recargar, aviso } = useApp();
  const [vista, setVista] = useState<"gasto" | "ingreso" | "hogar">("gasto");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [nueva, setNueva] = useState("");
  const [nuevaSub, setNuevaSub] = useState("");
  const [verArchivadas, setVerArchivadas] = useState(false);
  const [error, setError] = useState("");

  const delHogar = vista === "hogar";
  const tipo = vista === "ingreso" ? "ingreso" : "gasto";
  const propias = categorias.filter((c) => c.tipo === tipo && (delHogar ? c.propietario_id === null : c.propietario_id === uid));
  const padres = propias.filter((c) => !c.padre_id && (verArchivadas || !c.archivada)).sort((a, b) => a.orden - b.orden);
  const total = padres.filter((p) => !p.archivada).reduce((s, p) => s + Number(p.presupuesto_mensual), 0);

  async function act(id: string, cambios: Partial<Categoria>) {
    const { error } = await sb.from("categorias").update(cambios).eq("id", id);
    if (error) return setError(errorTexto(error));
    await recargar();
  }
  async function crear(padre: Categoria | null) {
    const nombre = (padre ? nuevaSub : nueva).trim();
    if (!nombre) return;
    const { error } = await sb.from("categorias").insert({
      nombre, tipo, padre_id: padre?.id ?? null, propietario_id: delHogar ? null : uid,
      orden: padre ? propias.filter((c) => c.padre_id === padre.id).length : padres.length,
    });
    if (error) return setError(errorTexto(error));
    padre ? setNuevaSub("") : setNueva("");
    aviso("Categoría agregada"); await recargar();
  }
  async function renombrar(c: Categoria) {
    const n = window.prompt("Nuevo nombre", c.nombre)?.trim();
    if (n && n !== c.nombre) { await act(c.id, { nombre: n }); aviso("Nombre cambiado: los movimientos ya registrados se actualizan solos"); }
  }

  return (
    <>
      <Cabeza titulo="Categorías" volver />
      <Segmentos etiqueta="Tipo" valor={vista} onCambio={(v) => { setVista(v); setAbierta(null); }}
        opciones={[{ v: "gasto", t: "Mis gastos" }, { v: "ingreso", t: "Mis ingresos" }, { v: "hogar", t: "Hogar" }]} />
      {tipo === "gasto" && (
        <p className="nota" style={{ marginTop: -4 }}>
          Presupuesto mensual {delHogar ? "del hogar" : "personal"}: <strong className="num">{fmt(total, false)}</strong>. Escribe el monto de cada categoría; se guarda al salir del campo. Toca una categoría para cambiar su icono.
        </p>
      )}
      <div className="lista" style={{ marginTop: 12 }}>
        {padres.map((p) => {
          const subs = propias.filter((c) => c.padre_id === p.id && (verArchivadas || !c.archivada)).sort((a, b) => a.orden - b.orden);
          const open = abierta === p.id;
          return (
            <div key={p.id} style={{ borderTop: "1px solid var(--linea)" }}>
              <div className="fila" style={{ borderTop: 0 }}>
                <IconoCategoria nombre={p.nombre} icono={p.icono} />
                <button className="cuerpo" style={{ background: "none", border: 0, textAlign: "left", padding: 0, cursor: "pointer" }} onClick={() => setAbierta(open ? null : p.id)} aria-expanded={open}>
                  <div className="titulo">{p.archivada && <span className="etiq">Archivada</span>}{delHogar ? p.nombre.replace(/^Hogar: /, "") : p.nombre}</div>
                  <div className="detalle">{subs.length ? subs.map((s) => s.nombre).join(", ") : "Sin subcategorías"}</div>
                </button>
                {tipo === "gasto" && (
                  <input aria-label={`Presupuesto de ${p.nombre}`} inputMode="decimal" defaultValue={Number(p.presupuesto_mensual) || ""} placeholder="$0"
                    style={{ width: 96, textAlign: "right", padding: "8px 10px", border: "1px solid var(--linea)", borderRadius: 9, background: "var(--fondo)", fontSize: 16 }}
                    onBlur={(e) => { const v = Number(limpiarMonto(e.target.value)) || 0; if (v !== Number(p.presupuesto_mensual)) act(p.id, { presupuesto_mensual: v }); }} />
                )}
              </div>
              {open && (
                <div style={{ padding: "0 14px 14px" }}>
                  <div className="sub" style={{ marginBottom: 6 }}>Icono</div>
                  <SelectorIcono valor={nombreIcono(p.nombre, p.icono)} onCambio={(v) => act(p.id, { icono: v })} />
                  <div className="sub" style={{ margin: "14px 0 2px" }}>Subcategorías</div>
                  {subs.map((s) => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                      <span style={{ flex: 1 }}>{s.archivada && <span className="etiq">Archivada</span>}{s.nombre}</span>
                      <button className="boton chico claro" onClick={() => renombrar(s)}>Renombrar</button>
                      <button className="boton chico claro" onClick={() => act(s.id, { archivada: !s.archivada })}>{s.archivada ? "Restaurar" : "Archivar"}</button>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <input className="buscador" style={{ margin: 0, flex: 1 }} placeholder="Nueva subcategoría" value={nuevaSub} onChange={(e) => setNuevaSub(e.target.value)} />
                    <button className="boton chico" onClick={() => crear(p)}>Agregar</button>
                  </div>
                  <div className="acciones">
                    <button className="boton chico claro" onClick={() => renombrar(p)}>Renombrar categoría</button>
                    <button className="boton chico claro" onClick={() => act(p.id, { archivada: !p.archivada })}>{p.archivada ? "Restaurar" : "Archivar"}</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <input className="buscador" style={{ margin: 0, flex: 1 }} placeholder={delHogar ? "Nueva categoría del hogar" : "Nueva categoría"} value={nueva}
          onChange={(e) => setNueva(delHogar && e.target.value && !e.target.value.startsWith("Hogar: ") ? "Hogar: " + e.target.value : e.target.value)} />
        <button className="boton chico" onClick={() => crear(null)}>Agregar</button>
      </div>
      <p className="nota">Archivar oculta la categoría de los menús sin perder los movimientos que ya la usan. Al renombrar, los movimientos registrados se actualizan solos.</p>
      <div className="acciones"><button className="boton claro" onClick={() => setVerArchivadas(!verArchivadas)}>{verArchivadas ? "Ocultar archivadas" : "Ver archivadas"}</button></div>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

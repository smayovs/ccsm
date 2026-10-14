import { useState } from "react";
import { sb } from "../supabase";
import { useApp, type Categoria } from "../contexto";
import { Cabeza, Segmentos, Seccion } from "../ui";
import { errorTexto, fmt, limpiarMonto } from "../util";
import { IconoCategoria, nombreIcono, SelectorIcono } from "../iconos";
import { CaretDown, CaretRight, Plus } from "../phosphor";

export default function Categorias() {
  const { uid, categorias, recargar, aviso } = useApp();
  const [vista, setVista] = useState<"gasto" | "ingreso" | "hogar">("gasto");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [nueva, setNueva] = useState("");
  const [nuevaSub, setNuevaSub] = useState("");
  const [verArchivadas, setVerArchivadas] = useState(false);
  const [error, setError] = useState("");
  // Renombrar en la misma fila (antes era una ventana del sistema)
  const [editando, setEditando] = useState<{ id: string; nombre: string } | null>(null);

  const delHogar = vista === "hogar";
  const tipo = vista === "ingreso" ? "ingreso" : "gasto";
  const propias = categorias.filter((c) => c.tipo === tipo && (delHogar ? c.propietario_id === null : c.propietario_id === uid));
  const padres = propias.filter((c) => !c.padre_id && (verArchivadas || !c.archivada)).sort((a, b) => a.orden - b.orden);

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
  async function guardarNombre(c: Categoria) {
    const n = editando?.nombre.trim();
    setEditando(null);
    if (!n || n === c.nombre) return;
    await act(c.id, { nombre: delHogar && !c.padre_id && !n.startsWith("Hogar: ") ? "Hogar: " + n : n });
    aviso("Nombre cambiado: los movimientos ya registrados se actualizan solos");
  }
  const sinPrefijo = (n: string) => (delHogar ? n.replace(/^Hogar: /, "") : n);
  // Campo para renombrar en línea: Enter guarda, Escape cancela
  const campoNombre = (c: Categoria) => (
    <div className="flex gap-8 crece">
      <input className="buscador m-0 crece" autoFocus aria-label={`Nuevo nombre de ${sinPrefijo(c.nombre)}`} value={editando!.nombre}
        onChange={(e) => setEditando({ id: c.id, nombre: e.target.value })}
        onKeyDown={(e) => { if (e.key === "Enter") guardarNombre(c); if (e.key === "Escape") setEditando(null); }} />
      <button className="boton chico" onClick={() => guardarNombre(c)}>Guardar</button>
    </div>
  );

  return (
    <>
      <Cabeza titulo="Categorías" volver />
      <Segmentos etiqueta="Tipo" valor={vista} onCambio={(v) => { setVista(v); setAbierta(null); }}
        opciones={[{ v: "gasto", t: "Mis gastos" }, { v: "ingreso", t: "Mis ingresos" }, { v: "hogar", t: "Hogar" }]} />
      <p className="nota mt-n4">Toca una categoría para cambiar su nombre, icono y subcategorías.</p>
      <div className="lista mt-12">
        {padres.length === 0 && <div className="vacio">Aún no hay categorías aquí.</div>}
        {padres.map((p) => {
          const subs = propias.filter((c) => c.padre_id === p.id && (verArchivadas || !c.archivada)).sort((a, b) => a.orden - b.orden);
          const open = abierta === p.id;
          return (
            <div key={p.id} className={"cat-editable" + (open ? " abierta" : "")}>
              <button className="fila" onClick={() => { setAbierta(open ? null : p.id); setEditando(null); setNuevaSub(""); }} aria-expanded={open}>
                <IconoCategoria nombre={p.nombre} icono={p.icono} />
                <div className="cuerpo">
                  <div className="titulo">{p.archivada && <span className="etiq">Archivada</span>}{sinPrefijo(p.nombre)}</div>
                  <div className="detalle">{subs.length ? subs.map((x) => x.nombre).join(", ") : "Sin subcategorías"}</div>
                </div>
                {open ? <CaretDown size={16} className="flecha" aria-hidden="true" /> : <CaretRight size={16} className="flecha" aria-hidden="true" />}
              </button>
              {open && (
                <div className="cat-editor">
                  <div className="sub mb-6">Nombre</div>
                  {editando?.id === p.id ? campoNombre(p) : (
                    <div className="flex centrar-v gap-8">
                      <span className="crece peso-600">{sinPrefijo(p.nombre)}</span>
                      <button className="boton chico claro" onClick={() => setEditando({ id: p.id, nombre: sinPrefijo(p.nombre) })}>Renombrar</button>
                    </div>
                  )}
                  <div className="sub mt-14 mb-6">Icono</div>
                  <SelectorIcono valor={nombreIcono(p.nombre, p.icono)} onCambio={(v) => act(p.id, { icono: v })} />
                  <div className="sub mt-14 mb-6">Subcategorías</div>
                  <div className="subs-editables">
                    {subs.map((x) => (
                      <div key={x.id} className="flex centrar-v gap-8">
                        {editando?.id === x.id ? campoNombre(x) : <>
                          <span className="crece">{x.archivada && <span className="etiq">Archivada</span>}{x.nombre}</span>
                          <button className="boton chico claro" onClick={() => setEditando({ id: x.id, nombre: x.nombre })}>Renombrar</button>
                          <button className="boton chico claro" onClick={() => act(x.id, { archivada: !x.archivada })}>{x.archivada ? "Restaurar" : "Archivar"}</button>
                        </>}
                      </div>
                    ))}
                    <div className="flex gap-8">
                      <input className="buscador m-0 crece" aria-label="Nueva subcategoría" placeholder="Nueva subcategoría" value={nuevaSub}
                        onChange={(e) => setNuevaSub(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") crear(p); }} />
                      <button className="boton-icono acento" aria-label="Agregar subcategoría" disabled={!nuevaSub.trim()} onClick={() => crear(p)}><Plus size={20} /></button>
                    </div>
                  </div>
                  <div className="acciones">
                    <button className="boton chico claro" onClick={() => act(p.id, { archivada: !p.archivada })}>{p.archivada ? "Restaurar categoría" : "Archivar categoría"}</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Seccion titulo="Nueva categoría">
        <div className="flex gap-8">
          <input className="buscador m-0 crece" aria-label={delHogar ? "Nueva categoría del hogar" : "Nueva categoría"} placeholder={delHogar ? "Por ejemplo: Renta" : "Por ejemplo: Mascotas"} value={sinPrefijo(nueva)}
            onChange={(e) => setNueva(delHogar && e.target.value ? "Hogar: " + e.target.value : e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") crear(null); }} />
          <button className="boton-icono acento" aria-label="Agregar categoría" disabled={!nueva.trim()} onClick={() => crear(null)}><Plus size={20} /></button>
        </div>
      </Seccion>
      <p className="nota mt-14">Archivar oculta la categoría de los menús sin perder los movimientos que ya la usan. Al renombrar, los movimientos registrados se actualizan solos.</p>
      <p className="texto-centro mt-14"><button className="enlace-chico boton-texto" onClick={() => setVerArchivadas(!verArchivadas)}>{verArchivadas ? "Ocultar archivadas" : "Ver archivadas"}</button></p>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

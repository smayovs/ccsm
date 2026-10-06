import { useEffect, useState } from "react";
import { sb } from "../supabase";
import { useApp, nombreCategoria } from "../contexto";
import { Cabeza, Campo, SelectorCategoria } from "../ui";
import { diasEntre, errorTexto, fechaCorta, fmt, hoyISO, proximoCobro } from "../util";

const FREC: Record<number, string> = { 1: "Mensual", 2: "Bimestral", 3: "Trimestral", 6: "Semestral", 12: "Anual" };
const vacia = { id: "", servicio: "", monto: "", frecuencia_meses: 1, cuenta_id: "", categoria_id: null as string | null, fecha_referencia: hoyISO(), palabra_clave: "", activa: true, delHogar: false };

export default function Suscripciones() {
  const { uid, cuentas, categorias, otros, aviso } = useApp();
  const [lista, setLista] = useState<any[]>([]);
  const [edit, setEdit] = useState<typeof vacia | null>(null);
  const [error, setError] = useState("");
  const cargar = () => sb.from("suscripciones").select("*").order("servicio").then(({ data }) => setLista(data ?? []));
  useEffect(() => { cargar(); }, []);

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); if (!edit) return; setError("");
    const fila: any = {
      servicio: edit.servicio.trim(), monto: Number(edit.monto), frecuencia_meses: edit.frecuencia_meses, cuenta_id: edit.cuenta_id || null,
      categoria_id: edit.categoria_id, fecha_referencia: edit.fecha_referencia || null, palabra_clave: edit.palabra_clave.trim().toUpperCase() || null,
      activa: edit.activa, propietario_id: edit.delHogar ? null : uid,
    };
    if (!fila.servicio || !(fila.monto > 0)) return setError("Escribe el servicio y el monto.");
    const r = edit.id ? await sb.from("suscripciones").update(fila).eq("id", edit.id) : await sb.from("suscripciones").insert(fila);
    if (r.error) return setError(errorTexto(r.error));
    aviso("Suscripción guardada"); setEdit(null); cargar();
  }
  async function borrar(id: string) {
    const { error } = await sb.from("suscripciones").delete().eq("id", id);
    if (error) return setError(errorTexto(error));
    setEdit(null); cargar();
  }

  const activas = lista.filter((s) => s.activa);
  const alMes = activas.reduce((s, x) => s + Number(x.monto) / x.frecuencia_meses, 0);

  if (edit) return (
    <>
      <Cabeza titulo={edit.id ? "Editar suscripción" : "Nueva suscripción"} />
      <form onSubmit={guardar}>
        <Campo etiqueta="Servicio"><input value={edit.servicio} onChange={(e) => setEdit({ ...edit, servicio: e.target.value })} placeholder="Netflix" /></Campo>
        <div className="dos">
          <Campo etiqueta="Monto por cobro"><input inputMode="decimal" value={edit.monto} onChange={(e) => setEdit({ ...edit, monto: e.target.value })} /></Campo>
          <Campo etiqueta="Frecuencia">
            <select value={edit.frecuencia_meses} onChange={(e) => setEdit({ ...edit, frecuencia_meses: Number(e.target.value) })}>
              {Object.entries(FREC).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </Campo>
        </div>
        <div className="dos">
          <Campo etiqueta="Fecha de un cobro" ayuda="Cualquier fecha real en que te cobraron."><input type="date" value={edit.fecha_referencia} onChange={(e) => setEdit({ ...edit, fecha_referencia: e.target.value })} /></Campo>
          <Campo etiqueta="Cuenta">
            <select value={edit.cuenta_id} onChange={(e) => setEdit({ ...edit, cuenta_id: e.target.value })}>
              <option value="">—</option>{cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
        </div>
        <SelectorCategoria cats={categorias} tipo="gasto" uid={uid} valor={edit.categoria_id} onCambio={(id) => setEdit({ ...edit, categoria_id: id })} />
        <Campo etiqueta="Palabra en el cargo" ayuda="Texto que aparece en el comercio (ej. NETFLIX). Clasifica solo el cargo de Apple Pay y te avisa si cambió el precio.">
          <input value={edit.palabra_clave} onChange={(e) => setEdit({ ...edit, palabra_clave: e.target.value })} autoCapitalize="characters" />
        </Campo>
        {otros.length > 0 && <label className="casilla"><input type="checkbox" checked={edit.delHogar} onChange={(e) => setEdit({ ...edit, delHogar: e.target.checked })} /> Es del hogar (la ven los dos)</label>}
        <label className="casilla"><input type="checkbox" checked={edit.activa} onChange={(e) => setEdit({ ...edit, activa: e.target.checked })} /> Activa</label>
        <div className="acciones">
          <button type="button" className="boton claro" onClick={() => setEdit(null)}>Cancelar</button>
          <button className="boton">Guardar</button>
        </div>
        {edit.id && <div className="acciones"><button type="button" className="boton peligro" onClick={() => borrar(edit.id)}>Borrar suscripción</button></div>}
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </>
  );

  return (
    <>
      <Cabeza titulo="Suscripciones" volver accion={<button className="boton chico" onClick={() => setEdit({ ...vacia })}>Agregar</button>} />
      <div className="trio" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div><div className="k">Al mes</div><div className="v">{fmt(alMes)}</div></div>
        <div><div className="k">Al año</div><div className="v">{fmt(alMes * 12, false)}</div></div>
      </div>
      <h2>Servicios</h2>
      <div className="lista">
        {lista.length === 0 && <div className="vacio">Agrega tus servicios recurrentes: streaming, gimnasio, apps, seguros.</div>}
        {lista.map((s) => {
          const prox = s.activa ? proximoCobro(s.fecha_referencia, s.frecuencia_meses) : null;
          const d = prox ? diasEntre(hoyISO(), prox) : null;
          return (
            <button className="fila" key={s.id} onClick={() => setEdit({
              id: s.id, servicio: s.servicio, monto: String(s.monto), frecuencia_meses: s.frecuencia_meses, cuenta_id: s.cuenta_id ?? "",
              categoria_id: s.categoria_id, fecha_referencia: s.fecha_referencia ?? hoyISO(), palabra_clave: s.palabra_clave ?? "", activa: s.activa, delHogar: !s.propietario_id,
            })}>
              <div className="cuerpo">
                <div className="titulo">{s.servicio}</div>
                <div className="detalle">
                  {!s.activa && <span className="etiq">Pausada</span>}
                  {!s.propietario_id && <span className="etiq verde">Hogar</span>}
                  {FREC[s.frecuencia_meses]}{prox ? ` · próximo ${fechaCorta(prox)}` : ""}{d !== null && d <= 3 ? ` (en ${d} días)` : ""}
                  {s.categoria_id ? ` · ${nombreCategoria(categorias, s.categoria_id)}` : ""}
                </div>
              </div>
              <div className="monto">{fmt(s.monto)}{s.frecuencia_meses > 1 && <small>{fmt(Number(s.monto) / s.frecuencia_meses)} al mes</small>}</div>
            </button>
          );
        })}
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}

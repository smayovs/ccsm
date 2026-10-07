import { useEffect, useState } from "react";
import { sb } from "../supabase";
import { useApp, nombreCategoria } from "../contexto";
import { Cabeza, Campo, SelectorCategoria } from "../ui";
import { diasEntre, errorTexto, fechaCorta, fmt, hoyISO, proximoCobro, limpiarMonto } from "../util";
import { divisionVacia, partesDe, SelectorDivision, type Division } from "../division";

const FREC: Record<number, string> = { 1: "Mensual", 2: "Bimestral", 3: "Trimestral", 6: "Semestral", 12: "Anual" };
const vacia = { id: "", servicio: "", monto: "", frecuencia_meses: 1, cuenta_id: "", categoria_id: null as string | null, fecha_referencia: hoyISO(), palabra_clave: "", activa: true, delHogar: false };

export default function Suscripciones() {
  const { uid, cuentas, categorias, otros, aviso, familiares } = useApp();
  const [partes, setPartes] = useState<Record<string, { familiar_id: string; monto: number }[]>>({});
  const [div, setDiv] = useState<Division>(divisionVacia);
  const [lista, setLista] = useState<any[]>([]);
  const [edit, setEdit] = useState<typeof vacia | null>(null);
  const [error, setError] = useState("");
  const cargar = () => {
    sb.from("suscripciones").select("*").order("servicio").then(({ data }) => setLista(data ?? []));
    sb.from("suscripcion_partes").select("suscripcion_id, familiar_id, monto").then(({ data }) => {
      const p: Record<string, { familiar_id: string; monto: number }[]> = {};
      for (const x of (data ?? []) as any[]) (p[x.suscripcion_id] ??= []).push({ familiar_id: x.familiar_id, monto: Number(x.monto) });
      setPartes(p);
    });
  };
  function abrir(e: typeof vacia) {
    const ps = e.id ? partes[e.id] ?? [] : [];
    setDiv(ps.length ? { activa: true, seleccion: ps.map((x) => x.familiar_id), modo: "montos", conmigo: true, montos: Object.fromEntries(ps.map((x) => [x.familiar_id, String(x.monto)])) } : divisionVacia);
    setEdit(e);
  }
  const miParte = (s: any) => Number(s.monto) - (partes[s.id] ?? []).reduce((a, x) => a + x.monto, 0);
  useEffect(() => { cargar(); }, []);

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); if (!edit) return; setError("");
    const fila: any = {
      servicio: edit.servicio.trim(), monto: Number(edit.monto), frecuencia_meses: edit.frecuencia_meses, cuenta_id: edit.cuenta_id || null,
      categoria_id: edit.categoria_id, fecha_referencia: edit.fecha_referencia || null, palabra_clave: edit.palabra_clave.trim().toUpperCase() || null,
      activa: edit.activa, propietario_id: edit.delHogar ? null : uid,
    };
    if (!fila.servicio || !(fila.monto > 0)) return setError("Escribe el servicio y el monto.");
    const ps = partesDe(div, fila.monto);
    if (div.activa) {
      if (!ps.length) return setError("Elige con quién se divide.");
      if (ps.some((x) => !(x.monto > 0))) return setError("Escribe la parte de cada persona.");
      if (ps.reduce((a, x) => a + x.monto, 0) > fila.monto + 0.01) return setError("Las partes suman más que el monto.");
    }
    const r = edit.id ? await sb.from("suscripciones").update(fila).eq("id", edit.id).select("id").single() : await sb.from("suscripciones").insert(fila).select("id").single();
    if (r.error) return setError(errorTexto(r.error));
    const sid = (r.data as any).id;
    await sb.from("suscripcion_partes").delete().eq("suscripcion_id", sid);
    if (ps.length) {
      const { error } = await sb.from("suscripcion_partes").insert(ps.map((x) => ({ suscripcion_id: sid, ...x })));
      if (error) return setError(errorTexto(error));
    }
    aviso("Suscripción guardada"); setEdit(null); cargar();
  }
  async function registrarCobro() {
    if (!edit?.id) return; setError("");
    if (!edit.cuenta_id) return setError("Elige la cuenta donde te lo cobran y guarda primero.");
    const monto = Number(edit.monto);
    const { data, error } = await sb.from("movimientos").insert({
      tipo: "gasto", monto, fecha: hoyISO(), cuenta_id: edit.cuenta_id, categoria_id: edit.categoria_id, descripcion: edit.servicio.trim(), origen: "Suscripción",
    }).select("id").single();
    if (error) return setError(errorTexto(error));
    const ps = partes[edit.id] ?? [];
    if (ps.length) {
      const r = await sb.from("partes_personas").insert(ps.map((x) => ({ movimiento_id: data.id, familiar_id: x.familiar_id, monto: x.monto })));
      if (r.error) return setError(errorTexto(r.error));
    }
    aviso(ps.length ? "Cobro registrado y dividido" : "Cobro registrado"); setEdit(null);
  }
  async function borrar(id: string) {
    const { error } = await sb.from("suscripciones").delete().eq("id", id);
    if (error) return setError(errorTexto(error));
    setEdit(null); cargar();
  }

  const activas = lista.filter((s) => s.activa);
  const alMes = activas.reduce((s, x) => s + Number(x.monto) / x.frecuencia_meses, 0);
  const miAlMes = activas.reduce((s, x) => s + miParte(x) / x.frecuencia_meses, 0);

  if (edit) return (
    <>
      <Cabeza titulo={edit.id ? "Editar suscripción" : "Nueva suscripción"} />
      <form onSubmit={guardar}>
        <Campo etiqueta="Servicio"><input value={edit.servicio} onChange={(e) => setEdit({ ...edit, servicio: e.target.value })} placeholder="Netflix" /></Campo>
        <div className="dos">
          <Campo etiqueta="Monto por cobro"><input inputMode="decimal" value={edit.monto} onChange={(e) => setEdit({ ...edit, monto: limpiarMonto(e.target.value) })} /></Campo>
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
        <label className="casilla"><input type="checkbox" checked={div.activa} onChange={(e) => setDiv({ ...div, activa: e.target.checked })} disabled={!familiares.some((f) => f.activo)} /> La pago entre varias personas</label>
        {div.activa && <SelectorDivision d={div} onCambio={setDiv} total={Number(edit.monto) || 0}
          nota="Cada vez que llegue el cargo por tu atajo se divide solo, y cada parte se va a Cobros. Si el precio cambia, las partes se ajustan en proporción." />}
        {otros.length > 0 && <label className="casilla"><input type="checkbox" checked={edit.delHogar} onChange={(e) => setEdit({ ...edit, delHogar: e.target.checked })} /> Es del hogar (la ven los dos)</label>}
        <label className="casilla"><input type="checkbox" checked={edit.activa} onChange={(e) => setEdit({ ...edit, activa: e.target.checked })} /> Activa</label>
        <div className="acciones">
          <button type="button" className="boton claro" onClick={() => setEdit(null)}>Cancelar</button>
          <button className="boton">Guardar</button>
        </div>
        {edit.id && (
          <div className="acciones">
            <button type="button" className="boton claro" onClick={registrarCobro}>Registrar el cobro de hoy</button>
          </div>
        )}
        {edit.id && <p className="nota">Úsalo solo si el cargo no llegó por tu atajo de Apple Pay, para no registrarlo dos veces.</p>}
        {edit.id && <div className="acciones"><button type="button" className="boton peligro" onClick={() => borrar(edit.id)}>Borrar suscripción</button></div>}
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </>
  );

  return (
    <>
      <Cabeza titulo="Suscripciones" volver accion={<button className="boton chico" onClick={() => abrir({ ...vacia })}>Agregar</button>} />
      <div className="trio" style={{ gridTemplateColumns: "1fr 1fr" }} title={miAlMes < alMes - 0.5 ? `Total de servicios: ${fmt(alMes)} al mes` : undefined}>
        <div><div className="k">{miAlMes < alMes - 0.5 ? "Tu parte al mes" : "Al mes"}</div><div className="v">{fmt(miAlMes)}</div></div>
        <div><div className="k">{miAlMes < alMes - 0.5 ? "Tu parte al año" : "Al año"}</div><div className="v">{fmt(miAlMes * 12, false)}</div></div>
      </div>
      <h2>Servicios</h2>
      <div className="lista">
        {lista.length === 0 && <div className="vacio">Agrega tus servicios recurrentes: streaming, gimnasio, apps, seguros.</div>}
        {lista.map((s) => {
          const prox = s.activa ? proximoCobro(s.fecha_referencia, s.frecuencia_meses) : null;
          const d = prox ? diasEntre(hoyISO(), prox) : null;
          return (
            <button className="fila" key={s.id} onClick={() => abrir({
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
                  {(partes[s.id] ?? []).length > 0 && <> · <span className="etiq">Dividida</span>tu parte {fmt(miParte(s))}</>}
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

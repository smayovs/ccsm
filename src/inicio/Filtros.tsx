import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useApp } from "../contexto";
import { Segmentos } from "../ui";
import { fechaCorta, masDias } from "../util";
import { Filtros, filtrosIniciales, NOMBRE_PERIODO, Periodo, rango } from "./secciones";


export function textoPeriodo(f: Filtros) {
  if (f.periodo !== "rango") return NOMBRE_PERIODO[f.periodo];
  const r = rango(f);
  return `${fechaCorta(r.desde)} – ${fechaCorta(masDias(r.hasta, -1))}`;
}

// Barra de filtros de Inicio: periodo, cuentas y categoría/subcategoría
export function BarraFiltros({ f, onCambio }: { f: Filtros; onCambio: (f: Filtros) => void }) {
  const { uid, cuentas, categorias } = useApp();
  const [abierto, setAbierto] = useState(false);
  const padres = categorias.filter((c) => c.tipo === "gasto" && !c.padre_id && !c.archivada && (c.propietario_id === uid || c.propietario_id === null))
    .sort((a, b) => Number(a.propietario_id === null) - Number(b.propietario_id === null) || a.orden - b.orden);
  const subs = categorias.filter((c) => c.padre_id === f.categoria && !c.archivada).sort((a, b) => a.orden - b.orden);
  const ordenTipo = ["credito", "debito", "ahorro", "efectivo", "inversion", "prestamo"];
  const ctas = cuentas.filter((c) => c.activa).sort((a, b) => ordenTipo.indexOf(a.tipo) - ordenTipo.indexOf(b.tipo) || a.orden - b.orden);
  const nomCat = padres.find((c) => c.id === f.categoria)?.nombre;
  const nomSub = f.sub === "general" ? "General" : subs.find((c) => c.id === f.sub)?.nombre;
  const resumenCtas = !f.cuentas.length ? "Todas las cuentas" : f.cuentas.length === 1 ? cuentas.find((c) => c.id === f.cuentas[0])?.nombre ?? "1 cuenta" : `${f.cuentas.length} cuentas`;
  const activos = f.periodo !== "mes" || f.cuentas.length > 0 || !!f.categoria;
  const toggleCta = (id: string) => onCambio({ ...f, cuentas: f.cuentas.includes(id) ? f.cuentas.filter((x) => x !== id) : [...f.cuentas, id] });

  return (
    <div className="filtros-inicio">
      <button type="button" className={"filtros-resumen" + (activos ? " activos" : "")} aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        <SlidersHorizontal size={16} aria-hidden="true" />
        <span>{textoPeriodo(f)}</span><span className="sep">·</span><span>{resumenCtas}</span>
        {nomCat && <><span className="sep">·</span><span>{nomCat}{nomSub ? ` › ${nomSub}` : ""}</span></>}
      </button>
      {abierto && (
        <div className="filtros-panel">
          <div className="sub">Periodo</div>
          <Segmentos etiqueta="Periodo" valor={f.periodo} onCambio={(v: Periodo) => onCambio({ ...f, periodo: v })} opciones={[
            { v: "mes", t: "Este mes" }, { v: "mes_pasado", t: "Mes pasado" }, { v: "3m", t: "3 meses" },
            { v: "6m", t: "6 meses" }, { v: "anio", t: "Este año" }, { v: "rango", t: "Fechas" },
          ]} />
          {f.periodo === "rango" && (
            <div className="dos">
              <label className="campo"><span>Desde</span><input type="date" value={f.desde} onChange={(e) => e.target.value && onCambio({ ...f, desde: e.target.value })} /></label>
              <label className="campo"><span>Hasta</span><input type="date" value={f.hasta} onChange={(e) => e.target.value && onCambio({ ...f, hasta: e.target.value })} /></label>
            </div>
          )}
          <div className="sub">Cuentas y tarjetas</div>
          <div className="chips-filtro">
            <button type="button" aria-pressed={!f.cuentas.length} onClick={() => onCambio({ ...f, cuentas: [] })}>Todas</button>
            {ctas.map((c) => <button type="button" key={c.id} aria-pressed={f.cuentas.includes(c.id)} onClick={() => toggleCta(c.id)}>{c.nombre}</button>)}
          </div>
          <div className="sub">Categoría</div>
          <div className="dos">
            <select aria-label="Categoría" value={f.categoria} onChange={(e) => onCambio({ ...f, categoria: e.target.value, sub: "" })}>
              <option value="">Todas</option>
              {padres.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              <option value="sin">Sin categoría</option>
            </select>
            <select aria-label="Subcategoría" value={f.sub} disabled={!f.categoria || f.categoria === "sin"} onChange={(e) => onCambio({ ...f, sub: e.target.value })}>
              <option value="">Todas</option>
              <option value="general">General</option>
              {subs.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <p className="nota">Aplican a las secciones de gastos y gráficas. Los saldos, tarjetas y próximos pagos siempre muestran lo de hoy.</p>
          <div className="acciones" style={{ marginTop: 6 }}>
            {activos && <button type="button" className="boton claro" onClick={() => onCambio(filtrosIniciales())}>Quitar filtros</button>}
            <button type="button" className="boton" onClick={() => setAbierto(false)}>Listo</button>
          </div>
        </div>
      )}
    </div>
  );
}

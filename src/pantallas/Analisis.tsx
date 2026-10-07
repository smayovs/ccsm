import { useEffect, useMemo, useState } from "react";
import { sb } from "../supabase";
import { Cabeza, Segmentos } from "../ui";
import { fmt, mesISO, nombreMes, sumarMes } from "../util";
import { IconoCategoria, IconoCuenta } from "../iconos";
import { BarrasMes } from "../graficas";
import { agruparCategorias, DesgloseCategorias } from "../desglose";

type Fila = { mes: string; categoria_id: string | null; categoria: string; icono: string | null; sub_id: string | null; sub: string | null; cuenta_id: string | null; cuenta: string; cuenta_tipo: string | null; monto: number };
type Grupo = { clave: string; nombre: string; icono: string | null; tipo: string | null; total: number; porMes: Record<string, number> };

const mesCorto = (m: string) => { const t = nombreMes(m).split(" ")[0]; return t[0].toUpperCase() + t.slice(1); };

export default function Analisis() {
  const [meses, setMeses] = useState<"3" | "6" | "12">("6");
  const [vista, setVista] = useState<"categoria" | "cuenta">("categoria");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const hasta = sumarMes(mesISO(), 1);
  const desde = sumarMes(mesISO(), -(Number(meses) - 1));

  useEffect(() => {
    setCargando(true);
    sb.rpc("gastos_detalle", { p_desde: desde, p_hasta: hasta }).then(({ data }) => {
      setFilas(((data ?? []) as any[]).map((x) => ({ ...x, monto: Number(x.monto) })));
      setCargando(false);
    });
  }, [desde, hasta]);

  const lista = useMemo(() => Array.from({ length: Number(meses) }, (_, k) => sumarMes(desde, k)), [desde, meses]);

  // Por cuenta
  const grupos = useMemo(() => {
    const g: Record<string, Grupo> = {};
    for (const f of filas) {
      const clave = f.cuenta_id ?? f.cuenta;
      const x = (g[clave] ??= { clave, nombre: f.cuenta, icono: null, tipo: f.cuenta_tipo, total: 0, porMes: {} });
      x.total += f.monto; x.porMes[f.mes] = (x.porMes[f.mes] ?? 0) + f.monto;
    }
    return Object.values(g).sort((a, b) => b.total - a.total);
  }, [filas]);
  // Por categoría y subcategoría
  const cats = useMemo(() => agruparCategorias(filas), [filas]);

  // Qué filas entran en la gráfica según lo que tocaste
  const coincide = (f: Fila) => {
    if (!sel) return true;
    if (vista === "cuenta") return (f.cuenta_id ?? f.cuenta) === sel;
    const cat = f.categoria_id ?? "sin";
    return cat === sel || f.sub_id === sel || (!f.sub_id && sel === `${cat}:general`);
  };
  const nombreSel = !sel ? null : vista === "cuenta" ? grupos.find((g) => g.clave === sel)?.nombre
    : (() => { for (const c of cats) { if (c.clave === sel) return c.nombre; const s = c.subs.find((x) => x.clave === sel); if (s) return `${c.nombre} › ${s.nombre}`; } return null; })();
  const porMes = lista.map((m) => ({
    mes: m, etiqueta: mesCorto(m),
    monto: filas.filter((f) => f.mes === m && coincide(f)).reduce((s, f) => s + f.monto, 0),
  }));
  const total = porMes.reduce((s, x) => s + x.monto, 0);
  const totalGeneral = filas.reduce((s, x) => s + x.monto, 0);
  // El mes actual va a medias: el promedio usa solo meses cerrados cuando hay al menos uno
  const cerrados = porMes.slice(0, -1);
  const promedio = cerrados.length ? cerrados.reduce((s, x) => s + x.monto, 0) / cerrados.length : total;
  const ordenados = [...cerrados].sort((a, b) => a.monto - b.monto);
  const mediana = ordenados.length ? (ordenados.length % 2 ? ordenados[(ordenados.length - 1) / 2].monto
    : (ordenados[ordenados.length / 2 - 1].monto + ordenados[ordenados.length / 2].monto) / 2) : 0;
  const alto = cerrados.length ? cerrados.reduce((a, b) => (b.monto > a.monto ? b : a)) : null;
  const bajo = cerrados.length ? cerrados.reduce((a, b) => (b.monto < a.monto ? b : a)) : null;
  const ultimoCerrado = cerrados[cerrados.length - 1];

  return (
    <>
      <Cabeza titulo="Análisis" volver />
      <Segmentos etiqueta="Periodo" valor={meses} onCambio={(v) => { setMeses(v); }} opciones={[
        { v: "3", t: "3 meses" }, { v: "6", t: "6 meses" }, { v: "12", t: "12 meses" }]} />

      {cargando ? <div className="vacio">Cargando…</div> : filas.length === 0 ? (
        <div className="lista"><div className="vacio">Sin gastos registrados en este periodo.</div></div>
      ) : (
        <>
          <section className="panel" style={{ marginTop: 0 }}>
            <div className="panel-cabeza">
              <h2>{nombreSel ?? "Gasto por mes"}</h2>
              {sel && <button className="enlace-chico boton-texto" onClick={() => setSel(null)}>Ver todo</button>}
            </div>
            <BarrasMes datos={porMes} promedio={promedio} />
            <div className="stats">
              <div><div className="k">Total</div><div className="v">{fmt(total, false)}</div></div>
              <div><div className="k">Promedio mensual</div><div className="v">{fmt(promedio, false)}</div></div>
              <div><div className="k">Mediana</div><div className="v">{fmt(mediana, false)}</div></div>
              {alto && <div><div className="k">Mes más alto</div><div className="v">{fmt(alto.monto, false)}<small>{alto.etiqueta}</small></div></div>}
              {bajo && <div><div className="k">Mes más bajo</div><div className="v">{fmt(bajo.monto, false)}<small>{bajo.etiqueta}</small></div></div>}
              {ultimoCerrado && promedio > 0 && (
                <div><div className="k">{ultimoCerrado.etiqueta} vs. promedio</div>
                  <div className={"v " + (ultimoCerrado.monto > promedio ? "negativo" : "positivo")}>
                    {ultimoCerrado.monto >= promedio ? "+" : "−"}{Math.round(Math.abs(ultimoCerrado.monto / promedio - 1) * 100)}%</div></div>
              )}
            </div>
            <p className="nota">El promedio y la mediana usan los meses cerrados; el mes en curso aparece en la gráfica pero no cuenta. Cuenta solo tu parte de cada gasto; las compras a meses cuentan completas en el mes de compra.</p>
          </section>

          <h2>Desglose</h2>
          <Segmentos etiqueta="Agrupar por" valor={vista} onCambio={(v) => { setVista(v); setSel(null); }} opciones={[
            { v: "categoria", t: "Categorías" }, { v: "cuenta", t: "Cuentas" }]} />
          {vista === "categoria" ? (
            <section className="panel" style={{ marginTop: 0 }}><DesgloseCategorias cats={cats} total={totalGeneral} sel={sel} onSel={setSel} /></section>
          ) : (
          <div className="lista">
            {grupos.map((g) => {
              const pct = totalGeneral > 0 ? g.total / totalGeneral : 0;
              const prom = g.total / Math.max(1, Number(meses));
              const activo = sel === g.clave;
              return (
                <button key={g.clave} className={"fila analisis" + (activo ? " activa" : "")} aria-pressed={activo} onClick={() => setSel(activo ? null : g.clave)}>
                  {g.tipo ? <IconoCuenta tipo={g.tipo} /> : <IconoCategoria nombre="Otros" />}
                  <div className="cuerpo">
                    <div className="cat-linea"><span className="cat-nombre">{g.nombre}</span><span className="cat-monto">{fmt(g.total, false)}</span></div>
                    <div className="cat-riel"><span style={{ width: `${(g.total / Math.max(1, grupos[0].total)) * 100}%` }} /></div>
                    <div className="detalle">{Math.round(pct * 1000) / 10}% del total · {fmt(prom, false)}/mes</div>
                  </div>
                </button>
              );
            })}
          </div>
          )}
          <p className="nota">Toca una {vista === "categoria" ? "categoría o subcategoría" : "cuenta"} para ver su gasto mes a mes en la gráfica.</p>
        </>
      )}
    </>
  );
}

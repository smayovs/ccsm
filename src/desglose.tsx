import { fmt } from "./util";
import { IconoCategoria } from "./iconos";

export type FilaCat = { categoria_id: string | null; categoria: string; icono: string | null; sub_id: string | null; sub: string | null; monto: number };
export type Sub = { clave: string; nombre: string; total: number };
export type Cat = { clave: string; nombre: string; icono: string | null; total: number; subs: Sub[] };

// Agrupa por categoría y, dentro, por subcategoría ("General" = gastos en la categoría sin subcategoría)
export function agruparCategorias(filas: FilaCat[]): Cat[] {
  const g: Record<string, Cat & { s: Record<string, Sub> }> = {};
  for (const f of filas) {
    const clave = f.categoria_id ?? "sin";
    const c = (g[clave] ??= { clave, nombre: f.categoria, icono: f.icono, total: 0, subs: [], s: {} });
    c.total += f.monto;
    const sk = f.sub_id ?? `${clave}:general`;
    const s = (c.s[sk] ??= { clave: sk, nombre: f.sub ?? "General", total: 0 });
    s.total += f.monto;
  }
  return Object.values(g).map(({ s, ...c }) => {
    const subs = Object.values(s).filter((x) => Math.abs(x.total) > 0.004).sort((a, b) => b.total - a.total);
    // Si todo está en la categoría sin subcategorías, no se repite la línea "General"
    return { ...c, subs: subs.length === 1 && subs[0].nombre === "General" ? [] : subs };
  }).filter((c) => Math.abs(c.total) > 0.004).sort((a, b) => b.total - a.total);
}

// Lista de categorías con sus subcategorías debajo, cada una con su barra
export function DesgloseCategorias({ cats, total, sel, onSel }: {
  cats: Cat[]; total: number; sel?: string | null; onSel?: (clave: string | null) => void;
}) {
  const max = Math.max(1, ...cats.map((c) => c.total));
  const Caja: any = onSel ? "button" : "div";
  const pct = (v: number) => (total > 0 ? `${Math.round((v / total) * 100)}%` : "");
  return (
    <div className="cats">
      {cats.map((c) => (
        <div key={c.clave} className="cat-grupo">
          <Caja className={"cat" + (onSel ? " tocable" : "") + (sel === c.clave ? " activa" : "")} {...(onSel ? { type: "button", "aria-pressed": sel === c.clave, onClick: () => onSel(sel === c.clave ? null : c.clave) } : {})}>
            <IconoCategoria nombre={c.nombre} icono={c.icono} />
            <div className="cat-cuerpo">
              <div className="cat-linea"><span className="cat-nombre">{c.nombre}</span>
                <span className="cat-monto">{fmt(c.total, false)}<small> {pct(c.total)}</small></span></div>
              <div className="cat-riel"><span style={{ width: `${(Math.max(0, c.total) / max) * 100}%` }} /></div>
            </div>
          </Caja>
          {c.subs.length > 0 && (
            <div className="subcats">
              {c.subs.map((s) => (
                <Caja key={s.clave} className={"subcat" + (onSel ? " tocable" : "") + (sel === s.clave ? " activa" : "")} {...(onSel ? { type: "button", "aria-pressed": sel === s.clave, onClick: () => onSel(sel === s.clave ? null : s.clave) } : {})}>
                  <div className="cat-linea"><span className="sub-nombre">{s.nombre}</span><span className="sub-monto">{fmt(s.total, false)}</span></div>
                  <div className="cat-riel fino"><span style={{ width: `${c.total > 0 ? (Math.max(0, s.total) / c.total) * 100 : 0}%` }} /></div>
                </Caja>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

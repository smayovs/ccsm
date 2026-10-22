import { ArrowDown, ArrowUp } from "../phosphor";

// Lista de secciones con interruptor para mostrarlas y flechas para ordenarlas (Inicio y detalle de tarjeta)
export function OrdenSecciones<T extends string>({ config, catalogo, onCambio }: {
  config: { id: T; visible: boolean }[];
  catalogo: { id: T; nombre: string; detalle: string; filtrable?: boolean }[];
  onCambio: (nueva: { id: T; visible: boolean }[]) => void;
}) {
  const mover = (i: number, d: number) => {
    const j = i + d; if (j < 0 || j >= config.length) return;
    const nueva = [...config]; [nueva[i], nueva[j]] = [nueva[j], nueva[i]];
    onCambio(nueva);
  };
  return (
    <div className="lista">
      {config.map((c, i) => {
        const s = catalogo.find((x) => x.id === c.id)!;
        return (
          <div className={"fila personalizar" + (c.visible ? "" : " apagada")} key={c.id}>
            <label className="interruptor" aria-label={`Mostrar ${s.nombre}`}>
              <input type="checkbox" checked={c.visible} onChange={(e) => onCambio(config.map((x) => (x.id === c.id ? { ...x, visible: e.target.checked } : x)))} />
              <span />
            </label>
            <div className="cuerpo">
              <div className="titulo">{s.nombre}</div>
              <div className="detalle">{s.filtrable && <span className="etiq">Filtros</span>}{s.detalle}</div>
            </div>
            <button className="boton chico claro" aria-label={`Subir ${s.nombre}`} disabled={i === 0} onClick={() => mover(i, -1)}><ArrowUp size={16} /></button>
            <button className="boton chico claro" aria-label={`Bajar ${s.nombre}`} disabled={i === config.length - 1} onClick={() => mover(i, 1)}><ArrowDown size={16} /></button>
          </div>
        );
      })}
    </div>
  );
}

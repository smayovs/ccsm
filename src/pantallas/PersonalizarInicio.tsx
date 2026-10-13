import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useApp } from "../contexto";
import { Cabeza } from "../ui";
import { errorTexto } from "../util";
import { cargarConfig, ConfigInicio, configInicial, guardarConfig, SECCIONES } from "../inicio/secciones";

// Elegir qué secciones se ven en Inicio y en qué orden (se guarda en tu cuenta)
export default function PersonalizarInicio() {
  const { uid, aviso } = useApp();
  const [config, setConfig] = useState<ConfigInicio | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { cargarConfig(uid).then(setConfig); }, [uid]);

  async function cambiar(nueva: ConfigInicio) {
    setConfig(nueva); setError("");
    const { error } = await guardarConfig(uid, nueva);
    if (error) setError(errorTexto(error));
  }
  const mover = (i: number, d: number) => {
    if (!config) return;
    const j = i + d; if (j < 0 || j >= config.length) return;
    const nueva = [...config]; [nueva[i], nueva[j]] = [nueva[j], nueva[i]];
    cambiar(nueva);
  };

  if (!config) return <><Cabeza titulo="Personalizar Inicio" volver /><div className="vacio">Cargando…</div></>;
  const activas = config.filter((c) => c.visible).length;

  return (
    <>
      <Cabeza titulo="Personalizar Inicio" volver />
      <p className="nota" style={{ marginTop: -8 }}>Activa las secciones que quieres ver y ordénalas con las flechas. Se guarda en tu cuenta, así que se ve igual en todos tus dispositivos. Las marcadas con <span className="etiq">Filtros</span> responden al periodo, cuentas y categoría que elijas arriba en Inicio.</p>
      <div className="lista">
        {config.map((c, i) => {
          const s = SECCIONES.find((x) => x.id === c.id)!;
          return (
            <div className={"fila personalizar" + (c.visible ? "" : " apagada")} key={c.id}>
              <label className="interruptor" aria-label={`Mostrar ${s.nombre}`}>
                <input type="checkbox" checked={c.visible} onChange={(e) => cambiar(config.map((x) => (x.id === c.id ? { ...x, visible: e.target.checked } : x)))} />
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
      <p className="nota">{activas} de {config.length} secciones activas.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button className="boton claro" onClick={() => { cambiar(configInicial()); aviso("Inicio restablecido"); }}>Restablecer</button>
      </div>
    </>
  );
}

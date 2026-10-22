import { useEffect, useState } from "react";
import { useApp } from "../contexto";
import { Cabeza, Cargando } from "../ui";
import { errorTexto } from "../util";
import { OrdenSecciones } from "../inicio/OrdenSecciones";
import { cargarConfigTarjeta, configTarjetaInicial, guardarConfigTarjeta, SECCIONES_TARJETA, type ConfigTarjeta } from "../inicio/secciones";

// Elegir qué secciones se ven en el detalle de las tarjetas de crédito y en qué orden (se guarda en tu cuenta)
export default function PersonalizarTarjeta() {
  const { uid, aviso } = useApp();
  const [config, setConfig] = useState<ConfigTarjeta | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { cargarConfigTarjeta(uid).then(setConfig); }, [uid]);

  async function cambiar(nueva: ConfigTarjeta) {
    setConfig(nueva); setError("");
    const { error } = await guardarConfigTarjeta(uid, nueva);
    if (error) setError(errorTexto(error));
  }

  if (!config) return <><Cabeza titulo="Personalizar tarjetas" volver /><Cargando /></>;
  return (
    <>
      <Cabeza titulo="Personalizar tarjetas" volver />
      <p className="nota mt-0">Activa lo que quieres ver en el detalle de tus tarjetas de crédito y ordénalo con las flechas. Aplica a todas tus tarjetas y se guarda en tu cuenta.</p>
      <OrdenSecciones config={config} catalogo={SECCIONES_TARJETA} onCambio={cambiar} />
      <p className="nota">{config.filter((c) => c.visible).length} de {config.length} secciones activas. Los botones de registrar gasto y pagar siempre se ven.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button className="boton claro" onClick={() => { cambiar(configTarjetaInicial()); aviso("Tarjetas restablecidas"); }}>Restablecer</button>
      </div>
    </>
  );
}

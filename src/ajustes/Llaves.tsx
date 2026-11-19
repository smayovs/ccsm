import { useEffect, useState } from "react";
import { DeviceMobile } from "../phosphor";
import { sb, URL_ATAJOS } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza, Campo, ConfirmarBorrar, Seccion } from "../ui";
import { errorTexto } from "../util";

export default function Llaves() {
  const { aviso } = useApp();
  const [lista, setLista] = useState<any[]>([]);
  const [nombre, setNombre] = useState("iPhone");
  const [nueva, setNueva] = useState("");
  const [error, setError] = useState("");
  const cargar = () => sb.from("tokens_atajos").select("id, nombre, prefijo, ultimo_uso, revocado, created_at").order("created_at", { ascending: false })
    .then(({ data }) => setLista(data ?? []));
  useEffect(() => { cargar(); }, []);

  async function crear() {
    setError("");
    const { data, error } = await sb.rpc("crear_token_atajo", { p_nombre: nombre });
    if (error) return setError(errorTexto(error));
    setNueva(data as string); cargar();
  }
  async function revocar(id: string) {
    const { error } = await sb.from("tokens_atajos").update({ revocado: true }).eq("id", id);
    if (error) return setError(errorTexto(error));
    aviso("Llave revocada"); cargar();
  }
  async function copiar(t: string, q: string) {
    try { await navigator.clipboard.writeText(t); aviso(`${q} copiada`); } catch { aviso("Mantén presionado el texto para copiarlo"); }
  }

  return (
    <>
      <Cabeza titulo="Atajos del iPhone" volver />
      <p className="nota mt-n8">Tus atajos (el manual y el de Apple Pay) usan esta dirección y una llave personal. La llave registra a tu nombre, así que trátala como una contraseña.</p>
      <Seccion titulo="Dirección" ayuda="Tócala para copiarla">
        <button type="button" className="llave" onClick={() => copiar(URL_ATAJOS, "Dirección")} aria-label={`Copiar dirección: ${URL_ATAJOS}`}>{URL_ATAJOS}</button>
      </Seccion>

      <Seccion titulo="Llave nueva">
      <div className="panel mt-0">
      {nueva ? (
        <>
          <button type="button" className="llave" onClick={() => copiar(nueva, "Llave")}>{nueva}</button>
          <p className="nota">Cópiala ahora y pégala en tus atajos: por seguridad no se vuelve a mostrar. Si la pierdes, crea otra y revoca esta.</p>
          <div className="acciones">
            <button className="boton" onClick={() => copiar(nueva, "Llave")}>Copiar llave</button>
            <button className="boton claro" onClick={() => setNueva("")}>Listo</button>
          </div>
        </>
      ) : (
        <>
          <Campo etiqueta="¿Para qué dispositivo?"><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Campo>
          <button className="boton ancho" onClick={crear}>Crear llave</button>
        </>
      )}
      </div>
      </Seccion>

      <Seccion titulo="Gasto para alguien más" ayuda="Para que el atajo de Apple Pay pregunte de quién es la compra">
        <div className="panel mt-0">
          <ol className="pasos-lista">
            <li>En tu atajo, después de pedir el catálogo a la dirección (la petición GET), agrega <b>Obtener valor del diccionario</b> con la clave <code>paraQuien</code>.</li>
            <li>Agrega <b>Elegir de la lista</b> con ese resultado. La lista trae «Para mí» y tus personas de Más › Personas.</li>
            <li>En el diccionario que envías (la petición POST), agrega la clave <code>porCuentaDe</code> con el elemento elegido.</li>
          </ol>
          <p className="nota">Si eliges «Para mí», el gasto es tuyo como siempre. Si eliges a alguien, el gasto se carga a tu tarjeta, no cuenta en tus gastos y se va a Cobros a su nombre; el aviso del iPhone te dice cuánto le llevas este mes. Para dividir una compra entre varias personas, regístrala como tuya y divídela después en la app.</p>
        </div>
      </Seccion>

      <Seccion titulo="Llaves" contador={lista.length}>
      <div className="lista">
        {lista.length === 0 && <div className="vacio">Aún no tienes llaves.</div>}
        {lista.map((t) => (
          <div className="fila envolver" key={t.id}>
            <span className={"ico" + (t.revocado ? " gris" : "")} aria-hidden="true"><DeviceMobile size={20} /></span>
            <div className="cuerpo">
              <div className="titulo">{t.nombre} <span className="sub">{t.prefijo}…</span></div>
              <div className="detalle">{t.revocado ? "Revocada" : t.ultimo_uso ? `Último uso: ${new Date(t.ultimo_uso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}` : "Sin usar todavía"}</div>
            </div>
            {!t.revocado && <ConfirmarBorrar chico etiqueta="Revocar" confirmar="Sí, revocar" onConfirmar={() => revocar(t.id)} />}
          </div>
        ))}
      </div>
      </Seccion>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

import { useEffect, useState } from "react";
import { sb, URL_ATAJOS } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza, Campo } from "../ui";
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
      <p className="nota" style={{ marginTop: -8 }}>Tus atajos (el manual y el de Apple Pay) usan esta dirección y una llave personal. La llave registra a tu nombre, así que trátala como una contraseña.</p>
      <h2>Dirección</h2>
      <div className="llave" onClick={() => copiar(URL_ATAJOS, "Dirección")}>{URL_ATAJOS}</div>

      <h2>Llave nueva</h2>
      {nueva ? (
        <>
          <div className="llave" onClick={() => copiar(nueva, "Llave")}>{nueva}</div>
          <p className="nota">Cópiala ahora y pégala en tus atajos: por seguridad no se vuelve a mostrar. Si la pierdes, crea otra y revoca esta.</p>
          <div className="acciones">
            <button className="boton" onClick={() => copiar(nueva, "Llave")}>Copiar llave</button>
            <button className="boton claro" onClick={() => setNueva("")}>Listo</button>
          </div>
        </>
      ) : (
        <>
          <Campo etiqueta="¿Para qué dispositivo?"><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Campo>
          <button className="boton" onClick={crear}>Crear llave</button>
        </>
      )}

      <h2>Llaves</h2>
      <div className="lista">
        {lista.length === 0 && <div className="vacio">Aún no tienes llaves.</div>}
        {lista.map((t) => (
          <div className="fila" key={t.id}>
            <div className="cuerpo">
              <div className="titulo">{t.nombre} <span className="sub">{t.prefijo}…</span></div>
              <div className="detalle">{t.revocado ? "Revocada" : t.ultimo_uso ? `Último uso: ${new Date(t.ultimo_uso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}` : "Sin usar todavía"}</div>
            </div>
            {!t.revocado && <button className="boton chico peligro" onClick={() => revocar(t.id)}>Revocar</button>}
          </div>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

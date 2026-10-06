import { useState } from "react";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza, Campo } from "../ui";
import { errorTexto } from "../util";
import { Invitar } from "../pantallas/Hogar";

export default function Perfil() {
  const { session, yo, otros, uid, recargar, aviso } = useApp();
  const [nombre, setNombre] = useState(yo?.nombre ?? "");
  const [error, setError] = useState("");
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await sb.from("miembros").update({ nombre: nombre.trim() }).eq("user_id", uid);
    if (error) return setError(errorTexto(error));
    aviso("Nombre guardado"); recargar();
  }
  return (
    <>
      <Cabeza titulo="Perfil y hogar" volver />
      <form onSubmit={guardar}>
        <Campo etiqueta="Tu nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Campo>
        <button className="boton">Guardar</button>
      </form>
      <p className="nota">Correo: {session?.user.email}</p>

      <h2>Hogar</h2>
      {otros.length > 0
        ? <p>Compartes el hogar con {otros.map((o) => o.nombre).join(", ")}.</p>
        : <><p>Aún estás solo en el hogar. Invita a tu pareja:</p><Invitar /></>}

      <h2>Sesión</h2>
      <button className="boton peligro" onClick={() => sb.auth.signOut()}>Cerrar sesión</button>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

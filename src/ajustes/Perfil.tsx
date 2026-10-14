import { useState } from "react";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza, Campo, ConfirmarBorrar, Seccion } from "../ui";
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
      <div className="perfil-tarjeta">
        <span className="avatar" aria-hidden="true">{(nombre || "?").trim().charAt(0).toUpperCase()}</span>
        <div className="cuerpo"><div className="nombre">{nombre || "Tu nombre"}</div><div className="detalle">{session?.user.email}</div></div>
      </div>
      <Seccion titulo="Tu nombre">
        <form onSubmit={guardar} className="flex gap-8">
          <input className="buscador m-0 crece" aria-label="Tu nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <button className="boton chico">Guardar</button>
        </form>
      </Seccion>

      <Seccion titulo="Hogar">
        {otros.length > 0
          ? <div className="lista">{otros.map((o) => (
              <div className="fila" key={o.user_id}><span className={"avatar-mini r-" + (o.color ?? "rosa")} aria-hidden="true">{o.nombre.trim().charAt(0).toUpperCase()}</span>
                <div className="cuerpo"><div className="titulo">{o.nombre}</div><div className="detalle">Comparten el hogar</div></div></div>))}</div>
          : <><p className="mt-0">Aún estás solo en el hogar. Invita a tu pareja:</p><Invitar /></>}
      </Seccion>

      <Seccion titulo="Sesión">
        <ConfirmarBorrar etiqueta="Cerrar sesión" confirmar="Sí, cerrar sesión" pregunta="Para volver a entrar necesitarás tu correo y contraseña." onConfirmar={() => sb.auth.signOut()} />
      </Seccion>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

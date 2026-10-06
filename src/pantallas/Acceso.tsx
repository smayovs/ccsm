import { useState } from "react";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Campo, Segmentos } from "../ui";

const URL_APP = `${location.origin}${import.meta.env.BASE_URL}`;

function traducir(m: string) {
  if (/Invalid login credentials/i.test(m)) return "Correo o contraseña incorrectos.";
  if (/Email not confirmed/i.test(m)) return "Primero confirma tu correo: abre el enlace que te enviamos y luego vuelve a entrar aquí.";
  if (/already registered/i.test(m)) return "Ese correo ya tiene cuenta. Elige Entrar.";
  if (/rate limit|too many/i.test(m)) return "Demasiados intentos o correos seguidos. Espera unos minutos.";
  if (/at least 6/i.test(m)) return "La contraseña debe tener al menos 6 caracteres.";
  return m;
}

export default function Acceso() {
  const [modo, setModo] = useState<"entrar" | "crear" | "olvide">("entrar");
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setError(""); setMensaje(""); setOcupado(true);
    const email = correo.trim().toLowerCase();
    if (modo === "entrar") {
      const { error } = await sb.auth.signInWithPassword({ email, password: clave });
      if (error) setError(traducir(error.message));
    } else if (modo === "crear") {
      const { data, error } = await sb.auth.signUp({ email, password: clave, options: { emailRedirectTo: URL_APP } });
      if (error) setError(traducir(error.message));
      else if (!data.session) { setMensaje(`Te enviamos un correo a ${email}. Abre el enlace para confirmar tu cuenta y luego vuelve aquí a Entrar.`); setModo("entrar"); }
    } else {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: URL_APP });
      if (error) setError(traducir(error.message));
      else { setMensaje(`Si ${email} tiene cuenta, te llegará un enlace para crear una contraseña nueva.`); setModo("entrar"); }
    }
    setOcupado(false);
  }

  return (
    <div className="acceso">
      <img className="logo" src={`${import.meta.env.BASE_URL}icono.svg`} alt="" />
      <h1>Finanzas para dos</h1>
      <p>{modo === "crear" ? "Crea tu cuenta. Te llegará un correo para confirmarla, solo esta vez."
        : modo === "olvide" ? "Te enviamos un enlace para crear una contraseña nueva."
        : "Entra con tu correo y contraseña."}</p>
      {modo !== "olvide" && (
        <Segmentos etiqueta="Acceso" valor={modo} onCambio={(v) => { setModo(v); setError(""); }}
          opciones={[{ v: "entrar", t: "Entrar" }, { v: "crear", t: "Crear cuenta" }]} />
      )}
      <form onSubmit={enviar}>
        <Campo etiqueta="Correo">
          <input type="email" required autoComplete="email" inputMode="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
        </Campo>
        {modo !== "olvide" && (
          <Campo etiqueta="Contraseña" ayuda={modo === "crear" ? "Al menos 6 caracteres. Tu iPhone puede guardarla." : undefined}>
            <input type="password" required minLength={6} autoComplete={modo === "crear" ? "new-password" : "current-password"} value={clave} onChange={(e) => setClave(e.target.value)} />
          </Campo>
        )}
        <button className="boton ancho" disabled={ocupado}>
          {ocupado ? "Un momento…" : modo === "entrar" ? "Entrar" : modo === "crear" ? "Crear cuenta" : "Enviar enlace"}
        </button>
      </form>
      <div className="acciones">
        {modo === "olvide"
          ? <button type="button" className="boton claro" onClick={() => setModo("entrar")}>Volver</button>
          : <button type="button" className="boton claro" onClick={() => { setModo("olvide"); setError(""); }}>Olvidé mi contraseña</button>}
      </div>
      {mensaje && <p className="aviso verde" role="status">{mensaje}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

export function NuevaContrasena() {
  const { terminarRecuperacion, aviso } = useApp();
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: clave });
    if (error) return setError(traducir(error.message));
    aviso("Contraseña actualizada"); terminarRecuperacion();
  }
  return (
    <div className="acceso">
      <h1>Contraseña nueva</h1>
      <p>Escribe la contraseña que usarás para entrar.</p>
      <form onSubmit={guardar}>
        <Campo etiqueta="Contraseña nueva"><input type="password" required minLength={6} autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} /></Campo>
        <button className="boton ancho">Guardar contraseña</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

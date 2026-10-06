import { useState } from "react";
import { sb } from "../supabase";
import { Campo } from "../ui";

export default function Acceso() {
  const [correo, setCorreo] = useState("");
  const [codigo, setCodigo] = useState("");
  const [paso, setPaso] = useState<"correo" | "codigo">("correo");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setError(""); setOcupado(true);
    const { error } = await sb.auth.signInWithOtp({ email: correo.trim(), options: { shouldCreateUser: true } });
    setOcupado(false);
    if (error) setError(error.message.includes("rate") ? "Se enviaron demasiados códigos. Espera unos minutos y vuelve a intentar." : error.message);
    else setPaso("codigo");
  }
  async function verificar(e: React.FormEvent) {
    e.preventDefault(); setError(""); setOcupado(true);
    const { error } = await sb.auth.verifyOtp({ email: correo.trim(), token: codigo.trim(), type: "email" });
    setOcupado(false);
    if (error) setError("El código no es válido o ya venció. Pide uno nuevo.");
  }

  return (
    <div className="acceso">
      <img className="logo" src={`${import.meta.env.BASE_URL}icono.svg`} alt="" />
      <h1>Finanzas para dos</h1>
      {paso === "correo" ? (
        <form onSubmit={enviar}>
          <p>Escribe tu correo y te mandamos un código de 6 dígitos para entrar. No hay contraseña.</p>
          <Campo etiqueta="Correo">
            <input type="email" required autoComplete="email" inputMode="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
          </Campo>
          <button className="boton ancho" disabled={ocupado}>{ocupado ? "Enviando…" : "Enviar código"}</button>
        </form>
      ) : (
        <form onSubmit={verificar}>
          <p>Revisa tu correo <strong>{correo}</strong> y escribe el código.</p>
          <Campo etiqueta="Código">
            <input required inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} className="monto-grande" />
          </Campo>
          <button className="boton ancho" disabled={ocupado || codigo.length < 6}>{ocupado ? "Verificando…" : "Entrar"}</button>
          <div className="acciones">
            <button type="button" className="boton claro" onClick={() => { setPaso("correo"); setCodigo(""); }}>Cambiar correo</button>
          </div>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

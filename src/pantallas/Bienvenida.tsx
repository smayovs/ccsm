import { useState } from "react";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Campo, Segmentos } from "../ui";
import { errorTexto } from "../util";

export default function Bienvenida() {
  const { recargar } = useApp();
  const [modo, setModo] = useState<"crear" | "unirme">("crear");
  const [nombre, setNombre] = useState("");
  const [hogar, setHogar] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function listo(e: React.FormEvent) {
    e.preventDefault(); setError(""); setOcupado(true);
    const r = modo === "crear"
      ? await sb.rpc("crear_hogar", { p_nombre_hogar: hogar || "Nuestro hogar", p_mi_nombre: nombre })
      : await sb.rpc("aceptar_invitacion", { p_codigo: codigo, p_mi_nombre: nombre });
    setOcupado(false);
    if (r.error) setError(errorTexto(r.error)); else await recargar();
  }

  return (
    <div className="acceso">
      <h1>Bienvenido a CCSM</h1>
      <p>Si eres la primera persona, crea el hogar. Si te invitaron, usa el código que te pasaron.</p>
      <Segmentos etiqueta="Cómo empezar" valor={modo} onCambio={setModo}
        opciones={[{ v: "crear", t: "Crear hogar" }, { v: "unirme", t: "Tengo un código" }]} />
      <form onSubmit={listo}>
        <Campo etiqueta="Tu nombre" ayuda="Así te verá tu pareja en los gastos compartidos.">
          <input required value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="given-name" />
        </Campo>
        {modo === "crear" ? (
          <Campo etiqueta="Nombre del hogar"><input value={hogar} onChange={(e) => setHogar(e.target.value)} placeholder="Nuestro hogar" /></Campo>
        ) : (
          <Campo etiqueta="Código de invitación"><input required value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} autoCapitalize="characters" /></Campo>
        )}
        <button className="boton ancho" disabled={ocupado}>{modo === "crear" ? "Crear hogar" : "Unirme"}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="nota" style={{ marginTop: 18 }}>Se crean tus categorías, reglas para Apple Pay y la lista de personas a las que les cobras. Todo se puede editar después.</p>
    </div>
  );
}

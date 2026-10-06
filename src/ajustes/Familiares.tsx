import { useState } from "react";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza } from "../ui";
import { errorTexto } from "../util";

export default function Familiares() {
  const { uid, familiares, recargar, aviso } = useApp();
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  async function agregar(e: React.FormEvent) {
    e.preventDefault(); if (!nombre.trim()) return;
    const { error } = await sb.from("familiares").insert({ nombre: nombre.trim(), propietario_id: uid });
    if (error) return setError(errorTexto(error));
    setNombre(""); aviso("Agregado"); recargar();
  }
  async function cambiar(id: string, activo: boolean) {
    const { error } = await sb.from("familiares").update({ activo }).eq("id", id);
    if (error) return setError(errorTexto(error));
    recargar();
  }
  return (
    <>
      <Cabeza titulo="Familiares" volver />
      <p className="nota" style={{ marginTop: -8 }}>Personas a las que les compras con tus tarjetas y luego les cobras. Tu pareja no va aquí: lo suyo se maneja con gastos compartidos.</p>
      <div className="lista" style={{ marginTop: 14 }}>
        {familiares.map((f) => (
          <div className="fila" key={f.id}>
            <div className="cuerpo"><div className="titulo">{f.nombre}</div>{!f.activo && <div className="detalle">Desactivado</div>}</div>
            <button className="boton chico claro" onClick={() => cambiar(f.id, !f.activo)}>{f.activo ? "Desactivar" : "Activar"}</button>
          </div>
        ))}
      </div>
      <form onSubmit={agregar} style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <input className="buscador" style={{ margin: 0, flex: 1 }} placeholder="Nombre (ej. Hermana)" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <button className="boton chico">Agregar</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

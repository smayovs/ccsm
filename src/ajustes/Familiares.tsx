import { useState } from "react";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza } from "../ui";
import { errorTexto } from "../util";

export default function Familiares() {
  const { uid, familiares, recargar, aviso } = useApp();
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState("");
  async function renombrar(e: React.FormEvent) {
    e.preventDefault(); if (!editando || !nuevo.trim()) return;
    const { error } = await sb.from("familiares").update({ nombre: nuevo.trim() }).eq("id", editando);
    if (error) return setError(errorTexto(error));
    setEditando(null); setError(""); aviso("Nombre actualizado"); recargar();
  }
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
      <Cabeza titulo="Personas" volver />
      <p className="nota mt-n8">Si cambias un nombre, se actualiza en todos sus gastos y cobros. Familiares, amigos o cualquier persona a la que le compres o prestes con tus tarjetas o tu dinero. Lo suyo no cuenta en tus gastos y se va a Cobros. Tu pareja no va aquí: lo de ustedes se maneja con gastos compartidos.</p>
      <div className="lista mt-14">
        {familiares.map((f) => (
          editando === f.id ? (
            <form className="fila gap-8" key={f.id} onSubmit={renombrar}>
              <input className="buscador m-0 crece" value={nuevo} onChange={(e) => setNuevo(e.target.value)} autoFocus aria-label="Nuevo nombre" />
              <button type="button" className="boton chico claro" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="boton chico">Guardar</button>
            </form>
          ) : (
            <div className="fila" key={f.id} id={`p-${f.id}`}>
              <div className="cuerpo"><div className="titulo">{f.nombre}</div>{!f.activo && <div className="detalle">Desactivado</div>}</div>
              <button className="boton chico claro" onClick={() => { setEditando(f.id); setNuevo(f.nombre); }}>Editar</button>
              <button className="boton chico claro" onClick={() => cambiar(f.id, !f.activo)}>{f.activo ? "Desactivar" : "Activar"}</button>
            </div>
          )
        ))}
      </div>
      <form onSubmit={agregar} className="flex gap-8 mt-14">
        <input className="buscador m-0 crece" aria-label="Nombre del familiar" placeholder="Nombre (ej. Hermana, Luis del trabajo)" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <button className="boton chico">Agregar</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

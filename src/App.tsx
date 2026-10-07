import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { useApp } from "./contexto";
import { sb } from "./supabase";
import { Icono } from "./ui";
import Acceso, { NuevaContrasena } from "./pantallas/Acceso";
import Bienvenida from "./pantallas/Bienvenida";
import Inicio from "./pantallas/Inicio";
import Movimientos from "./pantallas/Movimientos";
import Formulario from "./pantallas/Formulario";
import Hogar from "./pantallas/Hogar";
import Pendientes from "./pantallas/Pendientes";
import Mas from "./pantallas/Mas";
import Cuenta from "./pantallas/Cuenta";
import Analisis from "./pantallas/Analisis";
import Cobros from "./pantallas/Cobros";
import Msi from "./pantallas/Msi";
import Suscripciones from "./pantallas/Suscripciones";
import Cuentas from "./ajustes/Cuentas";
import Categorias from "./ajustes/Categorias";
import Reglas from "./ajustes/Reglas";
import Familiares from "./ajustes/Familiares";
import Llaves from "./ajustes/Llaves";
import Perfil from "./ajustes/Perfil";
import CuadrarTarjeta from "./ajustes/CuadrarTarjeta";
import NuevaTarjeta from "./ajustes/NuevaTarjeta";

export default function App() {
  const { session, yo, listo, uid, recuperando } = useApp();
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    if (!yo) return;
    sb.rpc("resumen_mes").then(({ data }) => setPendientes(data?.[0]?.por_revisar ?? 0));
  }, [yo, uid]);

  if (!listo) return <div className="cargando">Cargando…</div>;
  if (!session) return <Acceso />;
  if (recuperando) return <NuevaContrasena />;
  if (!yo) return <Bienvenida />;

  return (
    <>
      <main className="app">
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/movimientos" element={<Movimientos />} />
          <Route path="/nuevo" element={<Formulario />} />
          <Route path="/editar/:id" element={<Formulario />} />
          <Route path="/hogar" element={<Hogar />} />
          <Route path="/pendientes" element={<Pendientes onCambio={setPendientes} />} />
          <Route path="/mas" element={<Mas />} />
          <Route path="/cuenta/:id" element={<Cuenta />} />
          <Route path="/analisis" element={<Analisis />} />
          <Route path="/cobros" element={<Cobros />} />
          <Route path="/msi" element={<Msi />} />
          <Route path="/suscripciones" element={<Suscripciones />} />
          <Route path="/ajustes/cuentas" element={<Cuentas />} />
          <Route path="/ajustes/categorias" element={<Categorias />} />
          <Route path="/ajustes/reglas" element={<Reglas />} />
          <Route path="/ajustes/familiares" element={<Familiares />} />
          <Route path="/ajustes/llaves" element={<Llaves />} />
          <Route path="/ajustes/perfil" element={<Perfil />} />
          <Route path="/ajustes/tarjeta/:id/cuadrar" element={<CuadrarTarjeta />} />
          <Route path="/ajustes/tarjeta-nueva" element={<NuevaTarjeta />} />
          <Route path="*" element={<Inicio />} />
        </Routes>
      </main>
      <nav className="nav" aria-label="Principal">
        <div className="dentro">
          <NavLink to="/" end><Icono.inicio />Inicio</NavLink>
          <NavLink to="/movimientos"><Icono.lista />Movimientos</NavLink>
          <NavLink to="/nuevo" className="mas-grande" aria-label="Agregar movimiento"><span className="circulo"><Icono.mas /></span></NavLink>
          <NavLink to="/hogar"><Icono.hogar />Hogar</NavLink>
          <NavLink to="/mas"><Icono.menu />Más{pendientes > 0 && <span className="punto" aria-label={`${pendientes} pendientes`} />}</NavLink>
        </div>
      </nav>
    </>
  );
}

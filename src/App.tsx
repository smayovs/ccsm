import { Suspense, useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useApp } from "./contexto";
import { sb } from "./supabase";
import { Icono } from "./ui";
import { perezoso } from "./perezoso";
// Lo primero que ves al abrir va en la descarga inicial; el resto se descarga al abrir cada pantalla
// (la app instalada las guarda todas, así que también funcionan sin conexión)
import Acceso, { NuevaContrasena } from "./pantallas/Acceso";
import Bienvenida from "./pantallas/Bienvenida";
import Inicio from "./pantallas/Inicio";
const PersonalizarInicio = perezoso(() => import("./pantallas/PersonalizarInicio"));
const AparienciaPantalla = perezoso(() => import("./ajustes/Apariencia"));
const Movimientos = perezoso(() => import("./pantallas/Movimientos"));
const Formulario = perezoso(() => import("./pantallas/Formulario"));
const Hogar = perezoso(() => import("./pantallas/Hogar"));
const Pendientes = perezoso(() => import("./pantallas/Pendientes"));
const Mas = perezoso(() => import("./pantallas/Mas"));
const Cuenta = perezoso(() => import("./pantallas/Cuenta"));
const VariosGastos = perezoso(() => import("./pantallas/VariosGastos"));
const Analisis = perezoso(() => import("./pantallas/Analisis"));
const Cobros = perezoso(() => import("./pantallas/Cobros"));
const Msi = perezoso(() => import("./pantallas/Msi"));
const Suscripciones = perezoso(() => import("./pantallas/Suscripciones"));
const Cuentas = perezoso(() => import("./ajustes/Cuentas"));
const Categorias = perezoso(() => import("./ajustes/Categorias"));
const Reglas = perezoso(() => import("./ajustes/Reglas"));
const Familiares = perezoso(() => import("./ajustes/Familiares"));
const Llaves = perezoso(() => import("./ajustes/Llaves"));
const Perfil = perezoso(() => import("./ajustes/Perfil"));
const CuadrarTarjeta = perezoso(() => import("./ajustes/CuadrarTarjeta"));
const NuevaTarjeta = perezoso(() => import("./ajustes/NuevaTarjeta"));

export default function App() {
  const { session, yo, listo, uid, recuperando, fallo, recargar } = useApp();
  const [reintentando, setReintentando] = useState(false);
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    if (!yo) return;
    sb.rpc("resumen_mes").then(({ data }) => setPendientes(data?.[0]?.por_revisar ?? 0));
  }, [yo, uid]);

  if (!listo) return <div className="cargando">Cargando…</div>;
  if (!session) return <Acceso />;
  if (recuperando) return <NuevaContrasena />;
  // Si no se pudo cargar (sin conexión), se avisa en lugar de pedir que crees un hogar
  if (fallo && !yo) return (
    <div className="acceso">
      <h1>Sin conexión</h1>
      <p>No pude cargar tus datos. Revisa tu internet e inténtalo de nuevo.</p>
      <button className="boton ancho" disabled={reintentando}
        onClick={async () => { setReintentando(true); await recargar(); setReintentando(false); }}>
        {reintentando ? "Un momento…" : "Reintentar"}
      </button>
    </div>
  );
  if (!yo) return <Bienvenida />;

  return (
    <>
      <main className="app">
        <Suspense fallback={<div className="cargando">Cargando…</div>}>
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/inicio/personalizar" element={<PersonalizarInicio />} />
          <Route path="/movimientos" element={<Movimientos />} />
          <Route path="/nuevo" element={<FormularioNuevo />} />
          <Route path="/editar/:id" element={<FormularioNuevo />} />
          <Route path="/hogar" element={<Hogar />} />
          <Route path="/pendientes" element={<Pendientes onCambio={setPendientes} />} />
          <Route path="/mas" element={<Mas />} />
          <Route path="/cuenta/:id" element={<Cuenta />} />
          <Route path="/cuenta/:id/varios" element={<VariosGastos />} />
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
          <Route path="/ajustes/apariencia" element={<AparienciaPantalla />} />
          <Route path="/ajustes/tarjeta/:id/cuadrar" element={<CuadrarTarjeta />} />
          <Route path="/ajustes/tarjeta-nueva" element={<NuevaTarjeta />} />
          <Route path="*" element={<Inicio />} />
        </Routes>
        </Suspense>
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

// Cada apertura del formulario empieza limpia (evita que "+" herede los datos de un movimiento que estabas editando)
function FormularioNuevo() {
  const loc = useLocation();
  return <Formulario key={loc.key + loc.pathname + loc.search} />;
}

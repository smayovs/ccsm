import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { Proveedor } from "./contexto";
import App from "./App";
// Outfit, la letra de la marca, va incluida en la app (sin pedirla a Google): la primera
// pantalla no la espera y funciona sin conexión. Solo caracteres latinos (incluye á, ñ, ¿).
import "@fontsource/outfit/latin-400.css";
import "@fontsource/outfit/latin-500.css";
import "@fontsource/outfit/latin-600.css";
import "@fontsource/outfit/latin-700.css";
import "@fontsource/outfit/latin-800.css";
import "./estilos.css";
import { aparienciaGuardada, aplicarApariencia } from "./tema";
import { registerSW } from "virtual:pwa-register";

// Instala las versiones nuevas en cuanto existen y recarga la app sola.
// Revisa al abrir, al volver a la app y cada hora.
const actualizar = registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const revisar = () => reg.update().catch(() => {});
    setInterval(revisar, 60 * 60 * 1000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") revisar(); });
  },
});
void actualizar;

// La apariencia guardada en este dispositivo se aplica antes de pintar; la de tu cuenta llega al iniciar sesión
aplicarApariencia(aparienciaGuardada());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <Proveedor>
        <App />
      </Proveedor>
    </HashRouter>
  </StrictMode>
);

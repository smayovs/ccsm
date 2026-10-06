import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { Proveedor } from "./contexto";
import App from "./App";
import "./estilos.css";
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <Proveedor>
        <App />
      </Proveedor>
    </HashRouter>
  </StrictMode>
);

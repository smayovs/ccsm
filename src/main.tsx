import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { Proveedor } from "./contexto";
import App from "./App";
import "./estilos.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <Proveedor>
        <App />
      </Proveedor>
    </HashRouter>
  </StrictMode>
);

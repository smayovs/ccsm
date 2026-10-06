import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Publicada en https://smayovs.github.io/ccsm/
const VERSION = new Date().toISOString().slice(0, 16).replace("T", " ");

export default defineConfig({
  define: { __VERSION__: JSON.stringify(VERSION) },
  base: "/ccsm/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["icono.svg", "apple-touch-icon.png"],
      manifest: {
        name: "CCSM — Finanzas para dos",
        short_name: "CCSM",
        lang: "es-MX",
        start_url: "/ccsm/",
        scope: "/ccsm/",
        display: "standalone",
        background_color: "#F2F4F8",
        theme_color: "#0F1E3D",
        icons: [
          { src: "icono-192.png", sizes: "192x192", type: "image/png" },
          { src: "icono-512.png", sizes: "512x512", type: "image/png" },
          { src: "icono-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: { cleanupOutdatedCaches: true, clientsClaim: true, skipWaiting: true, navigateFallback: "/ccsm/index.html", globPatterns: ["**/*.{js,css,html,svg,png,woff2}"] }
    })
  ]
});

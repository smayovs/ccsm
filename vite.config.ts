import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Publicada en https://smayovs.github.io/ccsm/
export default defineConfig({
  base: "/ccsm/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icono.svg", "apple-touch-icon.png"],
      manifest: {
        name: "CCSM — Finanzas para dos",
        short_name: "CCSM",
        lang: "es-MX",
        start_url: "/ccsm/",
        scope: "/ccsm/",
        display: "standalone",
        background_color: "#F4F2F7",
        theme_color: "#6B3A5B",
        icons: [
          { src: "icono-192.png", sizes: "192x192", type: "image/png" },
          { src: "icono-512.png", sizes: "512x512", type: "image/png" },
          { src: "icono-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: { navigateFallback: "/ccsm/index.html", globPatterns: ["**/*.{js,css,html,svg,png,woff2}"] }
    })
  ]
});

import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Publicada en https://smayovs.github.io/ccsm/
const VERSION = new Date().toISOString().slice(0, 16).replace("T", " ");

// Política de seguridad (CSP): de dónde puede cargar cosas la app. Si alguien lograra inyectar código,
// el navegador no lo ejecuta ni deja mandar tus datos a otro sitio. GitHub Pages no permite cabeceras,
// así que va como <meta>. Solo en la versión publicada: el servidor de desarrollo usa scripts en línea.
// Si agregas otro servicio externo, súmalo aquí (connect-src) o el navegador lo bloqueará.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // tema.ts genera estilos; fuentes opcionales de Apariencia
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' https://nvmzmlefywssikkyamyk.supabase.co", // el mismo proyecto de src/supabase.ts
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const politicaSeguridad = (): Plugin => ({
  name: "ccsm-csp",
  apply: "build",
  transformIndexHtml: () => [
    { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
    { tag: "meta", attrs: { name: "referrer", content: "strict-origin-when-cross-origin" }, injectTo: "head-prepend" },
  ],
});

export default defineConfig({
  define: { __VERSION__: JSON.stringify(VERSION) },
  base: "/ccsm/",
  plugins: [
    react(),
    politicaSeguridad(),
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
      workbox: {
        cleanupOutdatedCaches: true, clientsClaim: true, skipWaiting: true, navigateFallback: "/ccsm/index.html", globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // Las otras fuentes de Apariencia vienen de Google: se guardan la primera vez para que funcionen sin conexión
        runtimeCaching: [
          { urlPattern: /^https:\/\/fonts\.googleapis\.com\//, handler: "StaleWhileRevalidate", options: { cacheName: "fuentes-css" } },
          { urlPattern: /^https:\/\/fonts\.gstatic\.com\//, handler: "CacheFirst",
            options: { cacheName: "fuentes-archivos", expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } } },
        ],
      }
    })
  ]
});

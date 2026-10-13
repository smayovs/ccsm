import { mostrarCentavos } from "./util";

// Apariencia elegida por el usuario: paleta (color de acento), modo claro/oscuro, tipografía y tamaño de letra.
export type Apariencia = { paleta: string; acento?: string; modo: "auto" | "claro" | "oscuro"; fuente: string; tamano: "chico" | "normal" | "grande" | "enorme"; discreto?: boolean;
  centavos?: boolean; tarjeta?: "oscura" | "color" | "clara"; densidad?: "comoda" | "compacta"; movimiento?: "auto" | "reducido" };

export const APARIENCIA_INICIAL: Apariencia = { paleta: "ccsm", modo: "auto", fuente: "clasica", tamano: "normal" };

// Paletas de dos colores (como la de la marca): "acento" para botones principales, "segundo" para lo elegido
// y "heroe" para el tono de la tarjeta del resumen. Las de un solo color generan todo a partir del acento.
export type Paleta = { id: string; nombre: string; acento: string; segundo?: string; heroe?: string };
export const PALETAS: Paleta[] = [
  { id: "ccsm", nombre: "ccsm", acento: "#E3B7E0", segundo: "#C2C7D0", heroe: "#101217" },
  { id: "medianoche", nombre: "Medianoche", acento: "#A9C1F2", segundo: "#C9CED8", heroe: "#141D36" },
  { id: "lila-menta", nombre: "Lila y menta", acento: "#C9B8F2", segundo: "#B3E2D2", heroe: "#18152B" },
  { id: "durazno", nombre: "Durazno", acento: "#F6C1A6", segundo: "#E2D6C8", heroe: "#211915" },
  { id: "salvia", nombre: "Salvia", acento: "#B9D6B2", segundo: "#D9D5C7", heroe: "#132019" },
  { id: "coral", nombre: "Coral", acento: "#F4A79D", segundo: "#F1DCA7", heroe: "#241618" },
  { id: "lima", nombre: "Lima", acento: "#B5EE7A", segundo: "#C2C7D0", heroe: "#121512" },
  { id: "azul", nombre: "Azul marino", acento: "#2357C6" },
  { id: "turquesa", nombre: "Turquesa", acento: "#0E7C86" },
  { id: "esmeralda", nombre: "Esmeralda", acento: "#1F7A4D" },
  { id: "morado", nombre: "Morado", acento: "#6D4AE0" },
  { id: "rosa", nombre: "Frambuesa", acento: "#C0306F" },
  { id: "vino", nombre: "Vino", acento: "#8E2440" },
  { id: "naranja", nombre: "Mandarina", acento: "#C2570C" },
  { id: "grafito", nombre: "Grafito", acento: "#3F4A5A" },
];

export const FUENTES: { id: string; nombre: string; detalle: string; display: string; texto: string; google?: string }[] = [
  { id: "clasica", nombre: "ccsm", detalle: "Outfit, la letra de la marca", display: '"Outfit", system-ui, sans-serif', texto: '"Outfit", system-ui, -apple-system, sans-serif' },
  { id: "sistema", nombre: "Del iPhone", detalle: "San Francisco, la letra de iOS", display: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif', texto: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif' },
  { id: "inter", nombre: "Moderna", detalle: "Inter", display: '"Inter", system-ui, sans-serif', texto: '"Inter", system-ui, sans-serif', google: "Inter:wght@400;500;600;700;800" },
  { id: "dm", nombre: "Geométrica", detalle: "DM Sans", display: '"DM Sans", system-ui, sans-serif', texto: '"DM Sans", system-ui, sans-serif', google: "DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800" },
  { id: "nunito", nombre: "Redondeada", detalle: "Nunito", display: '"Nunito", system-ui, sans-serif', texto: '"Nunito", system-ui, sans-serif', google: "Nunito:wght@400;500;600;700;800" },
  { id: "plex", nombre: "Técnica", detalle: "IBM Plex Sans", display: '"IBM Plex Sans", system-ui, sans-serif', texto: '"IBM Plex Sans", system-ui, sans-serif', google: "IBM+Plex+Sans:wght@400;500;600;700" },
  { id: "editorial", nombre: "Editorial", detalle: "Fraunces para títulos y Source Sans", display: '"Fraunces", Georgia, serif', texto: '"Source Sans 3", system-ui, sans-serif', google: "Fraunces:opsz,wght@9..144,600;9..144,700&family=Source+Sans+3:wght@400;500;600" },
];

export const TAMANOS: { id: Apariencia["tamano"]; nombre: string; px: number }[] = [
  { id: "chico", nombre: "Chica", px: 15 }, { id: "normal", nombre: "Normal", px: 16 },
  { id: "grande", nombre: "Grande", px: 17.5 }, { id: "enorme", nombre: "Muy grande", px: 19 },
];

// ---------- Utilidades de color ----------
const rgb = (h: string) => { const x = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); };
const hex = (c: number[]) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
// Mezcla: t = cuánto de "a" (0 a 1)
const mix = (a: string, b: string, t: number) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v * t + y[i] * (1 - t))); };
const lum = (h: string) => { const c = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export const contraste = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// Ajusta el acento hasta que se lea bien sobre el fondo (botones y enlaces)
function legible(acento: string, fondo: string, hacia: string) {
  let c = acento;
  for (let i = 0; i < 20 && contraste(c, fondo) < 4.5; i++) c = mix(c, hacia, 0.9);
  return c;
}
export const esHex = (v: string | undefined | null): v is string => !!v && /^#[0-9a-fA-F]{6}$/.test(v);

export function colorAcento(a: Apariencia) {
  return esHex(a.acento) ? a.acento : PALETAS.find((p) => p.id === a.paleta)?.acento ?? PALETAS[0].acento;
}

function cssTema(acentoBase: string) {
  const claroFondo = mix(acentoBase, "#F3F4F7", 0.05);
  const acento = legible(acentoBase, "#FFFFFF", "#000000");
  const oscFondo = mix(acentoBase, "#0B0D12", 0.08);
  const acentoOsc = legible(mix(acentoBase, "#FFFFFF", 0.62), oscFondo, "#FFFFFF");
  const vars = (v: Record<string, string>) => Object.entries(v).map(([k, x]) => `  --${k}: ${x};`).join("\n");
  const claro = vars({
    fondo: claroFondo, linea: mix(acentoBase, "#DFE3EA", 0.08),
    ciruela: acento, "ciruela-suave": mix(acentoBase, "#FFFFFF", 0.12),
    // Las demás paletas usan un solo color: botones y opciones elegidas en el acento, como antes de la marca
    "acento-fondo": acento, "sobre-acento": claroFondo, seleccion: acento, "sobre-seleccion": claroFondo,
    secundario: mix(acentoBase, "#FFFFFF", 0.12), "sobre-secundario": acento,
    heroe: mix(acentoBase, "#0B0E14", 0.3), "heroe-2": mix(acentoBase, "#0B0E14", 0.5), "heroe-tinta-2": mix(acentoBase, "#E8ECF3", 0.25),
  });
  const oscuro = vars({
    fondo: oscFondo, superficie: mix(acentoBase, "#151820", 0.08), linea: mix(acentoBase, "#262B36", 0.14),
    ciruela: acentoOsc, "ciruela-suave": mix(acentoBase, oscFondo, 0.25),
    "acento-fondo": acentoOsc, "sobre-acento": oscFondo, seleccion: acentoOsc, "sobre-seleccion": oscFondo,
    secundario: mix(acentoBase, oscFondo, 0.25), "sobre-secundario": acentoOsc,
    heroe: mix(acentoBase, "#0B0E14", 0.35), "heroe-2": mix(acentoBase, "#0B0E14", 0.55), "heroe-tinta-2": mix(acentoBase, "#E8ECF3", 0.25),
  });
  return envolver(claro + `\n  --acento-anillo: ${mix(acentoBase, "#FFFFFF", 0.45)};`, oscuro + `\n  --acento-anillo: ${mix(acentoBase, "#FFFFFF", 0.45)};`, mix(acentoBase, "#0B0E14", 0.3));
}

// "marino" era la paleta inicial antes de la marca ccsm y cada dispositivo la guardaba sola al abrir:
// si no hay color propio, se toma como la inicial de ahora. El azul sigue disponible como "azul".
export function normalizar(a: Apariencia): Apariencia {
  return a.paleta === "marino" && !esHex(a.acento) ? { ...a, paleta: APARIENCIA_INICIAL.paleta } : a;
}

function envolver(claro: string, oscuro: string, barra: string) {
  return { css: `:root {\n${claro}\n}\n@media (prefers-color-scheme: dark) {\n:root:not([data-modo="claro"]) {\n${oscuro}\n}\n}\n:root[data-modo="oscuro"] {\n${oscuro}\n}\n`, barra };
}

// Paleta de dos colores: los dos son claros, así que llevan texto oscuro encima en ambos modos
function cssDuo(p: Paleta) {
  const a = p.acento, b = p.segundo!, h = p.heroe ?? "#101217";
  const vars = (v: Record<string, string>) => Object.entries(v).map(([k, x]) => `  --${k}: ${x};`).join("\n");
  const oscFondo = mix(h, "#0B0C0F", 0.35), oscSuperficie = mix(h, "#16181D", 0.35);
  const comunes = { "acento-fondo": a, seleccion: b, "acento-anillo": a, "heroe-tinta": "#EEF0F4", "heroe-tinta-2": mix(a, "#B4BAC5", 0.25) };
  const claro = vars({ ...comunes,
    fondo: mix(a, "#F4F4F7", 0.05), linea: mix(a, "#E1E3EA", 0.08),
    ciruela: legible(a, "#FFFFFF", "#000000"), "ciruela-suave": mix(a, "#FFFFFF", 0.22),
    "sobre-acento": "#101217", "sobre-seleccion": "#101217", secundario: mix(b, "#FFFFFF", 0.35), "sobre-secundario": "#101217",
    heroe: h, "heroe-2": mix(h, "#FFFFFF", 0.9),
  });
  const oscuro = vars({ ...comunes,
    fondo: oscFondo, superficie: oscSuperficie, linea: mix(h, "#262A33", 0.4),
    ciruela: a, "ciruela-suave": mix(a, oscFondo, 0.16),
    "sobre-acento": oscFondo, "sobre-seleccion": oscFondo, secundario: mix(b, oscSuperficie, 0.12), "sobre-secundario": "#EEF0F4",
    heroe: mix(h, "#FFFFFF", 0.93), "heroe-2": mix(h, "#FFFFFF", 0.86),
  });
  return envolver(claro, oscuro, h);
}

const CLAVE = "ccsm-apariencia";
export function aparienciaGuardada(): Apariencia {
  try { const x = JSON.parse(localStorage.getItem(CLAVE) ?? "null"); if (x && typeof x === "object") return normalizar({ ...APARIENCIA_INICIAL, ...x }); } catch { /* sin almacenamiento */ }
  return APARIENCIA_INICIAL;
}

export function cargarFuente(id: string) {
  const f = FUENTES.find((x) => x.id === id);
  if (!f?.google || document.getElementById(`fuente-${f.id}`)) return;
  const l = document.createElement("link");
  l.id = `fuente-${f.id}`; l.rel = "stylesheet";
  l.href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`;
  document.head.appendChild(l);
}

// Aplica la apariencia a toda la app al instante y la recuerda en este dispositivo
export function aplicarApariencia(elegida: Apariencia) {
  const a = normalizar(elegida);
  const raiz = document.documentElement;
  if (a.modo === "auto") raiz.removeAttribute("data-modo"); else raiz.setAttribute("data-modo", a.modo);
  // Estilo de la tarjeta del resumen, densidad y animaciones: estilos.css los lee de estos atributos
  raiz.dataset.tarjeta = a.tarjeta ?? "oscura";
  raiz.dataset.densidad = a.densidad ?? "comoda";
  raiz.dataset.movimiento = a.movimiento ?? "auto";
  mostrarCentavos(a.centavos !== false);
  let estilo = document.getElementById("tema-usuario") as HTMLStyleElement | null;
  if (!estilo) { estilo = document.createElement("style"); estilo.id = "tema-usuario"; document.head.appendChild(estilo); }
  const esDefault = a.paleta === "ccsm" && !esHex(a.acento);
  const duo = !esHex(a.acento) ? PALETAS.find((p) => p.id === a.paleta && p.segundo) : undefined;
  const t = esDefault ? { css: "", barra: "#101217" } : duo ? cssDuo(duo) : cssTema(colorAcento(a));
  const f = FUENTES.find((x) => x.id === a.fuente) ?? FUENTES[0];
  cargarFuente(f.id);
  estilo.textContent = t.css + `:root { --display: ${f.display}; --texto: ${f.texto}; }\n`;
  raiz.style.fontSize = `${(TAMANOS.find((x) => x.id === a.tamano) ?? TAMANOS[1]).px}px`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.barra);
  try { localStorage.setItem(CLAVE, JSON.stringify(a)); } catch { /* sin almacenamiento */ }
}

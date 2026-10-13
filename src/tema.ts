// Apariencia elegida por el usuario: paleta (color de acento), modo claro/oscuro, tipografía y tamaño de letra.
export type Apariencia = { paleta: string; acento?: string; modo: "auto" | "claro" | "oscuro"; fuente: string; tamano: "chico" | "normal" | "grande" | "enorme" };

export const APARIENCIA_INICIAL: Apariencia = { paleta: "ccsm", modo: "auto", fuente: "clasica", tamano: "normal" };

export const PALETAS: { id: string; nombre: string; acento: string }[] = [
  { id: "ccsm", nombre: "ccsm", acento: "#8F4E8E" },
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
  return { css: `:root {\n${claro}\n}\n@media (prefers-color-scheme: dark) {\n:root:not([data-modo="claro"]) {\n${oscuro}\n}\n}\n:root[data-modo="oscuro"] {\n${oscuro}\n}\n`, barra: mix(acentoBase, "#0B0E14", 0.3) };
}

// "marino" era la paleta inicial antes de la marca ccsm y cada dispositivo la guardaba sola al abrir:
// si no hay color propio, se toma como la inicial de ahora. El azul sigue disponible como "azul".
export function normalizar(a: Apariencia): Apariencia {
  return a.paleta === "marino" && !esHex(a.acento) ? { ...a, paleta: APARIENCIA_INICIAL.paleta } : a;
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
  let estilo = document.getElementById("tema-usuario") as HTMLStyleElement | null;
  if (!estilo) { estilo = document.createElement("style"); estilo.id = "tema-usuario"; document.head.appendChild(estilo); }
  const esDefault = a.paleta === "ccsm" && !esHex(a.acento);
  const t = esDefault ? { css: "", barra: "#101217" } : cssTema(colorAcento(a));
  const f = FUENTES.find((x) => x.id === a.fuente) ?? FUENTES[0];
  cargarFuente(f.id);
  estilo.textContent = t.css + `:root { --display: ${f.display}; --texto: ${f.texto}; }\n`;
  raiz.style.fontSize = `${(TAMANOS.find((x) => x.id === a.tamano) ?? TAMANOS[1]).px}px`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.barra);
  try { localStorage.setItem(CLAVE, JSON.stringify(a)); } catch { /* sin almacenamiento */ }
}

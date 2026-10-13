// Genera src/phosphor.tsx con solo los íconos de Phosphor que usa la app y solo los grosores que necesita.
// El paquete @phosphor-icons/react trae los seis grosores de cada ícono y hacía la app unos 215 KB más pesada.
// Uso: npm run iconos (después de importar un ícono nuevo desde "./phosphor"). Íconos: Phosphor, licencia MIT.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as P from "@phosphor-icons/react/dist/ssr";

// Grosores extra (además de "regular") que pide cada ícono
const EXTRA = { House: ["fill"], UsersThree: ["fill"], DotsThreeOutline: ["fill"], ListBullets: ["bold"], Plus: ["bold"] };

const archivos = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? archivos(p) : /\.tsx?$/.test(f) ? [p] : []; });
const usados = new Set();
for (const f of archivos("src")) {
  if (f.endsWith("phosphor.tsx")) continue;
  for (const m of readFileSync(f, "utf8").matchAll(/import \{([^}]+)\} from "(?:\.\.?\/)+phosphor"/g))
    for (const n of m[1].split(",").map((x) => x.trim()).filter((x) => x && !x.startsWith("type "))) usados.add(n);
}
const trazos = (nombre, weight) => {
  const svg = renderToStaticMarkup(createElement(P[nombre], { weight }));
  const interior = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  const ds = [...interior.matchAll(/<path d="([^"]+)"><\/path>/g)].map((m) => m[1]);
  if (!ds.length || interior.replace(/<path d="[^"]+"><\/path>/g, "").trim()) throw new Error(`${nombre} (${weight}) tiene algo distinto de <path>`);
  return ds;
};
const lineas = [...usados].sort().map((n) => {
  if (!P[n]) throw new Error(`No existe el ícono ${n}`);
  const g = { regular: trazos(n, "regular") };
  for (const w of EXTRA[n] ?? []) g[w] = trazos(n, w);
  return `export const ${n} = crear(${JSON.stringify(g)});`;
});
writeFileSync("src/phosphor.tsx", `// GENERADO por scripts/iconos.mjs: no editar a mano. Íconos de Phosphor (https://phosphoricons.com, licencia MIT).
import type { CSSProperties, JSX } from "react";

type Grosor = "regular" | "bold" | "fill";
export type IconoProps = { size?: number | string; weight?: Grosor; color?: string; className?: string; style?: CSSProperties; "aria-hidden"?: boolean | "true" | "false" };
export type Icon = (p: IconoProps) => JSX.Element;

function crear(grosores: Partial<Record<Grosor, string[]>>): Icon {
  return function Icono({ size = "1em", weight = "regular", color = "currentColor", ...resto }) {
    const d = grosores[weight] ?? grosores.regular!;
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 256 256" fill={color} {...resto}>
        {d.map((x, i) => <path key={i} d={x} />)}
      </svg>
    );
  };
}

${lineas.join("\n")}
`);
console.log(`src/phosphor.tsx: ${usados.size} íconos`);

// Lee el estado de cuenta en PDF de una tarjeta, en el teléfono (el archivo no sale de tu dispositivo).
// Los estados de cuenta de tarjetas en México usan las mismas etiquetas (Banxico/CONDUSEF): "Pago para no generar
// intereses", "Pago mínimo", "Fecha límite de pago", "Fecha de corte". Con eso se sacan las cifras del resumen;
// los movimientos y las compras a meses se buscan por renglón (fecha, texto e importe) y pueden faltar algunos.

export type MovLeido = { fecha: string; descripcion: string; monto: number; abono: boolean };
export type MsiLeida = { descripcion: string; n: number; m: number; mensualidad: number | null };
export type EstadoLeido = {
  fechaCorte: string | null; fechaLimite: string | null;
  pagoNoIntereses: number | null; pagoMinimo: number | null; saldoCorte: number | null;
  movimientos: MovLeido[]; msi: MsiLeida[];
};

const MESES: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
const NOMBRES = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";
const iso = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null);
const anio = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
// Quita acentos para comparar etiquetas sin importar cómo las escribió el banco
const plano = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Fechas: 07/11/2026, 07-11-26, 07-nov-2026, 07 NOV 2026, 7 de noviembre de 2026
const FECHA = new RegExp(`(\\d{1,2})\\s*(?:[/-]|\\s)\\s*(\\d{1,2}|[a-z]{3,4})\\.?\\s*(?:[/-]|\\s)\\s*(\\d{4}|\\d{2})\\b|(\\d{1,2})\\s+de\\s+(${NOMBRES})\\s+(?:de|del)\\s+(\\d{4})`, "i");
export function leerFecha(t: string): string | null {
  const x = plano(t).match(FECHA);
  if (!x) return null;
  if (x[4]) return iso(Number(x[6]), MESES[x[5].slice(0, 3)], Number(x[4]));
  const m = /^\d+$/.test(x[2]) ? Number(x[2]) : MESES[x[2].slice(0, 3)];
  return m ? iso(anio(x[3]), m, Number(x[1])) : null;
}

const IMPORTE = /-?\$?\s*-?\d{1,3}(?:,\d{3})*(?:\.\d{2})|-?\$?\s*-?\d+\.\d{2}/;
export const leerImporte = (t: string): number | null => {
  const x = t.match(IMPORTE);
  return x ? Math.abs(Number(x[0].replace(/[$,\s]/g, ""))) : null;
};

// El primer valor (fecha o importe) que aparece después de una etiqueta, aunque esté en el renglón siguiente
function despues<T>(texto: string, etiquetas: RegExp, leer: (t: string) => T | null): T | null {
  const p = plano(texto);
  for (const x of p.matchAll(new RegExp(etiquetas.source, "gi"))) {
    const v = leer(texto.slice(x.index! + x[0].length, x.index! + x[0].length + 120));
    if (v !== null) return v;
  }
  return null;
}

export function leerEstado(texto: string): EstadoLeido {
  const fechaCorte = despues(texto, /fecha\s+(?:de\s+)?corte|fecha\s+del\s+corte/, leerFecha)
    ?? despues(texto, /periodo[^\n]{0,40}?\bal\b/, leerFecha);
  const fechaLimite = despues(texto, /fecha\s+limite\s+(?:de\s+|para\s+(?:realizar\s+)?(?:el\s+|su\s+)?)?pago|pagar\s+antes\s+del/, leerFecha);
  const pagoNoIntereses = despues(texto, /pago\s+para\s+no\s+generar\s+intereses/, leerImporte);
  const pagoMinimo = despues(texto, /pago\s+minimo(?!\s+mas)/, leerImporte);
  const saldoCorte = despues(texto, /saldo\s+deudor\s+total|saldo\s+(?:total\s+)?al\s+corte|saldo\s+total\s+a\s+pagar|saldo\s+actual/, leerImporte);

  const y = Number((fechaCorte ?? "").slice(0, 4)) || new Date().getFullYear();
  const mesCorte = Number((fechaCorte ?? "").slice(5, 7)) || 12;
  const movimientos: MovLeido[] = [];
  const msi: MsiLeida[] = [];
  for (const linea of texto.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const l = plano(linea);
    // Compras a meses: "… 3 de 12 …" o "… 03/12 …" con importes en el mismo renglón
    const nm = l.match(/\b(\d{1,2})\s*(?:de|\/)\s*(\d{1,2})\b(?!\s*[/-]\s*\d)/);
    const importes = [...linea.matchAll(new RegExp(IMPORTE.source, "g"))].map((x) => Math.abs(Number(x[0].replace(/[$,\s]/g, ""))));
    if (nm && Number(nm[2]) >= 2 && Number(nm[2]) <= 48 && Number(nm[1]) <= Number(nm[2]) && importes.length && !/^\d{1,2}[/-]/.test(l)) {
      const m = Number(nm[2]);
      const original = Math.max(...importes);
      const mensualidad = importes.find((v) => Math.abs(v * m - original) <= m) ?? (importes.length > 1 ? Math.min(...importes) : null);
      const descripcion = linea.slice(0, linea.search(/\d/)).replace(/[$:|]+$/, "").trim();
      if (descripcion) msi.push({ descripcion, n: Number(nm[1]), m, mensualidad });
      continue;
    }
    // Movimientos: renglón que empieza con fecha (con o sin año) y termina con un importe
    // El año va pegado con / o - (07-nov-26) o con espacio solo si es de 4 dígitos, para no confundirlo con una segunda fecha
    const f = l.match(/^(\d{1,2})\s*[/-]?\s*(\d{1,2}|[a-z]{3})\b(?:\s*[/-]\s*(\d{4}|\d{2})\b|\s+(\d{4})\b)?/);
    if (!f || !importes.length) continue;
    const mes = /^\d+$/.test(f[2]) ? Number(f[2]) : MESES[f[2]];
    if (!mes) continue;
    const yy = f[3] || f[4] ? anio(f[3] || f[4]) : mes > mesCorte ? y - 1 : y;
    const fecha = iso(yy, mes, Number(f[1]));
    if (!fecha) continue;
    // Algunos bancos ponen la fecha de cargo además de la de operación
    const resto = linea.slice(f[0].length).replace(/^\s*\d{1,2}\s*[/-]?\s*(?:\d{1,2}|[a-z]{3})\b(?:\s*[/-]\s*\d{2,4}\b|\s+\d{4}\b)?/i, "");
    const descripcion = resto.replace(new RegExp(IMPORTE.source, "g"), "").replace(/[+\-$]\s*$/, "").trim();
    const abono = /(^|\s)(abono|pago|su pago|devolucion|bonificacion)\b|\s-\s*\$?\d|\bcr\b|\+\s*\$?\s*\d[\d,]*\.\d{2}\s*$/.test(plano(resto));
    if (descripcion) movimientos.push({ fecha, descripcion, monto: importes[importes.length - 1], abono });
  }
  return { fechaCorte, fechaLimite, pagoNoIntereses, pagoMinimo, saldoCorte, movimientos, msi };
}

// Texto del PDF por renglones: une los pedazos de cada renglón de izquierda a derecha
export async function textoDePdf(archivo: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const { default: worker } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: await archivo.arrayBuffer() }).promise;
  const renglones: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const contenido = await (await doc.getPage(p)).getTextContent();
    const porY = new Map<number, { x: number; t: string }[]>();
    for (const it of contenido.items as { str: string; transform: number[] }[]) {
      if (!it.str?.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      (porY.get(y) ?? porY.set(y, []).get(y)!).push({ x: it.transform[4], t: it.str });
    }
    for (const y of [...porY.keys()].sort((a, b) => b - a))
      renglones.push(porY.get(y)!.sort((a, b) => a.x - b.x).map((x) => x.t).join(" ").replace(/\s+/g, " "));
  }
  return renglones.join("\n");
}

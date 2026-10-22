// Estado de cuenta de una tarjeta en PDF (jsPDF). Se descarga al pedirlo, así que no pesa en el arranque.
// En el teléfono se abre la hoja de compartir (Guardar en Archivos, WhatsApp…); en la computadora se descarga.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type DatosEstado = {
  tarjeta: string;
  titular: string;
  periodo: { desde: string; hasta: string; abierto: boolean }; // las dos fechas incluidas
  corte: { dia: number | null; pagoDia: number | null };
  resumen: {
    deuda: number; limite: number; msiPorFacturar: number;
    contado: number; mensualidades: number; devoluciones: number; pagos: number;
  };
  // El pago para no generar intereses que corresponde a este periodo, si se conoce
  pago: { monto: number; pagado: number; fecha: string | null; estimado: boolean } | null;
  proximo: { monto: number; fecha: string | null } | null; // periodo abierto: lo que llevas para el siguiente pago
  movimientos: { fecha: string; concepto: string; detalle: string; cargo: number; abono: number }[];
  msi: { descripcion: string; meses: number; facturadas: number; restantes: number; mensualidad: number }[];
  porvenir: { mes: string; monto: number }[];
  aplazados: { fecha: string; descripcion: string; monto: number }[];
};

// Montos reales aunque en la app estén ocultos; el guion normal porque Helvetica no trae el signo menos
const $ = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace("−", "-");
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const corta = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}`;
const mesAnio = (f: string) => `${MESES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}`;

const GRAFITO: [number, number, number] = [16, 18, 23];
const LAVANDA: [number, number, number] = [143, 78, 142]; // el acento de modo claro, legible en papel
const GRIS: [number, number, number] = [110, 116, 128];
const LINEA: [number, number, number] = [226, 228, 233];

export function crearPdf(d: DatosEstado): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const ancho = doc.internal.pageSize.getWidth();
  const M = 40;
  let y = 0;

  // Encabezado
  doc.setFillColor(...GRAFITO); doc.rect(0, 0, ancho, 92, "F");
  doc.setTextColor(238, 240, 244);
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("Estado de cuenta", M, 40);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  doc.text(`${d.tarjeta} · ${d.titular}`, M, 60);
  doc.text(`Del ${corta(d.periodo.desde)} al ${corta(d.periodo.hasta)}${d.periodo.abierto ? " (periodo en curso)" : ""}`, M, 76);
  doc.setFontSize(9); doc.setTextColor(194, 199, 208);
  doc.text("CCSM · Cuentas claras entre dos", ancho - M, 40, { align: "right" });
  doc.text(`Generado el ${corta(new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10))}`, ancho - M, 56, { align: "right" });
  if (d.corte.dia) doc.text(`Corte día ${d.corte.dia} · pago día ${d.corte.pagoDia ?? "—"}`, ancho - M, 72, { align: "right" });
  y = 120;

  const titulo = (t: string) => {
    if (y > doc.internal.pageSize.getHeight() - 90) { doc.addPage(); y = 50; }
    doc.setTextColor(...LAVANDA); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text(t.toUpperCase(), M, y); y += 8;
  };
  const tabla = (head: string[], body: (string | number)[][], opciones: Parameters<typeof autoTable>[1] = {}) => {
    autoTable(doc, {
      startY: y, head: [head], body: body as string[][], margin: { left: M, right: M },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: GRAFITO, lineColor: LINEA, lineWidth: { bottom: 0.5 } as any },
      headStyles: { fillColor: [245, 240, 245], textColor: GRAFITO, fontStyle: "bold" },
      theme: "plain",
      ...opciones,
      // Los encabezados se alinean como su columna (montos a la derecha)
      didParseCell: (c) => {
        const h = (opciones.columnStyles as Record<number, { halign?: string }> | undefined)?.[c.column.index]?.halign;
        if (c.section === "head" && h) c.cell.styles.halign = h as "right" | "center";
        opciones.didParseCell?.(c);
      },
    });
    y = (doc as any).lastAutoTable.finalY + 26;
  };

  // Cifras principales en tres cajas
  const r = d.resumen;
  const cajas: [string, string, string?][] = [
    ["Debes en total (hoy)", $(r.deuda), r.msiPorFacturar > 0 ? `Incluye ${$(r.msiPorFacturar)} a meses por venir` : undefined],
    d.pago
      ? [d.pago.monto - d.pago.pagado > 0.005 ? "Para no generar intereses" : "Pago del corte cubierto", $(Math.max(0, d.pago.monto - d.pago.pagado)),
        d.pago.fecha ? `Paga antes del ${corta(d.pago.fecha)}${d.pago.pagado > 0 ? ` · abonaste ${$(d.pago.pagado)}` : ""}` : undefined]
      : ["Cargos del periodo", $(r.contado + r.mensualidades - r.devoluciones)],
    r.limite > 0 ? ["Disponible", $(r.limite - r.deuda), `Límite ${$(r.limite)}`] : ["Límite", "—"],
  ];
  const ac = (ancho - 2 * M - 20) / 3;
  cajas.forEach(([k, v, s], i) => {
    const x = M + i * (ac + 10);
    doc.setDrawColor(...LINEA); doc.setFillColor(250, 250, 252); doc.roundedRect(x, y, ac, 66, 6, 6, "FD");
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...GRIS); doc.text(k, x + 10, y + 16);
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...GRAFITO); doc.text(v, x + 10, y + 36);
    if (s) { doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRIS); doc.text(doc.splitTextToSize(s, ac - 20), x + 10, y + 50); }
  });
  y += 96;

  titulo("Resumen del periodo");
  const filasResumen: string[][] = [
    ["Compras de contado", $(r.contado)],
    ["Mensualidades de compras a meses", $(r.mensualidades)],
    ...(r.devoluciones > 0 ? [["Devoluciones", `-${$(r.devoluciones)}`]] : []),
    ["Total de cargos", $(r.contado + r.mensualidades - r.devoluciones)],
    ["Pagos y abonos recibidos", `-${$(r.pagos)}`],
  ];
  if (d.proximo) filasResumen.push([`Llevas para el próximo pago${d.proximo.fecha ? ` (antes del ${corta(d.proximo.fecha)})` : ""}`, $(d.proximo.monto)]);
  if (d.pago?.estimado) filasResumen.push(["El pago del corte es un estimado: cuádralo con tu estado de cuenta del banco", ""]);
  tabla(["Concepto", "Monto"], filasResumen, {
    columnStyles: { 1: { halign: "right", cellWidth: 110 } },
    didParseCell: (c) => { if (c.section === "body" && String(c.row.raw && (c.row.raw as string[])[0]).startsWith("Total")) c.cell.styles.fontStyle = "bold"; },
  });

  titulo(`Movimientos (${d.movimientos.length})`);
  if (d.movimientos.length === 0) { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GRIS); y += 10; doc.text("Sin movimientos en este periodo.", M, y); y += 26; }
  else tabla(["Fecha", "Concepto", "Detalle", "Cargo", "Abono"],
    d.movimientos.map((m) => [corta(m.fecha), m.concepto, m.detalle, m.cargo ? $(m.cargo) : "", m.abono ? $(m.abono) : ""]), {
      columnStyles: { 0: { cellWidth: 70 }, 2: { textColor: GRIS }, 3: { halign: "right", cellWidth: 75 }, 4: { halign: "right", cellWidth: 75, textColor: [31, 122, 77] } },
      foot: [["", "Totales", "", $(d.movimientos.reduce((a, m) => a + m.cargo, 0)), $(d.movimientos.reduce((a, m) => a + m.abono, 0))]],
      footStyles: { fontStyle: "bold", halign: "right", textColor: GRAFITO, fillColor: [245, 240, 245] },
    });

  if (d.msi.length) {
    const falta = d.msi.reduce((a, x) => a + x.mensualidad * x.restantes, 0);
    titulo("Compras a meses sin intereses");
    tabla(["Compra", "Mensualidad", "Van", "Faltan", "Te falta pagar"],
      d.msi.map((x) => [x.descripcion, $(x.mensualidad), `${x.facturadas} de ${x.meses}`, String(x.restantes), $(x.mensualidad * x.restantes)]), {
        columnStyles: { 1: { halign: "right" }, 2: { halign: "center" }, 3: { halign: "center" }, 4: { halign: "right" } },
        foot: [["Total", $(d.msi.reduce((a, x) => a + (x.restantes > 0 ? x.mensualidad : 0), 0)), "", "", $(falta)]],
        footStyles: { fontStyle: "bold", textColor: GRAFITO, fillColor: [245, 240, 245] },
        didParseCell: (c) => { if (c.section === "foot" && c.column.index !== 0) c.cell.styles.halign = c.column.index === 1 || c.column.index === 4 ? "right" : "center"; },
      });
  }

  if (d.porvenir.length) {
    titulo("Mensualidades por venir");
    tabla(["Corte", "Mensualidades"], d.porvenir.map((p) => [mesAnio(p.mes), $(p.monto)]), { columnStyles: { 1: { halign: "right", cellWidth: 110 } } });
  }

  if (d.aplazados.length) {
    titulo("Cargos aplazados");
    tabla(["Se cobra", "Compra", "Monto"], d.aplazados.map((a) => [corta(a.fecha), a.descripcion, $(a.monto)]), { columnStyles: { 0: { cellWidth: 80 }, 2: { halign: "right", cellWidth: 90 } } });
  }

  // Pie en cada página
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    const alto = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
    doc.text("Con lo que registraste en CCSM. No sustituye el estado de cuenta oficial de tu banco.", M, alto - 24);
    doc.text(`${i} / ${paginas}`, ancho - M, alto - 24, { align: "right" });
  }
  return doc;
}

export async function descargarEstado(d: DatosEstado) {
  const doc = crearPdf(d);
  const nombre = `Estado de cuenta ${d.tarjeta} ${d.periodo.hasta}.pdf`.replace(/[\\/:*?"<>|]/g, "");
  const archivo = new File([doc.output("blob")], nombre, { type: "application/pdf" });
  // En el teléfono "descargar" un archivo desde la app instalada no funciona bien: mejor la hoja de compartir
  const tactil = matchMedia("(pointer: coarse)").matches;
  if (tactil && navigator.canShare?.({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: nombre }); return; }
    catch (e) { if ((e as Error).name === "AbortError") return; }
  }
  doc.save(nombre);
}

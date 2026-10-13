import { sb } from "../supabase";
import { cargarPreferencias, olvidarPreferencias } from "../preferencias";
import { diasEntre, hoyISO, masDias, mesISO, sumarMes } from "../util";

// Catálogo de secciones de Inicio. "filtrable": responde a los filtros de periodo, cuenta y categoría.
export type IdSeccion =
  | "proximos" | "avisos" | "resumen" | "dinero" | "tarjetas" | "mensualidades" | "ritmo" | "categorias" | "cuentas"
  | "quien" | "comparativo" | "ultimos" | "flujo" | "buscar" | "suscripciones" | "comercios" | "porcuenta";

export const SECCIONES: { id: IdSeccion; nombre: string; detalle: string; filtrable: boolean; inicial: boolean }[] = [
  { id: "proximos", nombre: "Próximos pagos", detalle: "Tarjetas, préstamos y suscripciones de los próximos días", filtrable: false, inicial: true },
  { id: "avisos", nombre: "Avisos", detalle: "Pendientes por revisar y saldo con tu pareja", filtrable: false, inicial: true },
  { id: "resumen", nombre: "Resumen", detalle: "Cuánto llevas gastado, ingresos y ahorro", filtrable: true, inicial: true },
  { id: "dinero", nombre: "Tu dinero este mes", detalle: "Lo que tienes contra lo que debes pagar", filtrable: false, inicial: true },
  { id: "tarjetas", nombre: "Tarjetas", detalle: "Deuda, pago y disponible de cada tarjeta", filtrable: false, inicial: true },
  { id: "mensualidades", nombre: "Mensualidades", detalle: "Compras a meses: este mes y lo que viene", filtrable: false, inicial: true },
  { id: "ritmo", nombre: "Ritmo de gasto", detalle: "Gasto acumulado del mes y proyección", filtrable: true, inicial: true },
  { id: "categorias", nombre: "En qué se va", detalle: "Gasto por categoría y subcategoría", filtrable: true, inicial: true },
  { id: "cuentas", nombre: "Cuentas", detalle: "Saldos de débito, ahorro, inversión y préstamos", filtrable: false, inicial: true },
  { id: "quien", nombre: "Quién te debe", detalle: "Cobros pendientes por persona", filtrable: false, inicial: false },
  { id: "comparativo", nombre: "Comparativo", detalle: "Gasto por categoría contra el periodo anterior", filtrable: true, inicial: false },
  { id: "ultimos", nombre: "Últimos gastos", detalle: "Los gastos más recientes", filtrable: true, inicial: false },
  { id: "flujo", nombre: "Ingresos vs. gastos", detalle: "Los últimos 6 meses y lo que ahorraste", filtrable: true, inicial: false },
  { id: "buscar", nombre: "Buscar por categoría", detalle: "Elige una categoría o subcategoría y ve sus gastos", filtrable: true, inicial: false },
  { id: "suscripciones", nombre: "Suscripciones del mes", detalle: "Qué se cobra este mes y cuándo", filtrable: false, inicial: false },
  { id: "comercios", nombre: "Dónde más gastas", detalle: "Los comercios con más gasto", filtrable: true, inicial: false },
  { id: "porcuenta", nombre: "Gasto por cuenta", detalle: "Cuánto has gastado con cada tarjeta o cuenta", filtrable: true, inicial: false },
];

export type ConfigInicio = { id: IdSeccion; visible: boolean }[];

export const configInicial = (): ConfigInicio => SECCIONES.map((s) => ({ id: s.id, visible: s.inicial }));

// Une lo guardado con el catálogo: secciones nuevas se agregan al final con su valor inicial
export function normalizar(guardado: unknown): ConfigInicio {
  const lista = Array.isArray(guardado) ? (guardado as ConfigInicio).filter((x) => SECCIONES.some((s) => s.id === x?.id)) : [];
  const vistos = new Set(lista.map((x) => x.id));
  return [...lista.map((x) => ({ id: x.id, visible: !!x.visible })), ...SECCIONES.filter((s) => !vistos.has(s.id)).map((s) => ({ id: s.id, visible: s.inicial }))];
}

// Usa las preferencias que ya pidió el arranque (preferencias.ts) en lugar de pedirlas otra vez
export async function cargarConfig(uid: string): Promise<ConfigInicio> {
  const p = await cargarPreferencias(uid);
  return normalizar(p?.inicio?.secciones);
}

export async function guardarConfig(uid: string, secciones: ConfigInicio) {
  const r = await sb.from("preferencias").upsert({ user_id: uid, inicio: { secciones }, updated_at: new Date().toISOString() });
  olvidarPreferencias();
  return r;
}

// ---------- Filtros (se conservan mientras la app está abierta) ----------
export type Periodo = "mes" | "mes_pasado" | "3m" | "6m" | "anio" | "rango";
export type Filtros = { periodo: Periodo; desde: string; hasta: string; cuentas: string[]; categoria: string; sub: string };

let filtrosActuales: Filtros | null = null;
export const filtrosIniciales = (): Filtros => ({ periodo: "mes", desde: mesISO(), hasta: hoyISO(), cuentas: [], categoria: "", sub: "" });
export const leerFiltros = () => filtrosActuales ?? filtrosIniciales();
export const recordarFiltros = (f: Filtros) => { filtrosActuales = f; };

// Rango [desde, hasta) del periodo elegido y del periodo anterior de la misma duración
export function rango(f: Filtros): { desde: string; hasta: string; antDesde: string; antHasta: string; meses: number; unMes: boolean } {
  const mes = mesISO();
  const porMeses = (desde: string, k: number) => ({ desde, hasta: sumarMes(desde, k), antDesde: sumarMes(desde, -k), antHasta: desde, meses: k, unMes: k === 1 });
  switch (f.periodo) {
    case "mes": return porMeses(mes, 1);
    case "mes_pasado": return porMeses(sumarMes(mes, -1), 1);
    case "3m": return porMeses(sumarMes(mes, -2), 3);
    case "6m": return porMeses(sumarMes(mes, -5), 6);
    case "anio": { const d = `${mes.slice(0, 4)}-01-01`; const k = Number(mes.slice(5, 7)); return porMeses(d, k); }
    default: {
      const d = f.desde <= f.hasta ? f.desde : f.hasta, h = masDias(f.desde <= f.hasta ? f.hasta : f.desde, 1);
      const largo = diasEntre(d, h);
      return { desde: d, hasta: h, antDesde: masDias(d, -largo), antHasta: d, meses: Math.max(1, Math.round(largo / 30)), unMes: false };
    }
  }
}

export const NOMBRE_PERIODO: Record<Periodo, string> = {
  mes: "Este mes", mes_pasado: "Mes pasado", "3m": "Últimos 3 meses", "6m": "Últimos 6 meses", anio: "Este año", rango: "Fechas",
};

export type Gasto = {
  movimiento_id: string; fecha: string; monto: number; categoria_id: string | null; categoria: string; icono: string | null;
  sub_id: string | null; sub: string | null; cuenta_id: string | null; cuenta: string; cuenta_tipo: string | null; texto: string;
};

export const pasaFiltro = (g: Gasto, f: Filtros) =>
  (!f.cuentas.length || (g.cuenta_id !== null && f.cuentas.includes(g.cuenta_id)))
  && (!f.categoria || (g.categoria_id ?? "sin") === f.categoria)
  && (!f.sub || (f.sub === "general" ? !g.sub_id : g.sub_id === f.sub));

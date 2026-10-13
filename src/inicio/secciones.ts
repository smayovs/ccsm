import { sb } from "../supabase";
import { cargarPreferencias, olvidarPreferencias } from "../preferencias";
import { diasEntre, hoyISO, masDias, mesISO, sumarMes } from "../util";

// Catálogo de secciones de Inicio, en el orden inicial (el resumen primero). "filtrable": responde a los filtros de periodo, cuenta y categoría.
export type IdSeccion =
  | "proximos" | "avisos" | "resumen" | "dinero" | "tarjetas" | "mensualidades" | "ritmo" | "categorias" | "cuentas"
  | "quien" | "comparativo" | "ultimos" | "flujo" | "buscar" | "suscripciones" | "comercios" | "porcuenta";

export const SECCIONES: { id: IdSeccion; nombre: string; detalle: string; filtrable: boolean; inicial: boolean }[] = [
  { id: "resumen", nombre: "Resumen", detalle: "Cuánto llevas gastado, ingresos y ahorro", filtrable: true, inicial: true },
  { id: "avisos", nombre: "Avisos", detalle: "Pendientes y saldo con tu pareja; con Esta semana activa, van dentro de ella", filtrable: false, inicial: true },
  { id: "proximos", nombre: "Esta semana", detalle: "Próximos pagos y avisos en tarjetas que se deslizan", filtrable: false, inicial: true },
  { id: "dinero", nombre: "Tu dinero este mes", detalle: "Lo que tienes contra lo que debes pagar", filtrable: false, inicial: false },
  { id: "tarjetas", nombre: "Tarjetas", detalle: "Deuda, pago y disponible de cada tarjeta", filtrable: false, inicial: true },
  { id: "mensualidades", nombre: "Mensualidades", detalle: "Compras a meses: este mes y lo que viene", filtrable: false, inicial: false },
  { id: "ritmo", nombre: "Ritmo de gasto", detalle: "Gasto acumulado del mes y proyección", filtrable: true, inicial: false },
  { id: "categorias", nombre: "En qué se va", detalle: "Gasto por categoría y subcategoría", filtrable: true, inicial: true },
  { id: "cuentas", nombre: "Cuentas", detalle: "Saldos de débito, ahorro, inversión y préstamos", filtrable: false, inicial: false },
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

// Lo de Inicio se guarda junto (secciones y meta): cada cambio conserva lo demás que ya estaba guardado
async function guardarInicio(uid: string, cambio: { secciones?: ConfigInicio; meta?: number; metaModo?: ModoMeta; ciclo?: Ciclo }) {
  const actual = (await cargarPreferencias(uid))?.inicio ?? {};
  const r = await sb.from("preferencias").upsert({ user_id: uid, inicio: { ...actual, ...cambio }, updated_at: new Date().toISOString() });
  olvidarPreferencias();
  return r;
}

export const guardarConfig = (uid: string, secciones: ConfigInicio) => guardarInicio(uid, { secciones });

// Meta de gasto mensual: un monto fijo o lo que entró de ingresos en el mes (sueldo, bonos y demás)
export type ModoMeta = "ninguna" | "fija" | "ingresos";
export type Meta = { modo: ModoMeta; monto: number };
export async function cargarMeta(uid: string): Promise<Meta> {
  const inicio = (await cargarPreferencias(uid))?.inicio;
  const m = Number(inicio?.meta);
  const monto = Number.isFinite(m) && m > 0 ? m : 0;
  if (inicio?.metaModo === "ingresos") return { modo: "ingresos", monto };
  return { modo: monto ? "fija" : "ninguna", monto };
}
export const guardarMeta = (uid: string, meta: Meta) =>
  guardarInicio(uid, { metaModo: meta.modo, meta: meta.modo === "fija" ? Math.max(0, meta.monto) : 0 });

// ---------- Filtros (se conservan mientras la app está abierta) ----------
export type Periodo = "mes" | "mes_pasado" | "catorcena" | "catorcena_pasada" | "3m" | "6m" | "anio" | "rango";

// ---------- Periodo de pago ----------
// Mes calendario o catorcena: cada 14 días a partir de un día de pago (por ejemplo, un miércoles sí y uno no)
export type Ciclo = { tipo: "mes" } | { tipo: "catorcena"; ref: string };
export async function cargarCiclo(uid: string): Promise<Ciclo> {
  const c = (await cargarPreferencias(uid))?.inicio?.ciclo as Ciclo | undefined;
  return c?.tipo === "catorcena" && /^\d{4}-\d{2}-\d{2}$/.test(c.ref) ? c : { tipo: "mes" };
}
export async function guardarCiclo(uid: string, ciclo: Ciclo) {
  const r = await guardarInicio(uid, { ciclo });
  filtrosActuales = null; // Inicio vuelve a abrir en el periodo nuevo
  return r;
}
// Inicio de la catorcena que contiene "fecha", contando de 14 en 14 días desde el día de pago "ref"
export const inicioCatorcena = (fecha: string, ref: string) => masDias(ref, 14 * Math.floor(diasEntre(ref, fecha) / 14));
// Día de pago de referencia de la catorcena (null = mes calendario); Inicio lo fija al cargar tus preferencias
let refCatorcena: string | null = null;
export const fijarCatorcena = (ref: string | null) => { refCatorcena = ref; };
export const catorcenaActiva = () => refCatorcena;
export type Filtros = { periodo: Periodo; desde: string; hasta: string; cuentas: string[]; categoria: string; sub: string };

let filtrosActuales: Filtros | null = null;
export const filtrosIniciales = (): Filtros => ({ periodo: refCatorcena ? "catorcena" : "mes", desde: mesISO(), hasta: hoyISO(), cuentas: [], categoria: "", sub: "" });
export const filtrosElegidos = () => filtrosActuales !== null;
export const leerFiltros = () => filtrosActuales ?? filtrosIniciales();
export const recordarFiltros = (f: Filtros) => { filtrosActuales = f; };

// Rango [desde, hasta) del periodo elegido y del periodo anterior de la misma duración
export function rango(f: Filtros): { desde: string; hasta: string; antDesde: string; antHasta: string; meses: number; unMes: boolean } {
  const mes = mesISO();
  const porMeses = (desde: string, k: number) => ({ desde, hasta: sumarMes(desde, k), antDesde: sumarMes(desde, -k), antHasta: desde, meses: k, unMes: k === 1 });
  switch (f.periodo) {
    case "mes": return porMeses(mes, 1);
    case "mes_pasado": return porMeses(sumarMes(mes, -1), 1);
    case "catorcena": case "catorcena_pasada": {
      const d = masDias(inicioCatorcena(hoyISO(), refCatorcena ?? hoyISO()), f.periodo === "catorcena" ? 0 : -14);
      return { desde: d, hasta: masDias(d, 14), antDesde: masDias(d, -14), antHasta: d, meses: 1, unMes: false };
    }
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
  mes: "Este mes", mes_pasado: "Mes pasado", catorcena: "Esta catorcena", catorcena_pasada: "Catorcena pasada", "3m": "Últimos 3 meses", "6m": "Últimos 6 meses", anio: "Este año", rango: "Fechas",
};

export type Gasto = {
  movimiento_id: string; fecha: string; monto: number; categoria_id: string | null; categoria: string; icono: string | null;
  sub_id: string | null; sub: string | null; cuenta_id: string | null; cuenta: string; cuenta_tipo: string | null; texto: string;
};

export const pasaFiltro = (g: Gasto, f: Filtros) =>
  (!f.cuentas.length || (g.cuenta_id !== null && f.cuentas.includes(g.cuenta_id)))
  && (!f.categoria || (g.categoria_id ?? "sin") === f.categoria)
  && (!f.sub || (f.sub === "general" ? !g.sub_id : g.sub_id === f.sub));

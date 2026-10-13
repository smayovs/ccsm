import { Link } from "react-router-dom";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza } from "../ui";
import { CalendarDots, CaretRight, ChartBar, DeviceMobile, DownloadSimple, HandCoins, MagicWand, Palette, Repeat, Tag, Tray, Users, Wallet, type Icon } from "../phosphor";
import { descargar } from "../util";
import { SELECT_MOV, textoCategoria } from "./Movimientos";

type Opcion = { to: string; t: string; d: string; I: Icon; insignia?: number };

// Opciones agrupadas por lo que vas a hacer. Las de seguimiento llevan ícono rosa; los ajustes, gris.
const grupos = (pendientes: number): { t: string; gris?: boolean; items: Opcion[] }[] => [
  { t: "Revisar", items: [
    { to: "/pendientes", t: "Pendientes", d: "Sin clasificar y repartos en disputa", I: Tray, insignia: pendientes },
    { to: "/analisis", t: "Análisis", d: "Tus gastos por mes, categoría y cuenta", I: ChartBar },
  ] },
  { t: "Pagos y cobros", items: [
    { to: "/cobros", t: "Cobros", d: "Lo que te deben familia y amigos", I: HandCoins },
    { to: "/msi", t: "Compras a meses", d: "Mensualidades y lo que falta por facturar", I: CalendarDots },
    { to: "/suscripciones", t: "Suscripciones", d: "Cargos recurrentes y próximos cobros", I: Repeat },
  ] },
  { t: "Organizar", gris: true, items: [
    { to: "/ajustes/cuentas", t: "Cuentas", d: "Saldos, tarjetas y cuenta conjunta", I: Wallet },
    { to: "/ajustes/categorias", t: "Categorías", d: "Subcategorías, iconos y las del hogar", I: Tag },
    { to: "/ajustes/familiares", t: "Personas", d: "A quién le compras o prestas", I: Users },
  ] },
  { t: "Registro automático", gris: true, items: [
    { to: "/ajustes/reglas", t: "Reglas de Apple Pay", d: "Comercio → categoría y reparto", I: MagicWand },
    { to: "/ajustes/llaves", t: "Atajos del iPhone", d: "Llave personal y dirección del atajo", I: DeviceMobile },
  ] },
];

export default function Mas({ pendientes = 0 }: { pendientes?: number }) {
  const { uid, yo, otros } = useApp();
  async function exportar() {
    const { data } = await sb.from("movimientos").select(SELECT_MOV).eq("creado_por", uid).order("fecha");
    const filas = [["Fecha", "Tipo", "Monto", "Cuenta", "Cuenta destino", "Categoría", "Descripción", "MSI", "Familiar", "Parte de tu pareja", "Origen"]];
    for (const m of data ?? []) {
      const parte = (m.repartos ?? []).reduce((s: number, r: any) => s + Number(r.monto), 0);
      filas.push([m.fecha, m.tipo, m.monto, m.cuenta?.nombre ?? "", m.destino?.nombre ?? "", textoCategoria(m), m.descripcion ?? m.comercio ?? "",
        m.meses_msi ?? "", m.familiar?.nombre ?? "", parte || "", m.origen]);
    }
    const csv = filas.map((f) => f.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    descargar(`ccsm-movimientos-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }
  const fila = (o: Opcion, gris?: boolean) => (
    <>
      <span className={"ico" + (gris ? " gris" : "")} aria-hidden="true"><o.I size={20} /></span>
      <div className="cuerpo"><div className="titulo">{o.t}</div><div className="detalle">{o.d}</div></div>
      {!!o.insignia && <span className="insignia" aria-label={`${o.insignia} por revisar`}>{o.insignia}</span>}
      <CaretRight size={16} className="flecha" aria-hidden="true" />
    </>
  );
  return (
    <>
      <Cabeza titulo="Más" />
      <Link className="perfil-tarjeta" to="/ajustes/perfil">
        <span className="avatar" aria-hidden="true">{(yo?.nombre ?? "?").trim().charAt(0).toUpperCase()}</span>
        <div className="cuerpo">
          <div className="nombre">{yo?.nombre}</div>
          <div className="detalle">{otros.length ? `Hogar con ${otros.map((o) => o.nombre).join(" y ")}` : "Invita a tu pareja a tu hogar"} · Perfil y sesión</div>
        </div>
        <CaretRight size={16} className="flecha" aria-hidden="true" />
      </Link>
      {grupos(pendientes).map((g) => (
        <section key={g.t} className="menu-grupo">
          <h2>{g.t}</h2>
          <div className="lista">
            {g.items.map((o) => <Link className="fila" to={o.to} key={o.to}>{fila(o, g.gris)}</Link>)}
          </div>
        </section>
      ))}
      <section className="menu-grupo">
        <h2>App</h2>
        <div className="lista">
          <Link className="fila" to="/ajustes/apariencia">{fila({ to: "", t: "Apariencia", d: "Colores, modo oscuro y tamaño de letra", I: Palette }, true)}</Link>
          <button className="fila" onClick={exportar}>{fila({ to: "", t: "Descargar mis movimientos", d: "Archivo CSV para Excel o Google Sheets", I: DownloadSimple }, true)}</button>
        </div>
      </section>
      <p className="nota texto-centro mt-24">Versión {__VERSION__} UTC</p>
    </>
  );
}

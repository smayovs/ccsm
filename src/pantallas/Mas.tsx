import { Link } from "react-router-dom";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza } from "../ui";
import { descargar } from "../util";
import { SELECT_MOV, textoCategoria } from "./Movimientos";

const grupos: { t: string; items: [string, string, string][] }[] = [
  { t: "Seguimiento", items: [
    ["/pendientes", "Pendientes", "Lo que entró sin clasificar y los repartos en disputa"],
    ["/cobros", "Cobros a familiares", "Lo que te deben tu papá, tu mamá y otros"],
    ["/msi", "Compras a meses", "Mensualidades, lo que falta por facturar y proyección"],
    ["/suscripciones", "Suscripciones", "Cargos recurrentes y próximos cobros"],
  ] },
  { t: "Ajustes", items: [
    ["/ajustes/cuentas", "Cuentas", "Saldos iniciales, tarjetas, visibilidad y cuenta conjunta"],
    ["/ajustes/categorias", "Categorías y presupuesto", "Tus categorías, las del hogar y el monto mensual"],
    ["/ajustes/reglas", "Reglas de Apple Pay", "Comercio → categoría y reparto automático"],
    ["/ajustes/familiares", "Familiares", "Personas a las que les compras"],
    ["/ajustes/llaves", "Atajos del iPhone", "Llave personal y dirección para tus atajos"],
    ["/ajustes/perfil", "Perfil y hogar", "Tu nombre, invitar a tu pareja, cerrar sesión"],
  ] },
];

export default function Mas() {
  const { uid } = useApp();
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
  return (
    <>
      <Cabeza titulo="Más" />
      {grupos.map((g) => (
        <section key={g.t}>
          <h2>{g.t}</h2>
          <div className="lista">
            {g.items.map(([to, t, d]) => (
              <Link className="fila" to={to} key={to}><div className="cuerpo"><div className="titulo">{t}</div><div className="detalle">{d}</div></div><span aria-hidden="true">›</span></Link>
            ))}
          </div>
        </section>
      ))}
      <h2>Respaldo</h2>
      <div className="lista">
        <button className="fila" onClick={exportar}><div className="cuerpo"><div className="titulo">Descargar mis movimientos</div><div className="detalle">Archivo CSV que abre en Excel o Google Sheets</div></div></button>
      </div>
      <p className="nota" style={{ textAlign: "center", marginTop: 24 }}>Versión {__VERSION__} UTC</p>
    </>
  );
}

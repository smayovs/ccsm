import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../contexto";
import { Cabeza } from "../ui";
import { fechaCorta, fmt, mesCorto } from "../util";
import { cargarCobros, type Persona } from "../cobros";

export default function Cobros() {
  const { familiares } = useApp();
  const [datos, setDatos] = useState<Record<string, Persona>>({});
  const [abierto, setAbierto] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => { cargarCobros().then((c) => { setDatos(c.personas); setCargando(false); }); }, []);

  const personas = familiares.map((f) => {
    const p = datos[f.id] ?? { cargos: [], total: 0, porVenir: 0, proxima: 0, pagado: 0 };
    return { ...f, ...p };
  }).filter((p) => p.total > 0.004 || p.porVenir > 0 || p.cargos.length);

  function mensaje(p: (typeof personas)[number]) {
    const lineas = p.cargos.map((c) => `• ${fechaCorta(c.fecha)} ${c.texto}: ${fmt(c.pendiente)}${c.pendiente < c.monto ? ` (de ${fmt(c.monto)})` : ""}`);
    let t = `Hola ${p.nombre}, te paso lo que tengo pendiente:\n\n${lineas.join("\n")}\n\nTotal: ${fmt(p.total)}`;
    if (p.proxima > 0) t += `\n\nPróxima mensualidad a meses: ${fmt(p.proxima)} (quedan ${fmt(p.porVenir)} por venir).`;
    return t;
  }

  return (
    <>
      <Cabeza titulo="Cobros" volver />
      <p className="nota" style={{ marginTop: -8, marginBottom: 14 }}>Lo que te deben las personas a las que les compras o prestas. Cada pago que registres se descuenta de lo más antiguo.</p>
      {cargando ? <div className="vacio">Cargando…</div> : personas.length === 0 ? (
        <div className="lista"><div className="vacio">Nadie te debe nada. Al registrar un gasto, elige “¿Para quién?” para que aparezca aquí.</div></div>
      ) : personas.map((p) => (
        <section key={p.id} style={{ marginBottom: 14 }}>
          <div className="lista">
            <button className="fila" onClick={() => setAbierto(abierto === p.id ? null : p.id)} aria-expanded={abierto === p.id}>
              <div className="cuerpo">
                <div className="titulo">{p.nombre}</div>
                <div className="detalle">
                  {p.cargos.length} {p.cargos.length === 1 ? "cargo pendiente" : "cargos pendientes"}
                  {p.porVenir > 0 ? ` · ${fmt(p.porVenir, false)} a meses por venir` : ""}
                </div>
              </div>
              <div className={"monto " + (p.total > 0.004 ? "negativo" : "positivo")}>{fmt(p.total)}<small>{p.total > 0.004 ? "te debe" : "al corriente"}</small></div>
            </button>
            {abierto === p.id && (
              <>
                {p.cargos.map((c) => (
                  <Link className="fila" key={c.id} to={`/editar/${c.mov}`}>
                    <div className="cuerpo"><div className="titulo">{c.texto}</div>
                      <div className="detalle">{c.id.split("|").length === 3 ? mesCorto(c.fecha) : fechaCorta(c.fecha)}{c.pendiente < c.monto ? ` · abonado ${fmt(c.monto - c.pendiente)}` : ""}</div></div>
                    <div className="monto">{fmt(c.pendiente)}</div>
                  </Link>
                ))}
                {p.pagado > 0 && <div className="fila"><div className="cuerpo"><div className="detalle">Te ha pagado {fmt(p.pagado)} en total</div></div></div>}
                <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
                  {p.total > 0.004 && <a className="boton chico" href={`https://wa.me/?text=${encodeURIComponent(mensaje(p))}`} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>}
                  <Link className="boton chico claro" to={`/nuevo?tipo=reembolso&familiar=${p.id}`}>Registrar pago</Link>
                  <Link className="boton chico claro" to="/ajustes/familiares">Cambiar nombre</Link>
                </div>
              </>
            )}
          </div>
        </section>
      ))}
      <p className="nota">Las compras a meses se cobran por mensualidad, conforme te las factura el banco, salvo que en la compra elijas cobrarla completa. Para agregar o quitar personas: Más › Personas.</p>
    </>
  );
}

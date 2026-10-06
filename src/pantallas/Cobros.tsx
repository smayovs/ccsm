import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza } from "../ui";
import { fechaCorta, fmt, mesCorto, sumarMes } from "../util";

type Cargo = { id: string; mov: string; fecha: string; texto: string; monto: number; pendiente: number };

// Arma la lista de cargos de una persona (compras + mensualidades MSI ya facturadas)
// y aplica sus pagos a lo más antiguo primero. Devuelve lo que sigue pendiente.
function pendientes(compras: any[], msi: any[], pagado: number): { cargos: Cargo[]; aplicado: number } {
  const cargos: Cargo[] = [];
  for (const c of compras) cargos.push({ id: c.id, mov: c.id, fecha: c.fecha, texto: c.descripcion || c.comercio || "Compra", monto: Number(c.monto), pendiente: Number(c.monto) });
  for (const x of msi) {
    for (let k = 1; k <= x.facturadas; k++) {
      cargos.push({ id: `${x.movimiento_id}-${k}`, mov: x.movimiento_id, fecha: sumarMes(x.primer_mes, k - 1),
        texto: `${x.descripcion || "Compra"} (MSI ${k} de ${x.meses})`, monto: Number(x.mensualidad), pendiente: Number(x.mensualidad) });
    }
  }
  cargos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  let resto = pagado;
  for (const c of cargos) {
    const usa = Math.min(resto, c.pendiente);
    c.pendiente = Math.round((c.pendiente - usa) * 100) / 100; resto -= usa;
  }
  return { cargos: cargos.filter((c) => c.pendiente > 0.004), aplicado: pagado - resto };
}

export default function Cobros() {
  const { familiares } = useApp();
  const [compras, setCompras] = useState<any[]>([]);
  const [msi, setMsi] = useState<any[]>([]);
  const [pagos, setPagos] = useState<Record<string, number>>({});
  const [abierto, setAbierto] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    Promise.all([
      sb.from("movimientos").select("id, fecha, descripcion, comercio, monto, familiar_id").eq("tipo", "gasto").is("meses_msi", null).not("familiar_id", "is", null),
      sb.from("movimientos").select("id, familiar_id").eq("tipo", "gasto").not("meses_msi", "is", null).not("familiar_id", "is", null),
      sb.rpc("msi_detalle"),
      sb.from("movimientos").select("monto, familiar_id").eq("tipo", "reembolso"),
    ]).then(([c, mm, d, r]) => {
      setCompras(c.data ?? []);
      const dueno = Object.fromEntries((mm.data ?? []).map((x: any) => [x.id, x.familiar_id]));
      setMsi((d.data ?? []).filter((x: any) => dueno[x.movimiento_id]).map((x: any) => ({ ...x, familiar_id: dueno[x.movimiento_id] })));
      const p: Record<string, number> = {};
      for (const x of r.data ?? []) p[x.familiar_id] = (p[x.familiar_id] ?? 0) + Number(x.monto);
      setPagos(p); setCargando(false);
    });
  }, []);

  const personas = familiares.map((f) => {
    const suyasMsi = msi.filter((x) => x.familiar_id === f.id);
    const { cargos } = pendientes(compras.filter((c) => c.familiar_id === f.id), suyasMsi, pagos[f.id] ?? 0);
    const total = cargos.reduce((s, c) => s + c.pendiente, 0);
    const porVenir = suyasMsi.reduce((s, x) => s + Number(x.por_facturar), 0);
    const proxima = suyasMsi.filter((x) => x.restantes > 0).reduce((s, x) => s + Number(x.mensualidad), 0);
    return { ...f, cargos, total, porVenir, proxima, pagado: pagos[f.id] ?? 0 };
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
                      <div className="detalle">{c.id.includes("-") && c.id.length > 36 ? mesCorto(c.fecha) : fechaCorta(c.fecha)}{c.pendiente < c.monto ? ` · abonado ${fmt(c.monto - c.pendiente)}` : ""}</div></div>
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
      <p className="nota">Las compras a meses cuentan por mensualidad, conforme te las factura el banco. Para agregar o quitar personas: Más › Personas.</p>
    </>
  );
}

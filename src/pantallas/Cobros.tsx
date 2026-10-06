import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { sb } from "../supabase";
import { Cabeza, SelectorMes } from "../ui";
import { fechaCorta, fmt, mesISO, nombreMes, sumarMes } from "../util";

export default function Cobros() {
  const [mes, setMes] = useState(mesISO());
  const [resumen, setResumen] = useState<any[]>([]);
  const [compras, setCompras] = useState<any[]>([]);
  const [msi, setMsi] = useState<any[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      sb.rpc("cobros_familiares", { p_mes: mes }),
      sb.from("movimientos").select("id, fecha, descripcion, comercio, monto, familiar_id, cuenta:cuentas!movimientos_cuenta_id_fkey(nombre)")
        .eq("tipo", "gasto").is("meses_msi", null).not("familiar_id", "is", null).gte("fecha", mes).lt("fecha", sumarMes(mes, 1)).order("fecha"),
      sb.from("movimientos").select("id, fecha, descripcion, comercio, monto, meses_msi, familiar_id").eq("tipo", "gasto").not("meses_msi", "is", null).not("familiar_id", "is", null),
      sb.rpc("msi_detalle"),
    ]).then(([r, c, m, d]) => {
      setResumen(r.data ?? []); setCompras(c.data ?? []);
      const det = Object.fromEntries((d.data ?? []).map((x: any) => [x.movimiento_id, x]));
      setMsi((m.data ?? []).map((x: any) => ({ ...x, d: det[x.id] })).filter((x: any) => x.d && x.d.primer_mes <= mes && x.d.ultimo_mes >= mes));
    });
  }, [mes]);

  function mensaje(f: any) {
    const lineas = [
      ...compras.filter((c) => c.familiar_id === f.familiar_id).map((c) => `• ${fechaCorta(c.fecha)} ${c.descripcion || c.comercio || "Compra"}: ${fmt(c.monto)}`),
      ...msi.filter((x) => x.familiar_id === f.familiar_id).map((x) => {
        const n = (Number(mes.slice(0, 4)) - Number(x.d.primer_mes.slice(0, 4))) * 12 + Number(mes.slice(5, 7)) - Number(x.d.primer_mes.slice(5, 7)) + 1;
        return `• ${x.descripcion || x.comercio || "Compra"} (MSI ${n} de ${x.meses_msi}): ${fmt(x.d.mensualidad)}`;
      }),
    ];
    return `Hola ${f.nombre}, te paso lo de ${nombreMes(mes).split(" ")[0]}:\n\n${lineas.join("\n")}\n\nTotal: ${fmt(f.total_mes)}`;
  }

  const conAlgo = resumen.filter((f) => Number(f.total_mes) > 0 || Number(f.saldo_pendiente) > 0.5 || Number(f.msi_por_facturar) > 0);
  return (
    <>
      <Cabeza titulo="Cobros a familiares" volver />
      <SelectorMes mes={mes} onCambio={setMes} />
      {conAlgo.length === 0 && <div className="lista"><div className="vacio">Nadie te debe nada este mes. Al registrar un gasto, elige “¿Para quién?” para que aparezca aquí.</div></div>}
      {conAlgo.map((f) => (
        <section key={f.familiar_id} style={{ marginBottom: 14 }}>
          <div className="lista">
            <button className="fila" onClick={() => setAbierto(abierto === f.familiar_id ? null : f.familiar_id)} aria-expanded={abierto === f.familiar_id}>
              <div className="cuerpo">
                <div className="titulo">{f.nombre}</div>
                <div className="detalle">Este mes {fmt(f.total_mes)} · pagó {fmt(f.reembolsos_mes)}{Number(f.msi_por_facturar) > 0 ? ` · ${fmt(f.msi_por_facturar, false)} MSI por venir` : ""}</div>
              </div>
              <div className={"monto " + (Number(f.saldo_pendiente) > 0.5 ? "negativo" : "positivo")}>{fmt(f.saldo_pendiente)}<small>pendiente</small></div>
            </button>
            {abierto === f.familiar_id && (
              <>
                {compras.filter((c) => c.familiar_id === f.familiar_id).map((c) => (
                  <Link className="fila" key={c.id} to={`/editar/${c.id}`}><div className="cuerpo"><div className="titulo">{c.descripcion || c.comercio || "Compra"}</div>
                    <div className="detalle">{fechaCorta(c.fecha)} · {c.cuenta?.nombre}</div></div><div className="monto">{fmt(c.monto)}</div></Link>
                ))}
                {msi.filter((x) => x.familiar_id === f.familiar_id).map((x) => (
                  <Link className="fila" key={x.id} to={`/editar/${x.id}`}><div className="cuerpo"><div className="titulo">{x.descripcion || x.comercio || "Compra"}</div>
                    <div className="detalle"><span className="etiq">{x.meses_msi} MSI</span>mensualidad de {fmt(x.monto)}</div></div><div className="monto">{fmt(x.d.mensualidad)}</div></Link>
                ))}
                <div className="fila" style={{ gap: 8 }}>
                  <a className="boton chico" href={`https://wa.me/?text=${encodeURIComponent(mensaje(f))}`} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
                  <Link className="boton chico claro" to={`/nuevo?tipo=reembolso&familiar=${f.familiar_id}`}>Registrar pago</Link>
                </div>
              </>
            )}
          </div>
        </section>
      ))}
      <p className="nota">El saldo pendiente suma todas las compras y las mensualidades ya facturadas, menos lo que te han pagado.</p>
    </>
  );
}

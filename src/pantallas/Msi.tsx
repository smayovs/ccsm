import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { sb } from "../supabase";
import { Cabeza } from "../ui";
import { fmt, mesCorto, mesISO, sumarMes } from "../util";

export default function Msi() {
  const [lista, setLista] = useState<any[]>([]);
  const [verLiquidadas, setVerLiquidadas] = useState(false);
  useEffect(() => { sb.rpc("msi_detalle").then(({ data }) => setLista(data ?? [])); }, []);

  const mes = mesISO();
  const activas = lista.filter((x) => x.estado === "Activa");
  const porFacturar = activas.reduce((s, x) => s + Number(x.por_facturar), 0);
  const meses = Array.from({ length: 12 }, (_, i) => sumarMes(mes, i));
  const proy = meses.map((m) => ({
    m, total: activas.filter((x) => x.primer_mes <= m && x.ultimo_mes >= m).reduce((s, x) => s + Number(x.mensualidad), 0),
  }));
  const max = Math.max(1, ...proy.map((p) => p.total));
  const visibles = verLiquidadas ? lista : activas;

  return (
    <>
      <Cabeza titulo="Compras a meses" volver />
      <div className="trio" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div><div className="k">Mensualidades de este mes</div><div className="v">{fmt(proy[0]?.total)}</div></div>
        <div><div className="k">Falta por facturar</div><div className="v">{fmt(porFacturar)}</div></div>
      </div>

      <h2>Lo que viene, mes a mes</h2>
      <div className="lista" style={{ padding: "8px 14px" }}>
        {proy.map((p) => (
          <div key={p.m} style={{ display: "grid", gridTemplateColumns: "64px 1fr 92px", alignItems: "center", gap: 10, padding: "5px 0" }}>
            <span className="sub" style={{ textTransform: "capitalize" }}>{mesCorto(p.m)}</span>
            <div className="barra" style={{ marginTop: 0, height: 10 }}><span style={{ width: `${(p.total / max) * 100}%` }} /></div>
            <span className="num" style={{ textAlign: "right", fontWeight: 600 }}>{fmt(p.total, false)}</span>
          </div>
        ))}
      </div>
      <p className="nota">Cada mensualidad cuenta en el mes de corte de tu tarjeta; por eso importa el día de corte en Cuentas.</p>

      <h2>Compras</h2>
      <div className="lista">
        {visibles.length === 0 && <div className="vacio">Sin compras a meses. Al registrar un gasto elige “Meses sin intereses”.</div>}
        {visibles.map((x) => (
          <Link className="fila" key={x.movimiento_id} to={`/editar/${x.movimiento_id}`}>
            <div className="cuerpo">
              <div className="titulo">{x.descripcion || "Compra"}</div>
              <div className="detalle">
                {x.familiar && <span className="etiq">{x.familiar}</span>}
                {Number(x.parte_otros) > 0 && <span className="etiq verde">Compartida</span>}
                {x.cuenta} · {x.facturadas} de {x.meses} facturadas · termina {mesCorto(x.ultimo_mes)}
              </div>
              <div className="barra"><span style={{ width: `${(x.facturadas / x.meses) * 100}%` }} /></div>
            </div>
            <div className="monto">{fmt(x.mensualidad)}<small>{x.estado === "Activa" ? `faltan ${fmt(x.por_facturar, false)}` : "liquidada"}</small></div>
          </Link>
        ))}
      </div>
      {lista.length > activas.length && (
        <div className="acciones"><button className="boton claro" onClick={() => setVerLiquidadas(!verLiquidadas)}>{verLiquidadas ? "Ocultar liquidadas" : "Ver también las liquidadas"}</button></div>
      )}
    </>
  );
}

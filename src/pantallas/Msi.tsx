import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cabeza } from "../ui";
import { useApp } from "../contexto";
import { fmt, mesCorto, mesISO } from "../util";
import { cargarMsi, CompraMsi, personasMsi, proyeccionMsi } from "../msi";

export default function Msi() {
  const [lista, setLista] = useState<CompraMsi[]>([]);
  const [verLiquidadas, setVerLiquidadas] = useState(false);
  const [listo, setListo] = useState(false);
  const { cuentas } = useApp();
  const tarjetas = cuentas.filter((c) => c.tipo === "credito" && c.activa);
  useEffect(() => { cargarMsi().then((l) => { setLista(l); setListo(true); }); }, []);

  const mes = mesISO();
  const activas = lista.filter((x) => x.estado === "Activa");
  const debes = activas.reduce((s, x) => s + x.por_facturar, 0);
  const teDeben = activas.reduce((s, x) => s + x.por_facturar * x.fraccionOtros, 0);
  const proy = proyeccionMsi(lista, mes, 24).filter((p, i) => i < 12 || p.total > 0.004);
  const max = Math.max(1, ...proy.map((p) => p.total));
  const personas = personasMsi(lista, mes);
  const visibles = verLiquidadas ? lista : activas;

  return (
    <>
      <Cabeza titulo="Mensualidades" volver />
      <div className="trio">
        <div><div className="k">Debes en total</div><div className="v negativo">{fmt(debes, false)}</div></div>
        <div><div className="k">De eso te deben</div><div className="v positivo">{fmt(teDeben, false)}</div></div>
        <div><div className="k">Te toca a ti</div><div className="v">{fmt(debes - teDeben, false)}</div></div>
      </div>
      <p className="nota" style={{ marginTop: -4 }}>Lo que falta por pagar de todas tus compras a meses. “Te deben” es la parte de compras que hiciste para otras personas o que dividiste con ellas.</p>

      {personas.length > 0 && (
        <>
          <h2>Quién te debe</h2>
          <div className="lista">
            {personas.map((p) => (
              <Link key={p.clave} className="fila" to={p.clave.startsWith("f:") ? "/cobros" : "/hogar"}>
                <div className="cuerpo">
                  <div className="titulo">{p.persona}</div>
                  <div className="detalle">{fmt(p.mensual)} este mes · {p.compras} {p.compras === 1 ? "compra" : "compras"}{p.completo ? " · alguna se cobra completa" : ""}</div>
                </div>
                <div className="monto positivo">{fmt(p.falta)}<small>falta</small></div>
              </Link>
            ))}
          </div>
          <p className="nota">Es su parte de las mensualidades que faltan. Lo que ya te pagaron se ve en Cobros.</p>
        </>
      )}

      <h2>Mes a mes</h2>
      <div className="lista tabla-msi">
        <div className="tm-fila tm-cabeza"><span>Mes</span><span /><span>Pagas</span><span>Te deben</span></div>
        {proy.map((p) => (
          <div key={p.mes} className="tm-fila">
            <span className="sub" style={{ textTransform: "capitalize" }}>{mesCorto(p.mes)}</span>
            <div className="barra doble" aria-hidden="true">
              <span style={{ width: `${((p.total - p.otros) / max) * 100}%` }} />
              <span className="otros" style={{ width: `${(p.otros / max) * 100}%` }} />
            </div>
            <span className="num">{fmt(p.total, false)}</span>
            <span className={"num" + (p.otros > 0.5 ? " positivo" : " tenue")}>{p.otros > 0.5 ? fmt(p.otros, false) : "—"}</span>
          </div>
        ))}
      </div>
      <p className="nota"><i className="punto-serie" /> Tu parte <i className="punto-serie otros" style={{ marginLeft: 10 }} /> Parte de otros. Cada mensualidad cuenta en el mes de corte de su tarjeta.</p>

      <h2>Compras</h2>
      <div className="lista">
        {listo && visibles.length === 0 && <div className="vacio">Sin compras a meses. Al registrar un gasto elige “Meses sin intereses”.</div>}
        {visibles.map((x) => (
          <Link className="fila" key={x.movimiento_id} to={`/editar/${x.movimiento_id}`}>
            <div className="cuerpo">
              <div className="titulo">{x.descripcion || "Compra"}</div>
              <div className="detalle">
                {x.partes.map((p) => <span key={p.clave} className="etiq">{p.persona}{x.fraccionOtros < 0.999 ? ` ${fmt(p.parte, false)}` : ""}</span>)}
                {x.cuenta} · {x.facturadas} de {x.meses} · termina {mesCorto(x.ultimo_mes)}
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
      {tarjetas.length > 0 && (
        <div className="aviso" style={{ display: "block" }}>
          <span><b>¿No te cuadra una tarjeta?</b> Corrige sus compras a meses con <b>Cuadrar con mi estado de cuenta</b>:</span>
          <div className="chips" style={{ marginTop: 8, marginBottom: 0 }}>
            {tarjetas.map((t) => <Link key={t.id} className="boton chico claro" to={`/ajustes/tarjeta/${t.id}/cuadrar`}>{t.nombre}</Link>)}
          </div>
        </div>
      )}
    </>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cabeza, Seccion } from "../ui";
import { CalendarDots, Handshake } from "../phosphor";
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

  const esteMes = proy[0]?.total ?? 0;
  const ultimo = [...proy].reverse().find((p) => p.total > 0.004);
  return (
    <>
      <Cabeza titulo="Mensualidades" volver />
      <section className="tablero" aria-label="Resumen de compras a meses">
        <div className="etiqueta">Debes en compras a meses</div>
        <div className="cifra">{fmt(debes, false)}</div>
        <div className="sub">{teDeben > 0.5 ? <>De eso te deben <b>{fmt(teDeben, false)}</b>; a ti te tocan <b>{fmt(debes - teDeben, false)}</b>.</> : "Todo es tuyo: no hay partes de otras personas."}</div>
        <div className="tablero-trio">
          <div><div className="k">Este mes</div><div className="v">{fmt(esteMes, false)}</div></div>
          <div><div className="k">Compras activas</div><div className="v">{activas.length}</div></div>
          <div><div className="k">Terminas en</div><div className="v capitalizar">{ultimo ? mesCorto(ultimo.mes) : "—"}</div></div>
        </div>
      </section>

      {personas.length > 0 && (
        <Seccion titulo="Quién te debe" contador={personas.length} ayuda="Su parte de las mensualidades que faltan; lo que ya te pagaron se ve en Cobros">
          <div className="lista">
            {personas.map((p) => (
              <Link key={p.clave} className="fila" to={p.clave.startsWith("f:") ? "/cobros" : "/hogar"}>
                <span className="ico cuenta-ahorro" aria-hidden="true"><Handshake size={20} /></span>
                <div className="cuerpo">
                  <div className="titulo">{p.persona}</div>
                  <div className="detalle">{fmt(p.mensual)} este mes · {p.compras} {p.compras === 1 ? "compra" : "compras"}{p.completo ? " · alguna se cobra completa" : ""}</div>
                </div>
                <div className="monto positivo">{fmt(p.falta)}<small>falta</small></div>
              </Link>
            ))}
          </div>
        </Seccion>
      )}

      <Seccion titulo="Mes a mes" ayuda="Cada mensualidad cuenta en el mes de corte de su tarjeta">
        <div className="lista tabla-msi">
          <div className="tm-fila tm-cabeza"><span>Mes</span><span /><span>Pagas</span><span>Te deben</span></div>
          {proy.map((p) => (
            <div key={p.mes} className="tm-fila">
              <span className="sub capitalizar">{mesCorto(p.mes)}</span>
              <div className="barra doble" aria-hidden="true">
                <span style={{ width: `${((p.total - p.otros) / max) * 100}%` }} />
                <span className="otros" style={{ width: `${(p.otros / max) * 100}%` }} />
              </div>
              <span className="num">{fmt(p.total, false)}</span>
              <span className={"num" + (p.otros > 0.5 ? " positivo" : " tenue")}>{p.otros > 0.5 ? fmt(p.otros, false) : "—"}</span>
            </div>
          ))}
        </div>
        <p className="nota"><i className="punto-serie" /> Tu parte <i className="punto-serie otros ml-10" /> Parte de otros</p>
      </Seccion>

      <Seccion titulo="Compras" contador={visibles.length} accion={lista.length > activas.length
        ? <button className="enlace-chico boton-texto" onClick={() => setVerLiquidadas(!verLiquidadas)}>{verLiquidadas ? "Solo activas" : "Ver liquidadas"}</button> : undefined}>
        <div className="lista">
          {listo && visibles.length === 0 && <div className="vacio">Sin compras a meses. Al registrar un gasto, abre «Más opciones» y elige los meses.</div>}
          {visibles.map((x) => (
            <Link className="fila" key={x.movimiento_id} to={`/editar/${x.movimiento_id}`}>
              <span className="ico" aria-hidden="true"><CalendarDots size={20} /></span>
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
      </Seccion>
      {tarjetas.length > 0 && (
        <div className="aviso bloque mt-24">
          <span><b>¿No te cuadra una tarjeta?</b> Corrige sus compras a meses con <b>Cuadrar con mi estado de cuenta</b>:</span>
          <div className="chips mt-8 mb-0">
            {tarjetas.map((t) => <Link key={t.id} className="boton chico claro" to={`/ajustes/tarjeta/${t.id}/cuadrar`}>{t.nombre}</Link>)}
          </div>
        </div>
      )}
    </>
  );
}

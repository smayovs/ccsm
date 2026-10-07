import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza, SelectorMes, Segmentos } from "../ui";
import { fechaLarga, fmt, mesISO, sumarMes, TIPOS_MOV } from "../util";
import { ArrowLeftRight, HandCoins, Handshake } from "lucide-react";
import { IconoCategoria } from "../iconos";

export const SELECT_MOV = `*, cuenta:cuentas!movimientos_cuenta_id_fkey(nombre), destino:cuentas!movimientos_cuenta_destino_id_fkey(nombre),
  categoria:categorias!movimientos_categoria_id_fkey(nombre, icono, padre:padre_id(nombre, icono)), familiar:familiares!movimientos_familiar_id_fkey(nombre),
  repartos(user_id, modo, valor, monto, estado, nota, categoria_id), partes:partes_personas(familiar_id, monto)`;

export type Mov = any;

export function textoCategoria(m: Mov) {
  if (!m.categoria) return "";
  return m.categoria.padre ? `${m.categoria.padre.nombre} › ${m.categoria.nombre}` : m.categoria.nombre;
}

// Cómo afecta este movimiento a la persona que lo ve
export function lineaMov(m: Mov, uid: string, nombres: Record<string, string>) {
  const mio = m.creado_por === uid;
  const miParte = (m.repartos ?? []).find((r: any) => r.user_id === uid);
  const partesOtros = (m.repartos ?? []).reduce((s: number, r: any) => s + Number(r.monto), 0)
    + (m.partes ?? []).reduce((s: number, r: any) => s + Number(r.monto), 0);
  let signo = 0; let monto = Number(m.monto); let nota = "";
  if (m.tipo === "gasto") {
    signo = -1;
    if (!mio && miParte) { monto = Number(miParte.monto); nota = `Tu parte de ${fmt(m.monto)} · pagó ${nombres[m.creado_por] ?? "tu pareja"}`; }
    else if (partesOtros > 0) nota = `Tu parte ${fmt(Number(m.monto) - partesOtros)}`;
  } else if (m.tipo === "ingreso" || m.tipo === "reembolso") signo = 1;
  else if (m.tipo === "liquidacion") signo = m.liq_para === uid ? 1 : -1;
  const titulo = m.descripcion || m.comercio || textoCategoria(m) || TIPOS_MOV[m.tipo];
  const partes: string[] = [];
  if (m.tipo === "transferencia") partes.push(`${m.cuenta?.nombre ?? "?"} → ${m.destino?.nombre ?? "?"}`);
  else if (m.tipo === "liquidacion") partes.push(m.liq_para === uid ? `${nombres[m.liq_de] ?? "Tu pareja"} te pagó` : `Le pagaste a ${nombres[m.liq_para] ?? "tu pareja"}`);
  else {
    const cat = textoCategoria(m); if (cat && cat !== titulo) partes.push(cat);
    if (m.cuenta?.nombre) partes.push(m.cuenta.nombre);
  }
  return { titulo, detalle: partes.join(" · "), signo, monto, nota, mio, miParte };
}

export default function Movimientos() {
  const { uid, otros, yo } = useApp();
  const [mes, setMes] = useState(mesISO());
  const [movs, setMovs] = useState<Mov[]>([]);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState("");
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<"todo" | "gasto" | "ingreso" | "compartido" | "otros">("todo");

  useEffect(() => {
    setCargando(true);
    sb.from("movimientos").select(SELECT_MOV).gte("fecha", mes).lt("fecha", sumarMes(mes, 1))
      .order("fecha", { ascending: false }).order("created_at", { ascending: false })
      .then(({ data, error }) => { setMovs(data ?? []); setFallo(error ? "No se pudieron cargar los movimientos. Revisa tu conexión e intenta de nuevo." : ""); setCargando(false); });
  }, [mes]);

  const nombres = useMemo(() => Object.fromEntries([...otros, ...(yo ? [yo] : [])].map((m) => [m.user_id, m.nombre])), [otros, yo]);

  const filtrados = movs.filter((m) => {
    if (filtro === "gasto" && m.tipo !== "gasto") return false;
    if (filtro === "ingreso" && !["ingreso", "reembolso"].includes(m.tipo)) return false;
    if (filtro === "compartido" && !(m.repartos?.length)) return false;
    if (filtro === "otros" && !["transferencia", "liquidacion"].includes(m.tipo)) return false;
    if (q) {
      const t = `${m.descripcion ?? ""} ${m.comercio ?? ""} ${textoCategoria(m)} ${m.cuenta?.nombre ?? ""} ${m.familiar?.nombre ?? ""}`.toLowerCase();
      if (!t.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const grupos: [string, Mov[]][] = [];
  for (const m of filtrados) {
    const g = grupos.find((x) => x[0] === m.fecha);
    if (g) g[1].push(m); else grupos.push([m.fecha, [m]]);
  }

  return (
    <>
      <Cabeza titulo="Movimientos" />
      <SelectorMes mes={mes} onCambio={setMes} />
      <input className="buscador" type="search" placeholder="Buscar comercio, categoría, cuenta…" value={q} onChange={(e) => setQ(e.target.value)} />
      <Segmentos etiqueta="Filtrar" valor={filtro} onCambio={setFiltro} opciones={[
        { v: "todo", t: "Todo" }, { v: "gasto", t: "Gastos" }, { v: "ingreso", t: "Ingresos" },
        ...(otros.length ? [{ v: "compartido" as const, t: "Compartidos" }] : []), { v: "otros", t: "Transferencias" },
      ]} />
      {cargando ? <div className="vacio">Cargando…</div> : fallo ? <p className="error" role="alert">{fallo}</p> : grupos.length === 0 ? (
        <div className="lista"><div className="vacio">Nada registrado en este mes. <Link to="/nuevo">Agrega un movimiento</Link>.</div></div>
      ) : grupos.map(([fecha, lista]) => (
        <section key={fecha}>
          <div className="fecha-grupo">{fechaLarga(fecha)}</div>
          <div className="lista">
            {lista.map((m) => {
              const l = lineaMov(m, uid, nombres);
              const disputa = (m.repartos ?? []).some((r: any) => r.estado === "disputa");
              return (
                <Link className="fila" key={m.id} to={l.mio || l.miParte ? `/editar/${m.id}` : "#"}>
                  <IconoMov m={m} />
                  <div className="cuerpo">
                    <div className="titulo">{l.titulo}</div>
                    <div className="detalle">
                      {m.revisar && <span className="etiq roja">Por revisar</span>}
                      {disputa && <span className="etiq roja">En disputa</span>}
                      {m.meses_msi && <span className="etiq">{m.meses_msi} MSI</span>}
                      {(m.repartos?.length > 0) && <span className="etiq verde">Compartido</span>}
                      {(m.partes?.length > 0) && <span className="etiq">Dividido</span>}
                      {m.familiar && <span className="etiq">{m.familiar.nombre}</span>}
                      {l.nota || l.detalle}
                    </div>
                  </div>
                  <div className={"monto " + (l.signo > 0 ? "positivo" : "")}>
                    {l.signo > 0 ? "+" : l.signo < 0 ? "−" : ""}{fmt(l.monto)}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

export function IconoMov({ m }: { m: Mov }) {
  if (m.tipo === "transferencia") return <span className="ico" aria-hidden="true"><ArrowLeftRight size={20} /></span>;
  if (m.tipo === "liquidacion") return <span className="ico" aria-hidden="true"><Handshake size={20} /></span>;
  if (m.tipo === "reembolso") return <span className="ico cuenta-ahorro" aria-hidden="true"><HandCoins size={20} /></span>;
  const c = m.categoria;
  if (!c) return <IconoCategoria nombre={m.tipo === "ingreso" ? "Ingreso" : "Otros"} />;
  return <IconoCategoria nombre={c.padre?.nombre ?? c.nombre} icono={c.padre ? c.padre.icono : c.icono} />;
}

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza, Campo, SelectorMes, useUnaVez } from "../ui";
import { errorTexto, fechaCorta, fmt, hoyISO, mesISO, sumarMes, limpiarMonto } from "../util";
import { IconoMov, SELECT_MOV, textoCategoria } from "./Movimientos";
import { DesgloseCategorias } from "../desglose";
import { Check } from "../phosphor";

export function Invitar() {
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const enlace = `${location.origin}${import.meta.env.BASE_URL}`;
  async function crear() {
    const { data, error } = await sb.rpc("crear_invitacion");
    if (error) setError(errorTexto(error)); else setCodigo(data as string);
  }
  const texto = `Te invito a CCSM para llevar nuestras finanzas. Entra a ${enlace}, inicia sesión con tu correo y elige "Tengo un código": ${codigo}`;
  return (
    <>
      {!codigo ? (
        <button className="boton ancho" onClick={crear}>Generar código de invitación</button>
      ) : (
        <>
          <div className="codigo">{codigo}</div>
          <p className="nota">Vale 7 días, sirve una sola vez y anula cualquier código anterior. Tu pareja entra a la app con su correo, elige "Tengo un código" y lo escribe.</p>
          <div className="acciones">
            <a className="boton" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
          </div>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

export default function Hogar() {
  const { uid, yo, otros, cuentas, aviso } = useApp();
  const [mes, setMes] = useState(mesISO());
  const [balance, setBalance] = useState<{ user_id: string; nombre: string; me_debe: number }[]>([]);
  const [compartidos, setCompartidos] = useState<any[]>([]);
  const [porConfirmar, setPorConfirmar] = useState<any[]>([]);
  const [esperando, setEsperando] = useState<any[]>([]);
  const [hogarCats, setHogarCats] = useState<any[]>([]);
  const [reparto, setReparto] = useState<{ user_id: string; nombre: string; color: string | null; es_yo: boolean; parte: number }[]>([]);
  const [saldar, setSaldar] = useState<{ user_id: string; monto: string; cuenta: string; yoPago: boolean } | null>(null);
  const [confirmarCuenta, setConfirmarCuenta] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const mias = cuentas.filter((c) => c.activa);
  const unaVez = useUnaVez();

  const cargar = useCallback(async () => {
    const [b, m, l, h, rp] = await Promise.all([
      sb.rpc("balance_hogar"),
      sb.from("movimientos").select(SELECT_MOV).eq("tipo", "gasto").gte("fecha", mes).lt("fecha", sumarMes(mes, 1)).order("fecha", { ascending: false }),
      sb.from("movimientos").select("*").eq("tipo", "liquidacion").or(`liq_para.eq.${uid},liq_de.eq.${uid}`),
      sb.rpc("resumen_hogar", { p_mes: mes }),
      sb.rpc("reparto_compartido", { p_desde: mes, p_hasta: sumarMes(mes, 1) }),
    ]);
    setReparto(((rp.data ?? []) as any[]).map((x) => ({ ...x, parte: Number(x.parte) })));
    setBalance(b.data ?? []);
    setCompartidos((m.data ?? []).filter((x: any) => x.repartos?.length));
    const liqs = (l.data ?? []).filter((x: any) => x.tipo === "liquidacion");
    setPorConfirmar(liqs.filter((x: any) => (x.liq_para === uid && !x.cuenta_destino_id) || (x.liq_de === uid && !x.cuenta_id)));
    setEsperando(liqs.filter((x: any) => x.liq_de === uid && x.creado_por === uid && !x.cuenta_destino_id));
    setHogarCats(h.data ?? []);
  }, [mes, uid]);

  useEffect(() => { if (otros.length) cargar(); }, [cargar, otros.length]);

  async function registrarSaldo() {
    if (!saldar) return;
    setError("");
    const monto = Number(saldar.monto);
    if (!(monto > 0)) return setError("Escribe el monto.");
    const { error } = await sb.rpc("registrar_liquidacion", {
      p_otro: saldar.user_id, p_monto: monto, p_mi_cuenta: saldar.cuenta || null, p_yo_pago: saldar.yoPago, p_fecha: hoyISO(), p_nota: "Liquidación",
    });
    if (error) return setError(errorTexto(error));
    setSaldar(null); aviso("Pago registrado"); cargar();
  }

  async function confirmar(id: string) {
    const c = confirmarCuenta[id];
    if (!c) return setError("Elige la cuenta.");
    const { error } = await sb.rpc("confirmar_liquidacion", { p_id: id, p_mi_cuenta: c });
    if (error) return setError(errorTexto(error));
    aviso("Cuenta confirmada"); cargar();
  }

  if (!otros.length) {
    return (
      <>
        <Cabeza titulo="Hogar" />
        <p>Invita a tu pareja para compartir gastos. Cada quien ve sus propias cuentas y movimientos; solo lo que marquen como compartido aparece para los dos.</p>
        <Invitar />
        <h2>Mientras tanto</h2>
        <p className="nota">Ya puedes usar las categorías del hogar (las que empiezan con "Hogar:") y crear una cuenta conjunta en <Link to="/ajustes/cuentas">Cuentas</Link>.</p>
      </>
    );
  }

  const nombres: Record<string, string> = Object.fromEntries(otros.map((o) => [o.user_id, o.nombre]));
  const totalHogar = hogarCats.reduce((s, c) => s + Number(c.gastado), 0);
  // Color de cada quien (el de la marca): sin color elegido, tú en gris y tu pareja en rosa
  const colorDe = (id: string, color: string | null | undefined) => color ?? (id === uid ? "gris" : "rosa");
  const inicial = (n?: string) => (n ?? "?").trim().charAt(0).toUpperCase();
  const partes = reparto.map((p) => ({ ...p, color: colorDe(p.user_id, p.color) })).sort((a, b) => Number(a.color !== "rosa") - Number(b.color !== "rosa"));
  const totalCompartido = partes.reduce((a, p) => a + p.parte, 0);
  const catsHogar = hogarCats.map((c) => ({ clave: c.categoria_id, nombre: String(c.nombre).replace(/^Hogar: /, ""), icono: c.icono ?? null, total: Number(c.gastado), subs: [] }))
    .sort((a, b) => b.total - a.total);

  return (
    <>
      <Cabeza titulo="Hogar" />
      {balance.map((b) => {
        const debe = Number(b.me_debe);
        const aMano = Math.abs(debe) < 0.5;
        const abierto = saldar?.user_id === b.user_id;
        const otro = otros.find((o) => o.user_id === b.user_id);
        return (
          <section key={b.user_id} className="tablero" aria-label={`Saldo con ${b.nombre}`}>
            <div className="pareja" aria-hidden="true">
              <span className={"avatar-mini r-" + colorDe(uid, yo?.color)}>{inicial(yo?.nombre)}</span>
              <span className={"pareja-flecha" + (aMano ? " a-mano" : debe > 0 ? " hacia-mi" : "")}>{aMano ? <Check size={16} /> : "→"}</span>
              <span className={"avatar-mini r-" + colorDe(b.user_id, otro?.color)}>{inicial(b.nombre)}</span>
            </div>
            <div className="etiqueta">{aMano ? `Están a mano con ${b.nombre}` : debe > 0 ? `${b.nombre} te debe` : `Le debes a ${b.nombre}`}</div>
            <div className="cifra">{fmt(Math.abs(debe))}</div>
            <div className="sub">Incluye las mensualidades de compras a meses compartidas que ya se facturaron.</div>
            {!aMano && !abierto && (
              <div className="acciones mt-14">
                <button className="boton" onClick={() => setSaldar({ user_id: b.user_id, monto: Math.abs(debe).toFixed(2), cuenta: mias[0]?.id ?? "", yoPago: debe < 0 })}>
                  {debe > 0 ? `${b.nombre} me pagó` : `Le pagué a ${b.nombre}`}
                </button>
              </div>
            )}
            {abierto && saldar && (
              <div className="saldar mt-14">
                <div className="dos">
                  <Campo etiqueta="Monto"><input inputMode="decimal" value={saldar.monto} onChange={(e) => setSaldar({ ...saldar, monto: limpiarMonto(e.target.value) })} /></Campo>
                  <Campo etiqueta={saldar.yoPago ? "Pagué desde" : "Lo recibí en"}>
                    <select value={saldar.cuenta} onChange={(e) => setSaldar({ ...saldar, cuenta: e.target.value })}>
                      {mias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </Campo>
                </div>
                <p className="sub mt-n6">No cuenta como gasto ni como ingreso: solo baja el saldo entre ustedes. {saldar.yoPago ? `Se descuenta cuando ${b.nombre} confirme que lo recibió.` : "Se descuenta de inmediato porque tú lo recibiste."}</p>
                <div className="acciones">
                  <button className="boton claro" onClick={() => setSaldar(null)}>Cancelar</button>
                  <button className="boton" onClick={unaVez(registrarSaldo)}>Registrar pago</button>
                </div>
              </div>
            )}
          </section>
        );
      })}

      {porConfirmar.length > 0 && (
        <section className="seccion">
          <div className="seccion-cabeza"><div><h2>Pagos por confirmar</h2></div></div>
          <div className="lista">
            {porConfirmar.map((l) => {
              const recibo = l.liq_para === uid;
              return (
                <div className="fila envolver" key={l.id}>
                  <div className="cuerpo">
                    <div className="titulo">{recibo ? `${nombres[l.liq_de]} te pagó ${fmt(l.monto)}` : `Le pagaste ${fmt(l.monto)} a ${nombres[l.liq_para]}`}</div>
                    <div className="detalle">{fechaCorta(l.fecha)} · ¿En qué cuenta {recibo ? "entró" : "salió"}?</div>
                  </div>
                  <div className="flex gap-8 ancho-total">
                    <select className="buscador m-0 crece" value={confirmarCuenta[l.id] ?? ""} onChange={(e) => setConfirmarCuenta({ ...confirmarCuenta, [l.id]: e.target.value })}>
                      <option value="">Elige cuenta…</option>
                      {mias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                    <button className="boton chico" onClick={unaVez(() => confirmar(l.id))}>Confirmar</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {esperando.length > 0 && (
        <section className="seccion">
          <div className="seccion-cabeza"><div><h2>Esperando confirmación</h2></div></div>
          <div className="lista">
            {esperando.map((l) => (
              <div className="fila" key={l.id}><div className="cuerpo"><div className="titulo">Le pagaste {fmt(l.monto)} a {nombres[l.liq_para]}</div>
                <div className="detalle">{fechaCorta(l.fecha)} · se descuenta cuando {nombres[l.liq_para]} lo confirme</div></div></div>
            ))}
          </div>
        </section>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      <section className="seccion">
        <div className="seccion-cabeza"><div><h2>Compartidos</h2></div></div>
        <SelectorMes mes={mes} onCambio={setMes} />
        {totalCompartido > 0.5 && (
          <div className="panel mb-10">
            <div className="reparto-claro">
              <div className="reparto-cabeza"><span>Gastos compartidos del mes</span><b>{fmt(totalCompartido, false)}</b></div>
              <div className="reparto-barra" aria-hidden="true">
                {partes.filter((p) => p.parte > 0).map((p) => <span key={p.user_id} className={"r-" + p.color} style={{ flexGrow: p.parte }} />)}
              </div>
              <div className="reparto-leyenda">
                {partes.map((p) => (
                  <span key={p.user_id}><i className={"r-" + p.color} aria-hidden="true" />{p.es_yo ? "Tú" : p.nombre} <b>{fmt(p.parte, false)}</b> · {Math.round((p.parte / totalCompartido) * 100)}%</span>
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="lista">
          {compartidos.length === 0 && <div className="vacio">Sin gastos compartidos este mes.</div>}
          {compartidos.map((m) => {
            const pagueYo = m.creado_por === uid;
            const suParte = (m.repartos ?? []).reduce((s: number, r: any) => s + Number(r.monto), 0);
            const miParte = Number(m.repartos.find((r: any) => r.user_id === uid)?.monto ?? 0);
            const disputa = m.repartos.find((r: any) => r.estado === "disputa");
            return (
              <Link className="fila" key={m.id} to={`/editar/${m.id}`}>
                <IconoMov m={m} />
                <div className="cuerpo">
                  <div className="titulo">{m.descripcion || m.comercio || textoCategoria(m) || "Gasto"}</div>
                  <div className="detalle">
                    {disputa && <span className="etiq roja">En disputa</span>}
                    {m.meses_msi && <span className="etiq">{m.meses_msi} MSI</span>}
                    {fechaCorta(m.fecha)} · {pagueYo ? "pagaste tú" : `pagó ${nombres[m.creado_por]}`}
                  </div>
                </div>
                <div className="monto">{fmt(m.monto)}<small>{pagueYo ? `${nombres[m.repartos[0].user_id]}: ${fmt(suParte)}` : `tu parte: ${fmt(miParte)}`}</small></div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="seccion">
        <div className="seccion-cabeza">
          <div><h2>Gasto del hogar</h2><div className="etiq-periodo">Categorías «Hogar:» de los dos, completas</div></div>
          <span className="enlace-chico num">{fmt(totalHogar, false)}</span>
        </div>
        <div className="panel">
          {catsHogar.length ? <DesgloseCategorias cats={catsHogar} total={totalHogar} /> : <div className="vacio p-8-0">Sin gastos del hogar este mes.</div>}
        </div>
      </section>
      <p className="nota mt-14">Las categorías del hogar se editan en <Link to="/ajustes/categorias">Categorías</Link>. Para una cuenta conjunta, créala en <Link to="/ajustes/cuentas">Cuentas</Link>.</p>
    </>
  );
}

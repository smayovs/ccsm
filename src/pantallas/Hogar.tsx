import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { Cabeza, Campo, SelectorMes, useUnaVez } from "../ui";
import { errorTexto, fechaCorta, fmt, hoyISO, mesISO, sumarMes, limpiarMonto } from "../util";
import { SELECT_MOV, textoCategoria } from "./Movimientos";

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
      {error && <p className="error">{error}</p>}
    </>
  );
}

export default function Hogar() {
  const { uid, otros, cuentas, aviso } = useApp();
  const [mes, setMes] = useState(mesISO());
  const [balance, setBalance] = useState<{ user_id: string; nombre: string; me_debe: number }[]>([]);
  const [compartidos, setCompartidos] = useState<any[]>([]);
  const [porConfirmar, setPorConfirmar] = useState<any[]>([]);
  const [esperando, setEsperando] = useState<any[]>([]);
  const [hogarCats, setHogarCats] = useState<any[]>([]);
  const [saldar, setSaldar] = useState<{ user_id: string; monto: string; cuenta: string; yoPago: boolean } | null>(null);
  const [confirmarCuenta, setConfirmarCuenta] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const mias = cuentas.filter((c) => c.activa);
  const unaVez = useUnaVez();

  const cargar = useCallback(async () => {
    const [b, m, l, h] = await Promise.all([
      sb.rpc("balance_hogar"),
      sb.from("movimientos").select(SELECT_MOV).eq("tipo", "gasto").gte("fecha", mes).lt("fecha", sumarMes(mes, 1)).order("fecha", { ascending: false }),
      sb.from("movimientos").select("*").eq("tipo", "liquidacion").or(`liq_para.eq.${uid},liq_de.eq.${uid}`),
      sb.rpc("resumen_hogar", { p_mes: mes }),
    ]);
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

  return (
    <>
      <Cabeza titulo="Hogar" />
      {balance.map((b) => {
        const debe = Number(b.me_debe);
        const abierto = saldar?.user_id === b.user_id;
        return (
          <section key={b.user_id} className="heroe" style={{ paddingBottom: 8 }}>
            <div className="etiqueta">{Math.abs(debe) < 0.5 ? `Están a mano con ${b.nombre}` : debe > 0 ? `${b.nombre} te debe` : `Le debes a ${b.nombre}`}</div>
            <div className={"cifra " + (debe > 0.5 ? "positivo" : debe < -0.5 ? "negativo" : "")}>{fmt(Math.abs(debe))}</div>
            <div className="sub">Incluye las mensualidades MSI compartidas ya facturadas.</div>
            {Math.abs(debe) >= 0.5 && !abierto && (
              <div className="acciones">
                <button className="boton" onClick={() => setSaldar({ user_id: b.user_id, monto: Math.abs(debe).toFixed(2), cuenta: mias[0]?.id ?? "", yoPago: debe < 0 })}>
                  {debe > 0 ? `${b.nombre} me pagó` : `Le pagué a ${b.nombre}`}
                </button>
              </div>
            )}
            {abierto && saldar && (
              <div style={{ marginTop: 14 }}>
                <div className="dos">
                  <Campo etiqueta="Monto"><input inputMode="decimal" value={saldar.monto} onChange={(e) => setSaldar({ ...saldar, monto: limpiarMonto(e.target.value) })} /></Campo>
                  <Campo etiqueta={saldar.yoPago ? "Pagué desde" : "Lo recibí en"}>
                    <select value={saldar.cuenta} onChange={(e) => setSaldar({ ...saldar, cuenta: e.target.value })}>
                      {mias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </Campo>
                </div>
                <p className="nota" style={{ marginTop: -6 }}>No cuenta como gasto ni como ingreso: solo baja el saldo entre ustedes. {saldar.yoPago ? `Se descuenta cuando ${b.nombre} confirme que lo recibió.` : `Se descuenta de inmediato porque tú lo recibiste.`}</p>
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
        <>
          <h2>Pagos por confirmar</h2>
          <div className="lista">
            {porConfirmar.map((l) => {
              const recibo = l.liq_para === uid;
              return (
                <div className="fila" key={l.id} style={{ flexWrap: "wrap" }}>
                  <div className="cuerpo">
                    <div className="titulo">{recibo ? `${nombres[l.liq_de]} te pagó ${fmt(l.monto)}` : `Le pagaste ${fmt(l.monto)} a ${nombres[l.liq_para]}`}</div>
                    <div className="detalle">{fechaCorta(l.fecha)} · ¿En qué cuenta {recibo ? "entró" : "salió"}?</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, width: "100%" }}>
                    <select className="buscador" style={{ margin: 0, flex: 1 }} value={confirmarCuenta[l.id] ?? ""} onChange={(e) => setConfirmarCuenta({ ...confirmarCuenta, [l.id]: e.target.value })}>
                      <option value="">Elige cuenta…</option>
                      {mias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                    <button className="boton chico" onClick={unaVez(() => confirmar(l.id))}>Confirmar</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {esperando.length > 0 && (
        <>
          <h2>Esperando confirmación</h2>
          <div className="lista">
            {esperando.map((l) => (
              <div className="fila" key={l.id}><div className="cuerpo"><div className="titulo">Le pagaste {fmt(l.monto)} a {nombres[l.liq_para]}</div>
                <div className="detalle">{fechaCorta(l.fecha)} · se descuenta de lo que debes cuando {nombres[l.liq_para]} lo confirme</div></div></div>
            ))}
          </div>
        </>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      <h2>Compartidos del mes</h2>
      <SelectorMes mes={mes} onCambio={setMes} />
      <div className="lista">
        {compartidos.length === 0 && <div className="vacio">Sin gastos compartidos este mes.</div>}
        {compartidos.map((m) => {
          const pagueYo = m.creado_por === uid;
          const parte = (m.repartos ?? []).reduce((s: number, r: any) => s + Number(r.monto), 0);
          const disputa = m.repartos.find((r: any) => r.estado === "disputa");
          return (
            <Link className="fila" key={m.id} to={`/editar/${m.id}`}>
              <div className="cuerpo">
                <div className="titulo">{m.descripcion || m.comercio || textoCategoria(m) || "Gasto"}</div>
                <div className="detalle">
                  {disputa && <span className="etiq roja">En disputa</span>}
                  {m.meses_msi && <span className="etiq">{m.meses_msi} MSI</span>}
                  {fechaCorta(m.fecha)} · {pagueYo ? "pagaste tú" : `pagó ${nombres[m.creado_por]}`} · {pagueYo ? `${nombres[m.repartos[0].user_id]}:` : "tú:"} {fmt(pagueYo ? parte : m.repartos.find((r: any) => r.user_id === uid)?.monto)}
                </div>
              </div>
              <div className="monto">{fmt(m.monto)}</div>
            </Link>
          );
        })}
      </div>

      <h2>Gasto del hogar</h2>
      <p className="nota" style={{ marginTop: -4, marginBottom: 8 }}>Todo lo registrado en categorías "Hogar:" por cualquiera de los dos, completo. Total: {fmt(totalHogar)}.</p>
      <div className="lista">
        {hogarCats.map((c) => {
          const p = Number(c.presupuesto) > 0 ? Number(c.gastado) / Number(c.presupuesto) : 0;
          return (
            <div className="fila" key={c.categoria_id}>
              <div className="cuerpo"><div className="titulo">{c.nombre.replace(/^Hogar: /, "")}</div>
                {Number(c.presupuesto) > 0 && <div className="barra"><span className={p > 1 ? "alerta" : ""} style={{ width: `${Math.min(100, p * 100)}%` }} /></div>}</div>
              <div className="monto">{fmt(c.gastado, false)}{Number(c.presupuesto) > 0 && <small>de {fmt(c.presupuesto, false)}</small>}</div>
            </div>
          );
        })}
      </div>
      <p className="nota">El presupuesto del hogar se edita en <Link to="/ajustes/categorias">Categorías</Link>, pestaña Hogar. Para una cuenta conjunta, créala en <Link to="/ajustes/cuentas">Cuentas</Link>.</p>
    </>
  );
}

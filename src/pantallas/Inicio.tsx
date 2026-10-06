import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { diasEntre, fmt, hoyISO, mesISO, nombreMes, proximoCobro, TIPOS_CUENTA } from "../util";

type Saldo = { id: string; nombre: string; tipo: string; mia: boolean; conjunta: boolean; propietario_nombre: string | null;
  saldo: number; limite_credito: number | null; proximo_pago: string | null; msi_por_facturar: number; activa: boolean };
type Resumen = { ingresos: number; gastos: number; ahorro: number; presupuesto: number; por_revisar: number; dias_restantes: number | null };
type CatRes = { categoria_id: string | null; nombre: string; presupuesto: number; gastado: number };

export default function Inicio() {
  const { yo, otros, cuentas } = useApp();
  const [saldos, setSaldos] = useState<Saldo[]>([]);
  const [res, setRes] = useState<Resumen | null>(null);
  const [cats, setCats] = useState<CatRes[]>([]);
  const [balance, setBalance] = useState<{ nombre: string; me_debe: number }[]>([]);
  const [proximos, setProximos] = useState<{ t: string; f: string; m: number }[]>([]);
  const mes = mesISO();

  useEffect(() => {
    Promise.all([
      sb.rpc("saldos_cuentas"), sb.rpc("resumen_mes", { p_mes: mes }), sb.rpc("resumen_categorias", { p_mes: mes }),
      sb.rpc("balance_hogar"), sb.from("suscripciones").select("servicio, monto, frecuencia_meses, fecha_referencia").eq("activa", true),
    ]).then(([s, r, c, b, su]) => {
      setSaldos((s.data ?? []) as Saldo[]);
      setRes(((r.data ?? [])[0] ?? null) as Resumen | null);
      setCats((c.data ?? []) as CatRes[]);
      setBalance((b.data ?? []) as { nombre: string; me_debe: number }[]);
      const hoy = hoyISO();
      const lista: { t: string; f: string; m: number }[] = [];
      for (const x of (su.data ?? []) as any[]) {
        const f = proximoCobro(x.fecha_referencia, x.frecuencia_meses);
        if (f && diasEntre(hoy, f) <= 7) lista.push({ t: x.servicio, f, m: x.monto });
      }
      for (const x of (s.data ?? []) as Saldo[]) {
        if (x.mia && x.tipo === "credito" && x.proximo_pago && diasEntre(hoy, x.proximo_pago) <= 7 && x.saldo < 0)
          lista.push({ t: `Pago ${x.nombre}`, f: x.proximo_pago, m: -x.saldo });
      }
      setProximos(lista.sort((a, b) => a.f.localeCompare(b.f)));
    });
  }, [mes]);

  const presupuesto = res?.presupuesto ?? 0;
  const gastado = res?.gastos ?? 0;
  const dias = res?.dias_restantes ?? 1;
  const totalDias = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
  const avanceMes = Math.min(1, (totalDias - dias + 1) / totalDias);
  const usado = presupuesto > 0 ? gastado / presupuesto : 0;
  const puedes = presupuesto > 0 ? Math.max(0, presupuesto - gastado) / Math.max(1, dias) : null;
  const visibles = saldos.filter((s) => s.activa);

  return (
    <>
      <header className="cabeza">
        <div>
          <div className="sub">Hola, {yo?.nombre}</div>
          <h1>{(() => { const t = nombreMes(mes).replace(" de ", " "); return t[0].toUpperCase() + t.slice(1); })()}</h1>
        </div>
      </header>

      {cuentas.length === 0 && (
        <Link className="aviso" to="/ajustes/cuentas"><span><strong>Empieza agregando tus cuentas</strong> con su saldo de hoy: débito, tarjetas y ahorro.</span></Link>
      )}

      <section className="heroe" aria-label="Lo que puedes gastar">
        {puedes !== null ? (
          <>
            <div className="etiqueta">Puedes gastar hoy</div>
            <div className={"cifra" + (presupuesto - gastado < 0 ? " alerta" : "")}>{fmt(puedes, false)}</div>
            <div className="sub">
              {presupuesto - gastado >= 0
                ? `Te quedan ${fmt(presupuesto - gastado, false)} de ${fmt(presupuesto, false)} para ${dias} ${dias === 1 ? "día" : "días"}.`
                : `Te pasaste ${fmt(gastado - presupuesto, false)} del presupuesto del mes.`}
            </div>
            <div className="franja" aria-hidden="true">
              <div className="riel">
                <div className={"lleno" + (usado > avanceMes ? " alerta" : "")} style={{ width: `${Math.min(100, usado * 100)}%` }} />
                <div className="marca" style={{ left: `${avanceMes * 100}%` }} />
              </div>
              <div className="leyenda"><span>Gastado {Math.round(usado * 100)}%</span><span>Mes transcurrido {Math.round(avanceMes * 100)}%</span></div>
            </div>
          </>
        ) : (
          <Link className="aviso" to="/ajustes/categorias"><span><strong>Define tu presupuesto mensual</strong> para saber cuánto puedes gastar cada día.</span></Link>
        )}
      </section>

      <div className="trio">
        <div><div className="k">Ingresos</div><div className="v positivo">{fmt(res?.ingresos, false)}</div></div>
        <div><div className="k">Gastos</div><div className="v">{fmt(gastado, false)}</div></div>
        <div><div className="k">Ahorro</div><div className={"v " + ((res?.ahorro ?? 0) < 0 ? "negativo" : "")}>{fmt(res?.ahorro, false)}</div></div>
      </div>

      {(res?.por_revisar ?? 0) > 0 && (
        <Link className="aviso rojo" to="/pendientes"><span><strong>{res!.por_revisar} por revisar:</strong> movimientos sin clasificar o partes compartidas sin categoría.</span></Link>
      )}

      {otros.length > 0 && balance.map((b) => Math.abs(b.me_debe) >= 0.5 && (
        <Link key={b.nombre} className={"aviso " + (b.me_debe > 0 ? "verde" : "")} to="/hogar">
          <span>{b.me_debe > 0 ? <><strong>{b.nombre} te debe {fmt(b.me_debe)}</strong> de gastos compartidos.</> : <><strong>Le debes {fmt(-b.me_debe)} a {b.nombre}</strong> de gastos compartidos.</>}</span>
        </Link>
      ))}

      <h2>Cuentas</h2>
      <div className="lista">
        {visibles.length === 0 && <div className="vacio">Sin cuentas todavía.</div>}
        {visibles.map((s) => {
          const disponible = s.tipo === "credito" && s.limite_credito ? s.limite_credito + s.saldo : null;
          const dueno = s.conjunta ? "Conjunta" : s.mia ? TIPOS_CUENTA[s.tipo] : `De ${s.propietario_nombre}`;
          return (
            <div className="fila" key={s.id}>
              <div className="cuerpo">
                <div className="titulo">{s.nombre}</div>
                <div className="detalle">
                  {dueno}
                  {disponible !== null && ` · disponible ${fmt(disponible, false)}`}
                  {s.mia && s.tipo === "credito" && s.proximo_pago && ` · paga antes del ${new Date(s.proximo_pago + "T12:00:00Z").toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" })}`}
                </div>
              </div>
              <div className={"monto " + (s.saldo < 0 ? "negativo" : "")}>
                {fmt(s.saldo)}
                {s.msi_por_facturar > 0 && <small>incluye {fmt(s.msi_por_facturar, false)} de MSI</small>}
              </div>
            </div>
          );
        })}
      </div>

      {proximos.length > 0 && (
        <>
          <h2>Próximos 7 días</h2>
          <div className="lista">
            {proximos.map((p, i) => (
              <div className="fila" key={i}>
                <div className="cuerpo"><div className="titulo">{p.t}</div>
                  <div className="detalle">{p.f === hoyISO() ? "Hoy" : `En ${diasEntre(hoyISO(), p.f)} días`}</div></div>
                <div className="monto">{fmt(p.m)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2>Presupuesto por categoría</h2>
      <div className="lista">
        {cats.filter((c) => c.presupuesto > 0 || c.gastado > 0).length === 0 && <div className="vacio">Aún no hay gastos este mes.</div>}
        {cats.filter((c) => c.presupuesto > 0 || c.gastado > 0).map((c) => {
          const p = c.presupuesto > 0 ? c.gastado / c.presupuesto : 0;
          return (
            <div className="fila" key={c.nombre}>
              <div className="cuerpo">
                <div className="titulo">{c.nombre}</div>
                {c.presupuesto > 0 && <div className="barra"><span className={p > 1 ? "alerta" : ""} style={{ width: `${Math.min(100, p * 100)}%` }} /></div>}
              </div>
              <div className={"monto " + (p > 1 ? "negativo" : "")}>
                {fmt(c.gastado, false)}
                {c.presupuesto > 0 && <small>de {fmt(c.presupuesto, false)}</small>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../contexto";
import { Cabeza } from "../ui";
import { errorTexto, fmt } from "../util";
import { aplicarSaldos, filasInvalidas, BloqueSaldos, cargarMensualidades, deudaTotal, faltante, ListaMensualidades, saldosVacios, type FilaMsi, type Saldos } from "./saldosTarjeta";

// Deja una tarjeta existente exactamente como dice tu estado de cuenta de hoy
export default function CuadrarTarjeta() {
  const { id = "" } = useParams();
  const { cuentas, recargar, aviso } = useApp();
  const nav = useNavigate();
  const c = cuentas.find((x) => x.id === id);
  const [filas, setFilas] = useState<FilaMsi[]>([]);
  const [originales, setOriginales] = useState<FilaMsi[]>([]);
  const [s, setS] = useState<Saldos>(saldosVacios);
  const [paso, setPaso] = useState(1);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!c?.dia_corte) return;
    cargarMensualidades(c.id, c.dia_corte).then((f) => { setFilas(f); setOriginales(f); });
  }, [c?.id, c?.dia_corte]);

  if (!c) return <><Cabeza titulo="Cuadrar tarjeta" volver /><div className="vacio">Cargando…</div></>;
  if (!c.dia_corte) return <><Cabeza titulo="Cuadrar tarjeta" volver /><p>Primero escribe el día de corte de {c.nombre} en Más › Cuentas.</p></>;

  async function guardar() {
    setError("");
    if (s.saldoBanco === "" || Number(s.saldoBanco) < 0) return setError("Escribe el saldo que te muestra el banco (puede ser 0).");
    setOcupado(true);
    const e = await aplicarSaldos({ id: c!.id, dia_corte: c!.dia_corte! }, filas, s, originales);
    setOcupado(false);
    if (e) return setError(errorTexto(e));
    await recargar(); aviso(`${c!.nombre} quedó cuadrada`); nav(`/cuenta/${c!.id}`, { replace: true });
  }

  return (
    <>
      <Cabeza titulo={`Cuadrar ${c.nombre}`} volver />
      <p className="sub" style={{ marginTop: -10, marginBottom: 16 }}>Paso {paso} de 2 · {paso === 1 ? "Compras a meses" : "Saldo y pago"}</p>
      {paso === 1 ? (
        <>
          <p style={{ marginTop: 0 }}>Copia de tu último estado de cuenta cada compra a meses que sigues pagando: la <b>mensualidad</b> y el <b>pago número “N de M”</b> tal como aparece.</p>
          <ListaMensualidades filas={filas} onCambio={setFilas} />
          {filas.length > 0 && <p className="nota">Te faltan {fmt(filas.reduce((a, f) => a + faltante(f), 0))} de meses sin intereses en esta tarjeta.</p>}
        </>
      ) : (
        <BloqueSaldos s={s} onCambio={setS} filas={filas} limite={Number(c.limite_credito) || 0} corte={c.dia_corte} />
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        {paso === 2 && <button className="boton claro" onClick={() => setPaso(1)}>Atrás</button>}
        {paso === 1 ? <button className="boton" onClick={() => setPaso(2)}>Siguiente</button>
          : <button className="boton" onClick={guardar} disabled={ocupado}>{ocupado ? "Guardando…" : `Guardar · deuda ${fmt(deudaTotal(s, filas), false)}`}</button>}
      </div>
      {paso === 2 && <p className="nota">Al guardar, la deuda de {c.nombre} queda en esta cifra a partir de hoy. Tus compras ya registradas se conservan en tu historial y tus gastos, pero ya no se vuelven a sumar a la deuda.</p>}
    </>
  );
}

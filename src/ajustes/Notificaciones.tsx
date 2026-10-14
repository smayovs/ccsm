import { useEffect, useState } from "react";
import { sb } from "../supabase";
import { useApp } from "../contexto";
import { cargarPreferencias, olvidarPreferencias } from "../preferencias";
import { Cabeza, Interruptor, Seccion, useUnaVez } from "../ui";
import { errorTexto } from "../util";
import { BellRinging } from "../phosphor";

// Clave pública VAPID (la privada vive en la bóveda de Supabase y solo la usa la función "recordatorios")
const VAPID_PUBLICA = "BKLGAgEleMEqigcjEgmBacMDSpi6TOTpRh6ur6CquZsw8MV1BgpY8M3W8zI4l3173SgbeupC7Ed3Q2Ii2yL6e1Y";

const aBytes = (b64: string) => {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const soporta = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const instalada = () => matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const esIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

// Recordatorios con notificaciones: pagos de tarjeta (hoy o mañana) e ingresos programados que llegan hoy, a las 9:00
export default function Notificaciones() {
  const { uid, aviso } = useApp();
  const unaVez = useUnaVez();
  const [activas, setActivas] = useState<boolean | null>(null);
  const [prefs, setPrefs] = useState({ pagos: true, ingresos: true });
  const [error, setError] = useState("");

  useEffect(() => {
    cargarPreferencias(uid).then((p) => setPrefs({ pagos: p?.notificaciones?.pagos !== false, ingresos: p?.notificaciones?.ingresos !== false }));
    if (!soporta()) return setActivas(false);
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setActivas(!!s && Notification.permission === "granted"), () => setActivas(false));
  }, [uid]);

  async function activar() {
    setError("");
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") return setError("No diste permiso. Puedes activarlo en Ajustes del iPhone › Notificaciones › ccsm.");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sus = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(VAPID_PUBLICA) });
      const j = sus.toJSON();
      const { error } = await sb.from("push_suscripciones").upsert({ endpoint: sus.endpoint, p256dh: j.keys!.p256dh, auth: j.keys!.auth }, { onConflict: "endpoint" });
      if (error) return setError(errorTexto(error));
      setActivas(true); aviso("Notificaciones activadas en este dispositivo");
    } catch {
      setError("No se pudieron activar en este dispositivo. Intenta de nuevo.");
    }
  }
  async function desactivar() {
    setError("");
    const reg = await navigator.serviceWorker.ready;
    const sus = await reg.pushManager.getSubscription();
    if (sus) { await sb.from("push_suscripciones").delete().eq("endpoint", sus.endpoint); await sus.unsubscribe(); }
    setActivas(false); aviso("Notificaciones desactivadas en este dispositivo");
  }
  async function cambiar(nuevas: typeof prefs) {
    setPrefs(nuevas);
    const { error } = await sb.from("preferencias").upsert({ user_id: uid, notificaciones: nuevas, updated_at: new Date().toISOString() });
    olvidarPreferencias();
    if (error) setError(errorTexto(error));
  }
  async function prueba() {
    setError("");
    const { data, error } = await sb.functions.invoke("recordatorios", { body: {} });
    if (error) return setError("No se pudo enviar la prueba.");
    aviso(data?.enviados ? "Te mandamos una notificación de prueba" : "No hay dispositivos activados para enviarla");
  }

  return (
    <>
      <Cabeza titulo="Notificaciones" volver />
      <div className="vacio-grande notif-cabeza">
        <BellRinging size={40} aria-hidden="true" />
        <p className="nota">Te avisamos a las 9:00 cuando vence el pago de una tarjeta (hoy o mañana) y el día que llega un ingreso programado para que lo confirmes.</p>
      </div>

      {!soporta() || (esIOS() && !instalada()) ? (
        <div className="aviso">
          <span>{esIOS()
            ? <>En el iPhone las notificaciones funcionan con la app instalada: abre ccsm en Safari, toca <b>Compartir</b> y luego <b>Agregar a inicio</b>. Ábrela desde ese ícono y vuelve aquí.</>
            : "Este navegador no permite notificaciones de apps web."}</span>
        </div>
      ) : (
        <Seccion titulo="Este dispositivo">
          <div className="lista">
            <Interruptor titulo="Recibir recordatorios" detalle={activas ? "Activadas en este dispositivo" : "Actívalas para recibir avisos aquí"}
              checked={!!activas} disabled={activas === null} onCambio={(si) => unaVez(si ? activar : desactivar)()} />
          </div>
          {activas && <button className="boton claro ancho mt-14" onClick={unaVez(prueba)}>Enviarme una de prueba</button>}
        </Seccion>
      )}

      <Seccion titulo="Qué te avisamos" ayuda="Se guarda en tu cuenta: aplica en todos tus dispositivos">
        <div className="lista">
          <Interruptor titulo="Pagos de tarjeta" detalle="El día anterior y el día límite, si aún falta pagar" checked={prefs.pagos} onCambio={(si) => cambiar({ ...prefs, pagos: si })} />
          <Interruptor titulo="Ingresos programados" detalle="El día que deberían llegar, para confirmarlos" checked={prefs.ingresos} onCambio={(si) => cambiar({ ...prefs, ingresos: si })} />
        </div>
      </Seccion>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

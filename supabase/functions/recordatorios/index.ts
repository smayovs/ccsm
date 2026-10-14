// Envía los recordatorios del día como notificaciones (Web Push).
// - El cron de la base la llama a las 9:00 de Cancún con el encabezado x-secreto: avisa a todos (recordatorios_hoy).
// - La app la llama con tu sesión para mandarte una notificación de prueba solo a ti.
// Las claves VAPID y el secreto viven en la bóveda; se leen con config_recordatorios (solo service_role).
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import webpush from "npm:web-push@3.6.7";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Mensaje = { user_id: string; titulo: string; cuerpo: string; url: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const { data: cfg, error } = await sb.rpc("config_recordatorios");
  if (error || !cfg?.vapid_privada) return json({ error: "Sin configuración" }, 500);
  webpush.setVapidDetails("https://smayovs.github.io/ccsm/", cfg.vapid_publica, cfg.vapid_privada);

  let mensajes: Mensaje[];
  if (req.headers.get("x-secreto") && req.headers.get("x-secreto") === cfg.secreto) {
    const r = await sb.rpc("recordatorios_hoy");
    if (r.error) return json({ error: r.error.message }, 500);
    mensajes = (r.data ?? []) as Mensaje[];
  } else {
    // Prueba desde la app: solo con una sesión válida y solo para esa persona
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data } = await sb.auth.getUser(token);
    if (!data?.user) return json({ error: "No autorizado" }, 401);
    mensajes = [{ user_id: data.user.id, titulo: "Notificaciones activadas", cuerpo: "Así te avisaremos de tus pagos de tarjeta y de los ingresos por confirmar.", url: "#/" }];
  }
  if (!mensajes.length) return json({ mensajes: 0, enviados: 0 });

  const ids = [...new Set(mensajes.map((m) => m.user_id))];
  const { data: subs } = await sb.from("push_suscripciones").select("id, user_id, endpoint, p256dh, auth").in("user_id", ids);
  let enviados = 0, quitadas = 0;
  for (const m of mensajes) {
    for (const s of (subs ?? []).filter((x) => x.user_id === m.user_id)) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ titulo: m.titulo, cuerpo: m.cuerpo, url: m.url }), { TTL: 60 * 60 * 12 });
        enviados++;
      } catch (e) {
        // El dispositivo ya no existe o quitó el permiso: se olvida su suscripción
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) { await sb.from("push_suscripciones").delete().eq("id", s.id); quitadas++; }
      }
    }
  }
  return json({ mensajes: mensajes.length, enviados, quitadas });
});

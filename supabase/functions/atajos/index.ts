// Recibe los atajos del iPhone. Autenticación propia: llave personal (ccsm_...) creada en la app.
// La llave va en el encabezado "Authorization: Bearer ccsm_..." o en el campo "token" del cuerpo;
// nunca en la dirección, porque las direcciones quedan guardadas en registros.
// GET                          -> catálogos para los menús del atajo
// POST {token, tipo, monto, ...} -> registra un movimiento
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

function tokenDe(req: Request, body?: Record<string, unknown>): string {
  const auth = req.headers.get("Authorization") ?? "";
  if (auth.startsWith("Bearer ccsm_")) return auth.slice(7).trim();
  return String(body?.token ?? "").trim();
}

Deno.serve(async (req) => {
  try {
    if (req.method === "GET") {
      const token = tokenDe(req);
      if (!token.startsWith("ccsm_")) return json({ ok: false, mensaje: "Falta la llave en el encabezado Authorization" }, 401);
      const { data, error } = await db.rpc("atajo_catalogos", { p_token: token });
      if (error) throw error;
      return json(data, data?.ok ? 200 : 401);
    }
    if (req.method === "POST") {
      let body: Record<string, unknown> = {};
      try { body = await req.json(); } catch { return json({ ok: false, mensaje: "No pude leer los datos enviados" }, 400); }
      const token = tokenDe(req, body);
      if (!token.startsWith("ccsm_")) return json({ ok: false, mensaje: "Falta la llave" }, 401);
      delete body.token;
      // Los atajos a veces mandan números como texto o con espacios; el SQL los normaliza
      for (const k of Object.keys(body)) if (body[k] === null || body[k] === undefined) delete body[k];
      const { data, error } = await db.rpc("atajo_registrar", { p_token: token, d: body });
      if (error) throw error;
      return json(data, data?.ok ? 200 : 400);
    }
    return json({ ok: false, mensaje: "Método no permitido" }, 405);
  } catch (e) {
    // El detalle se queda en los registros de Supabase; al iPhone solo llega un aviso general
    console.error(e);
    return json({ ok: false, mensaje: "No pude registrar el movimiento. Revisa los datos e inténtalo de nuevo." }, 500);
  }
});

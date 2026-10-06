import { createClient } from "@supabase/supabase-js";

// Llave publicable: es pública por diseño; la privacidad la imponen las reglas de la base de datos.
export const SUPABASE_URL = "https://nvmzmlefywssikkyamyk.supabase.co";
export const URL_ATAJOS = `${SUPABASE_URL}/functions/v1/atajos`;
export const sb = createClient(SUPABASE_URL, "sb_publishable_rpW3jm8fislGllUkwg4wuQ_u-aEY_O8", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { sb } from "./supabase";
import { APARIENCIA_INICIAL, aplicarApariencia } from "./tema";
import { borrarCache, guardarCache, leerCache } from "./cache";
import { cargarPreferencias, olvidarPreferencias } from "./preferencias";

export type Cuenta = {
  id: string; nombre: string; tipo: string; propietario_id: string | null; saldo_inicial: number;
  fecha_saldo_inicial: string; dia_corte: number | null; dia_pago: number | null; limite_credito: number | null;
  nombre_wallet: string | null; visibilidad: string; activa: boolean; orden: number; pago_mensual?: number | null;
};
export type Categoria = {
  id: string; nombre: string; tipo: "gasto" | "ingreso"; padre_id: string | null; propietario_id: string | null;
  presupuesto_mensual: number; orden: number; archivada: boolean; icono?: string | null;
};
export type Familiar = { id: string; nombre: string; activo: boolean };
export type Miembro = { user_id: string; nombre: string; rol: string; hogar_id: string; color: string | null };

type Catalogos = { miembros: Miembro[]; cuentas: Cuenta[]; categorias: Categoria[]; familiares: Familiar[] };

type Ctx = {
  session: Session | null;
  recuperando: boolean;
  terminarRecuperacion: () => void;
  uid: string;
  yo: Miembro | null;
  otros: Miembro[];
  cuentas: Cuenta[];        // cuentas que puedo usar (mías y conjuntas)
  categorias: Categoria[];  // mías y del hogar
  familiares: Familiar[];
  listo: boolean;
  fallo: boolean;           // la última carga de catálogos falló (sin conexión)
  recargar: () => Promise<void>;
  aviso: (t: string) => void;
};

const C = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(C);

export function Proveedor({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [recuperando, setRecuperando] = useState(false);
  const [inicio, setInicio] = useState(false);
  const [yo, setYo] = useState<Miembro | null>(null);
  const [otros, setOtros] = useState<Miembro[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [familiares, setFamiliares] = useState<Familiar[]>([]);
  const [listo, setListo] = useState(false);
  const [fallo, setFallo] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const limpiarUrl = () => {
      // los enlaces de los correos regresan con los datos de sesión en la URL; se quitan una vez leídos
      if (/access_token|error_description|type=/.test(location.hash)) history.replaceState(null, "", location.pathname + "#/");
    };
    if (/type=recovery/.test(location.hash)) setRecuperando(true);
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setInicio(true); limpiarUrl(); });
    const { data } = sb.auth.onAuthStateChange((e, s) => {
      // Al cerrar sesión no quedan tus datos guardados en el dispositivo
      if (e === "SIGNED_OUT") { borrarCache(); olvidarPreferencias(); }
      setSession(s);
      if (e === "PASSWORD_RECOVERY") setRecuperando(true);
      limpiarUrl();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id ?? "";

  const aplicar = useCallback((x: Catalogos) => {
    setYo(x.miembros.find((m) => m.user_id === uid) ?? null);
    setOtros(x.miembros.filter((m) => m.user_id !== uid));
    setCuentas(x.cuentas.filter((c) => c.propietario_id === uid || c.propietario_id === null));
    setCategorias(x.categorias);
    setFamiliares(x.familiares);
  }, [uid]);

  const recargar = useCallback(async () => {
    if (!uid) { setListo(true); return; }
    // Tu apariencia guardada (colores, letra); si falla se queda la de este dispositivo
    // (la misma consulta trae las secciones de Inicio: preferencias.ts la comparte)
    cargarPreferencias(uid).then((p) => {
      const ap = p?.apariencia;
      if (ap && Object.keys(ap).length) aplicarApariencia({ ...APARIENCIA_INICIAL, ...ap });
    });
    const r = await Promise.all([
      sb.from("miembros").select("*"),
      sb.from("cuentas").select("*").order("orden").order("nombre"),
      sb.from("categorias").select("*").order("orden").order("nombre"),
      sb.from("familiares").select("*").order("nombre"),
    ]).catch(() => null);
    // Sin conexión no se borra lo que ya había: sin miembros la app creería que no tienes hogar
    if (!r || r.some((x) => x.error)) { setFallo(true); setListo(true); return; }
    setFallo(false);
    const [m, c, cat, f] = r;
    const x: Catalogos = { miembros: (m.data ?? []) as Miembro[], cuentas: (c.data ?? []) as Cuenta[], categorias: (cat.data ?? []) as Categoria[], familiares: (f.data ?? []) as Familiar[] };
    aplicar(x);
    guardarCache(uid, "catalogos", x);
    setListo(true);
  }, [uid, aplicar]);

  useEffect(() => {
    if (!inicio) return;
    // Lo último que viste se muestra al instante y se actualiza por detrás
    const guardado = leerCache<Catalogos>(uid, "catalogos");
    if (guardado) { aplicar(guardado); setListo(true); } else setListo(false);
    recargar();
  }, [inicio, uid, recargar, aplicar]);

  const aviso = useCallback((t: string) => {
    setToast(t);
    window.setTimeout(() => setToast((x) => (x === t ? null : x)), 2600);
  }, []);

  return (
    <C.Provider value={{ session, recuperando, terminarRecuperacion: () => setRecuperando(false), uid, yo, otros, cuentas, categorias, familiares, listo: inicio && listo, fallo, recargar, aviso }}>
      {children}
      {toast && <div className="toast" role="status">{toast}</div>}
    </C.Provider>
  );
}

// Utilidades sobre catálogos
export function nombreCategoria(cats: Categoria[], id: string | null | undefined) {
  if (!id) return "";
  const c = cats.find((x) => x.id === id);
  if (!c) return "";
  const p = c.padre_id ? cats.find((x) => x.id === c.padre_id) : null;
  return p ? `${p.nombre} › ${c.nombre}` : c.nombre;
}
export function padreDe(cats: Categoria[], id: string | null | undefined) {
  const c = cats.find((x) => x.id === id);
  return c ? (c.padre_id ?? c.id) : "";
}

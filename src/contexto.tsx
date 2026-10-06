import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { sb } from "./supabase";

export type Cuenta = {
  id: string; nombre: string; tipo: string; propietario_id: string | null; saldo_inicial: number;
  fecha_saldo_inicial: string; dia_corte: number | null; dia_pago: number | null; limite_credito: number | null;
  nombre_wallet: string | null; visibilidad: string; activa: boolean; orden: number;
};
export type Categoria = {
  id: string; nombre: string; tipo: "gasto" | "ingreso"; padre_id: string | null; propietario_id: string | null;
  presupuesto_mensual: number; orden: number; archivada: boolean;
};
export type Familiar = { id: string; nombre: string; activo: boolean };
export type Miembro = { user_id: string; nombre: string; rol: string; hogar_id: string; color: string | null };

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
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const limpiarUrl = () => {
      // los enlaces de los correos regresan con los datos de sesión en la URL; se quitan una vez leídos
      if (/access_token|error_description|type=/.test(location.hash)) history.replaceState(null, "", location.pathname + "#/");
    };
    if (/type=recovery/.test(location.hash)) setRecuperando(true);
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setInicio(true); limpiarUrl(); });
    const { data } = sb.auth.onAuthStateChange((e, s) => {
      setSession(s);
      if (e === "PASSWORD_RECOVERY") setRecuperando(true);
      limpiarUrl();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id ?? "";

  const recargar = useCallback(async () => {
    if (!uid) { setListo(true); return; }
    const [m, c, cat, f] = await Promise.all([
      sb.from("miembros").select("*"),
      sb.from("cuentas").select("*").order("orden").order("nombre"),
      sb.from("categorias").select("*").order("orden").order("nombre"),
      sb.from("familiares").select("*").order("nombre"),
    ]);
    const miembros = (m.data ?? []) as Miembro[];
    setYo(miembros.find((x) => x.user_id === uid) ?? null);
    setOtros(miembros.filter((x) => x.user_id !== uid));
    setCuentas(((c.data ?? []) as Cuenta[]).filter((x) => x.propietario_id === uid || x.propietario_id === null));
    setCategorias((cat.data ?? []) as Categoria[]);
    setFamiliares((f.data ?? []) as Familiar[]);
    setListo(true);
  }, [uid]);

  useEffect(() => { if (inicio) { setListo(false); recargar(); } }, [inicio, uid, recargar]);

  const aviso = useCallback((t: string) => {
    setToast(t);
    window.setTimeout(() => setToast((x) => (x === t ? null : x)), 2600);
  }, []);

  return (
    <C.Provider value={{ session, recuperando, terminarRecuperacion: () => setRecuperando(false), uid, yo, otros, cuentas, categorias, familiares, listo: inicio && listo, recargar, aviso }}>
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

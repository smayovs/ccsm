import {
  Baby, Banknote, Bed, Beer, Bike, BookOpen, Briefcase, Building2, Bus, Car, Church, CircleDollarSign, Coffee, Coins, CreditCard,
  Croissant, Droplet, Dumbbell, Film, Flame, Flower2, Fuel, Gamepad2, Gift, Globe, GraduationCap, Hammer, HandCoins, HandHeart,
  Heart, HeartPulse, Home, Landmark, Laptop, Lightbulb, Music, Package, Palette, PartyPopper, PawPrint, PiggyBank, Pill, Pizza,
  Plane, Receipt, Repeat, Scissors, Shield, Shirt, ShoppingBag, ShoppingCart, Smartphone, Sofa, Sparkles, Stethoscope, Store, Tag,
  Ticket, Train, TrendingUp, Tv, Umbrella, Users, Utensils, Wallet, Wifi, Wine, Wrench, Zap, type LucideIcon,
} from "lucide-react";

// Catálogo de iconos que se pueden elegir para una categoría (nombre guardado → icono)
export const ICONOS: Record<string, LucideIcon> = {
  ShoppingCart, Store, Utensils, Coffee, Croissant, Pizza, Beer, Wine,
  Home, Sofa, Bed, Zap, Droplet, Flame, Wifi, Smartphone, Tv, Laptop, Lightbulb, Wrench, Hammer,
  Car, Fuel, Bus, Train, Bike, Plane, Globe,
  Shirt, ShoppingBag, Scissors, Sparkles, Palette, Flower2,
  Heart, HeartPulse, Stethoscope, Pill, Dumbbell, Shield, Umbrella,
  GraduationCap, BookOpen, Baby, PawPrint, Users,
  Gift, PartyPopper, Music, Film, Gamepad2, Ticket, Repeat, Package,
  Briefcase, Building2, Landmark, Wallet, Banknote, Coins, CircleDollarSign, HandCoins, PiggyBank, TrendingUp, CreditCard, Receipt,
  Church, HandHeart, Tag,
};

// Icono sugerido por el nombre cuando la categoría no tiene uno elegido
const SUGERIDOS: [RegExp, string][] = [
  [/s[uú]per|despensa|mandado/i, "ShoppingCart"], [/restaur|comida fuera|antojo|comer/i, "Utensils"], [/caf[eé]/i, "Coffee"],
  [/comida|alimenta/i, "Utensils"], [/gasolin|combust/i, "Fuel"], [/uber|taxi|transporte|auto|coche|carro|veh[ií]c/i, "Car"],
  [/viaje|vacacion|vuelo/i, "Plane"], [/renta|hipoteca|casa|vivienda|hogar/i, "Home"], [/luz|electric|servicio/i, "Zap"],
  [/agua/i, "Droplet"], [/gas\b/i, "Flame"], [/internet|wifi/i, "Wifi"], [/tel[eé]fono|celular|m[oó]vil/i, "Smartphone"],
  [/ropa|calzado|zapato/i, "Shirt"], [/belleza|cuidado personal|est[eé]tica|u[nñ]as|maquillaje/i, "Sparkles"],
  [/salud|m[eé]dic|doctor|hospital/i, "Stethoscope"], [/farmacia|medicina/i, "Pill"], [/gimnasio|gym|deporte|ejercicio/i, "Dumbbell"],
  [/educa|escuela|colegiatura|curso/i, "GraduationCap"], [/libro/i, "BookOpen"], [/beb[eé]|hijo|ni[nñ]o/i, "Baby"],
  [/mascota|perro|gato|veterin/i, "PawPrint"], [/regalo/i, "Gift"], [/fiesta|celebra/i, "PartyPopper"],
  [/entreten|ocio|cine|diversi/i, "Film"], [/juego|videojuego/i, "Gamepad2"], [/m[uú]sica|concierto/i, "Music"],
  [/suscrip|streaming|membres/i, "Repeat"], [/seguro/i, "Shield"], [/donaci|caridad|diezmo|ofrenda/i, "HandHeart"],
  [/sueldo|n[oó]mina|salario|trabajo/i, "Briefcase"], [/freelance|honorario|negocio|venta/i, "Store"],
  [/inversi|rendimiento|inter[eé]s/i, "TrendingUp"], [/ahorro/i, "PiggyBank"], [/deuda|cr[eé]dito|tarjeta|pr[eé]stamo/i, "CreditCard"],
  [/comisi|impuesto|banco/i, "Receipt"], [/reembolso|devoluci/i, "HandCoins"], [/compras/i, "ShoppingBag"], [/hogar/i, "Sofa"],
];

export function nombreIcono(nombre: string, icono?: string | null) {
  if (icono && ICONOS[icono]) return icono;
  const limpio = nombre.replace(/^Hogar: /, "");
  return SUGERIDOS.find(([re]) => re.test(limpio))?.[1] ?? "Tag";
}

export function IconoCategoria({ nombre, icono, tam = 20 }: { nombre: string; icono?: string | null; tam?: number }) {
  const I = ICONOS[nombreIcono(nombre, icono)];
  return <span className="ico" aria-hidden="true"><I size={tam} strokeWidth={1.9} /></span>;
}

const POR_TIPO: Record<string, LucideIcon> = {
  debito: Landmark, credito: CreditCard, ahorro: PiggyBank, efectivo: Banknote, inversion: TrendingUp, prestamo: HandCoins,
};

export function IconoCuenta({ tipo, conjunta = false, tam = 20 }: { tipo: string; conjunta?: boolean; tam?: number }) {
  const I = conjunta ? Users : POR_TIPO[tipo] ?? Wallet;
  return <span className={"ico cuenta-" + tipo} aria-hidden="true"><I size={tam} strokeWidth={1.9} /></span>;
}

export function SelectorIcono({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  return (
    <div className="rejilla-iconos" role="radiogroup" aria-label="Icono">
      {Object.entries(ICONOS).map(([k, I]) => (
        <button key={k} type="button" role="radio" aria-checked={valor === k} aria-label={k} onClick={() => onCambio(k)}>
          <I size={22} strokeWidth={1.9} />
        </button>
      ))}
    </div>
  );
}

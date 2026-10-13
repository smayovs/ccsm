import {
  Airplane, Baby, Bank, Barbell, BeerStein, Bed, Bicycle, BookOpen, Bread, Briefcase, Buildings, Bus, Car, Church, Coffee, Coins,
  Confetti, Couch, CreditCard, CurrencyCircleDollar, DeviceMobile, Drop, FilmSlate, Flame, Flower, ForkKnife, GameController, GasPump,
  Gift, Globe, GraduationCap, Hammer, HandCoins, HandHeart, Heart, Heartbeat, House, Laptop, Lightbulb, Lightning, Money, MusicNotes,
  Package, Palette, PawPrint, PiggyBank, Pill, Pizza, Receipt, Repeat, Scissors, Shield, ShoppingBag, ShoppingCart, Sparkle,
  Stethoscope, Storefront, Tag, Television, Ticket, Train, TrendUp, TShirt, Umbrella, Users, Wallet, WifiHigh, Wine, Wrench,
  type Icon,
} from "./phosphor";

// Catálogo de iconos que se pueden elegir para una categoría. La clave es el nombre que se guarda en la base
// (viene de la librería anterior y no se cambia para no tocar las categorías ya guardadas) → icono de Phosphor.
export const ICONOS: Record<string, Icon> = {
  ShoppingCart, Store: Storefront, Utensils: ForkKnife, Coffee, Croissant: Bread, Pizza, Beer: BeerStein, Wine,
  Home: House, Sofa: Couch, Bed, Zap: Lightning, Droplet: Drop, Flame, Wifi: WifiHigh, Smartphone: DeviceMobile, Tv: Television, Laptop, Lightbulb, Wrench, Hammer,
  Car, Fuel: GasPump, Bus, Train, Bike: Bicycle, Plane: Airplane, Globe,
  Shirt: TShirt, ShoppingBag, Scissors, Sparkles: Sparkle, Palette, Flower2: Flower,
  Heart, HeartPulse: Heartbeat, Stethoscope, Pill, Dumbbell: Barbell, Shield, Umbrella,
  GraduationCap, BookOpen, Baby, PawPrint, Users,
  Gift, PartyPopper: Confetti, Music: MusicNotes, Film: FilmSlate, Gamepad2: GameController, Ticket, Repeat, Package,
  Briefcase, Building2: Buildings, Landmark: Bank, Wallet, Banknote: Money, Coins, CircleDollarSign: CurrencyCircleDollar, HandCoins, PiggyBank, TrendingUp: TrendUp, CreditCard, Receipt,
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
  return <span className="ico" aria-hidden="true"><I size={tam} /></span>;
}

const POR_TIPO: Record<string, Icon> = {
  debito: Bank, credito: CreditCard, ahorro: PiggyBank, efectivo: Money, inversion: TrendUp, prestamo: HandCoins,
};

export function IconoCuenta({ tipo, conjunta = false, tam = 20 }: { tipo: string; conjunta?: boolean; tam?: number }) {
  const I = conjunta ? Users : POR_TIPO[tipo] ?? Wallet;
  return <span className={"ico cuenta-" + tipo} aria-hidden="true"><I size={tam} /></span>;
}

export function SelectorIcono({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  return (
    <div className="rejilla-iconos" role="radiogroup" aria-label="Icono">
      {Object.entries(ICONOS).map(([k, I]) => (
        <button key={k} type="button" role="radio" aria-checked={valor === k} aria-label={k} onClick={() => onCambio(k)}>
          <I size={22} />
        </button>
      ))}
    </div>
  );
}

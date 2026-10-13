// Cálculos de dinero sin dependencias, para poder probarlos (src/dinero.test.ts).
// Siguen las mismas reglas que la base de datos; si cambias una, cambia la otra.

export type ModoCompartir = "no" | "mitad" | "pct" | "monto" | "todo";

const centavos = (x: number) => Math.round(x * 100) / 100;

// Lo que le toca a tu pareja de un gasto compartido. Se reparte lo que queda después de las
// partes de familiares, igual que tg_repartos en la base de datos.
export function parteDePareja(monto: number, partesFamiliares: number, modo: ModoCompartir, valor: number) {
  const base = centavos(monto - partesFamiliares);
  const parte = modo === "mitad" ? Math.round(base * 50) / 100 : modo === "todo" ? base
    : modo === "pct" ? Math.round(base * valor) / 100 : modo === "monto" ? valor : 0;
  return { base, parte, tuParte: centavos(base - parte) };
}

// Lo cobrado de una compra a meses tras n mensualidades, igual que _msi_cobrado en la base de datos:
// mensualidades redondeadas y la primera absorbe los centavos, para que al final se cobre el total exacto.
export function cobradoTras(monto: number, meses: number, n: number) {
  if (n <= 0) return 0;
  if (n >= meses) return monto;
  return centavos(monto - centavos(monto / meses) * (meses - n));
}

// Cada mensualidad de una compra a meses (la primera lleva los centavos sobrantes)
export function mensualidadesMsi(monto: number, meses: number) {
  return Array.from({ length: meses }, (_, k) => centavos(cobradoTras(monto, meses, k + 1) - cobradoTras(monto, meses, k)));
}

import { Campo, Segmentos } from "../ui";
import { fechaCorta } from "../util";
import { fechaPago, type ReglaPago } from "../fechasPago";
import { ultimoCorte } from "./saldosTarjeta";

// Valores del formulario (texto mientras se escribe)
export type ReglaEdit = { pago_regla: ReglaPago["pago_regla"]; dia_pago: string; pago_dias: string; pago_habil: ReglaPago["pago_habil"] };
export const reglaDe = (c: { pago_regla?: ReglaPago["pago_regla"]; dia_pago: number | null; pago_dias?: number | null; pago_habil?: ReglaPago["pago_habil"] }): ReglaEdit =>
  ({ pago_regla: c.pago_regla ?? "fijo", dia_pago: String(c.dia_pago ?? ""), pago_dias: String(c.pago_dias ?? ""), pago_habil: c.pago_habil ?? "no" });
// Lo que se guarda en cuentas
export const reglaFila = (r: ReglaEdit) => ({
  pago_regla: r.pago_regla, pago_habil: r.pago_habil,
  dia_pago: r.pago_regla === "fijo" && r.dia_pago ? Number(r.dia_pago) : null,
  pago_dias: r.pago_regla === "dias" && r.pago_dias ? Number(r.pago_dias) : null,
});
export function errorRegla(r: ReglaEdit) {
  if (r.pago_regla === "fijo" && !(Number(r.dia_pago) >= 1 && Number(r.dia_pago) <= 31)) return "Escribe el día límite de pago (1 a 31).";
  if (r.pago_regla === "dias" && !(Number(r.pago_dias) >= 1 && Number(r.pago_dias) <= 60)) return "Escribe cuántos días después del corte (1 a 60).";
  return "";
}

// Cómo se calcula la fecha límite de pago: día fijo, días después del corte o el día del siguiente corte,
// y qué pasa si cae en fin de semana. Muestra con el último corte cómo queda.
export function ReglaPagoCampos({ r, onCambio, diaCorte }: { r: ReglaEdit; onCambio: (r: ReglaEdit) => void; diaCorte: number | null }) {
  const corte = diaCorte ? ultimoCorte(diaCorte) : null;
  const ejemplo = corte && !errorRegla(r) ? fechaPago({ ...reglaFila(r), dia_corte: diaCorte }, corte) : null;
  return (
    <>
      <span className="campo mb-6"><span>Fecha límite de pago</span></span>
      <Segmentos etiqueta="Fecha límite de pago" valor={r.pago_regla} onCambio={(v) => onCambio({ ...r, pago_regla: v })} opciones={[
        { v: "fijo", t: "Día fijo" }, { v: "dias", t: "N días" }, { v: "corte", t: "Sig. corte" },
      ]} />
      {r.pago_regla === "fijo" && (
        <Campo etiqueta="Día del mes"><input inputMode="numeric" value={r.dia_pago} onChange={(e) => onCambio({ ...r, dia_pago: e.target.value.replace(/\D/g, "") })} placeholder="27" /></Campo>
      )}
      {r.pago_regla === "dias" && (
        <Campo etiqueta="Días naturales después del corte" ayuda="La mayoría de los bancos da 20 días. Plata, por ejemplo, 30.">
          <input inputMode="numeric" value={r.pago_dias} onChange={(e) => onCambio({ ...r, pago_dias: e.target.value.replace(/\D/g, "") })} placeholder="20" />
        </Campo>
      )}
      <span className="campo mb-6"><span>Si cae en fin de semana</span></span>
      <Segmentos etiqueta="Si cae en fin de semana" valor={r.pago_habil} onCambio={(v) => onCambio({ ...r, pago_habil: v })} opciones={[
        { v: "no", t: "No se mueve" }, { v: "antes", t: "Al viernes" }, { v: "despues", t: "Al lunes" },
      ]} />
      {ejemplo && <p className="nota mt-n6 mb-14">Con el corte del {fechaCorta(corte!)}, pagas a más tardar el <b>{fechaCorta(ejemplo)}</b>. Si un estado de cuenta trae otra fecha (por un día festivo), cámbiala solo para ese corte desde la tarjeta.</p>}
    </>
  );
}

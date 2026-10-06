# CCSM — Finanzas para dos

App web instalable (PWA) para finanzas personales y de pareja: cuentas, presupuesto, gastos compartidos con reparto por porcentaje o monto, compras a meses sin intereses, cobros a familiares y suscripciones. Los pagos con Apple Pay se registran solos mediante Atajos de iOS.

- Base de datos, usuarios y función para atajos: Supabase (proyecto `nvmzmlefywssikkyamyk`).
- La privacidad la imponen las reglas de seguridad por fila de la base de datos; la llave publicable incluida aquí es pública por diseño.
- Publicación: cada `push` a `main` construye y publica en GitHub Pages (`.github/workflows/publicar.yml`).

```bash
npm install
npm run dev
```

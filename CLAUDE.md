# CCSM: notas para trabajar en este repositorio

Esta app se trabaja desde dos lugares: Claude Code y la app de Claude. Para no pisarse:

- **Antes de empezar**, trae lo último: `git pull --rebase origin main`.
- **Base de datos (Supabase, proyecto `nvmzmlefywssikkyamyk`)**: la definición vigente de cada función es la que está en la base, no la de un archivo viejo. Antes de cambiar una función, léela con `select pg_get_functiondef('public.nombre(args)'::regprocedure)` y parte de ahí.
- **Cada cambio a la base** se guarda también como archivo nuevo en `supabase/migrations/` (fecha y hora en el nombre), aunque ya se haya aplicado.
- `20261012030000_app_claude_inicio_prestamos_aplazados.sql` tiene lo hecho desde la app de Claude: préstamos (`cuentas.tipo = 'prestamo'`, `pago_mensual`), cargos aplazados (`movimientos.fecha_compra`; movimientos con fecha futura no afectan saldos), tabla `preferencias` (Inicio y apariencia) y las funciones `gastos_lista`, `gastos_detalle`, `flujo_meses`, `msi_partes`.
- **Atajo del iPhone**: el atajo envía `fechaCobro` (cargo aplazado) y `categoria` como "Categoría › Subcategoría"; el catálogo devuelve `gastos` (lista plana) y `formaPago`. No quitar esos campos.
- Responder y escribir textos de la app en español.

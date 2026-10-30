-- Cobros cuenta la parte de cada persona en los cargos de suscripción que aún no se registran,
-- a partir de este mes (el primer día del mes en que se creó la suscripción, para las nuevas).
-- Las que ya existían empiezan en octubre de 2026.
alter table public.suscripciones
  add column if not exists cobros_desde date not null default (date_trunc('month', (now() at time zone 'America/Cancun')))::date;
update public.suscripciones set cobros_desde = '2026-10-01';

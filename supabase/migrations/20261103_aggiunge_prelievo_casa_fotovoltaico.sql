-- Prelievo dalla rete misurato dall'inverter, per stimare le bollette luce non ancora arrivate
alter table public.casa_fotovoltaico
  add column kwh_prelevati numeric(10,1)
  check (kwh_prelevati is null or kwh_prelevati >= 0);
comment on column public.casa_fotovoltaico.kwh_prelevati is
  'Prelievo dalla rete misurato dall''inverter (Fox ESS gridConsumption)';

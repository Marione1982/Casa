-- Fotovoltaico: produzione lorda (pannelli, come app Fox ESS) e netta (uscita inverter).

alter table public.casa_fotovoltaico
  add column kwh_netti numeric(10,1) check (kwh_netti is null or kwh_netti >= 0);

comment on column public.casa_fotovoltaico.kwh_prodotti is 'Produzione dei pannelli (lordo, come app Fox ESS); fino a feb 2024 = uscita inverter';
comment on column public.casa_fotovoltaico.kwh_netti is 'Uscita inverter (netto delle perdite di conversione e batteria)';

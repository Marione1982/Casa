-- Spese fisse: addebiti mensili delle carte di credito sul conto (importo = totale dell'estratto della carta).
alter table public.casa_spese_fisse drop constraint casa_spese_fisse_tipo_check;
alter table public.casa_spese_fisse add constraint casa_spese_fisse_tipo_check
  check (tipo in ('mutuo','finanziamento','rate','abbonamento','carta'));
alter table public.casa_spese_fisse
  add column estratto_carta text check (estratto_carta in ('carta_hb','amex','revolut')),  -- carta di cui leggere l'estratto
  add column mese_estratto smallint not null default 0 check (mese_estratto in (0,1));     -- 1 = estratto del mese precedente

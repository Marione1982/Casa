-- I saldi inseriti a mano valgono anche per le carte: per Carta Hello e Amex "saldo" è lo speso dall'ultimo estratto.
alter table public.casa_saldi drop constraint casa_saldi_conto_check;
alter table public.casa_saldi add constraint casa_saldi_conto_check
  check (conto in ('conto_hb', 'revolut', 'carta_hb', 'amex'));

-- Fotovoltaico mese per mese, da Fox ESS (storico da ottobre 2022). La tabella per bimestre resta.

create table public.casa_fotovoltaico_mesi (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mese           date not null,                     -- primo giorno del mese
  kwh_prodotti   numeric(10,1) not null default 0,  -- lordo (pannelli); se manca il dato, uguale ai netti
  kwh_netti      numeric(10,1),                     -- uscita inverter
  kwh_immessi    numeric(10,1),                     -- venduti
  kwh_prelevati  numeric(10,1),                     -- dalla rete, misurato dall'inverter
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, mese),
  check (extract(day from mese) = 1)
);

create trigger casa_fotovoltaico_mesi_updated_at
  before update on public.casa_fotovoltaico_mesi
  for each row execute function public.casa_set_updated_at();

alter table public.casa_fotovoltaico_mesi enable row level security;
revoke all on public.casa_fotovoltaico_mesi from anon;
grant select, insert, update, delete on public.casa_fotovoltaico_mesi to authenticated;

create policy "casa_fotovoltaico_mesi_proprietario" on public.casa_fotovoltaico_mesi
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

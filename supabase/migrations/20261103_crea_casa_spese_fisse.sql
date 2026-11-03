-- Spese fisse: mutuo, finanziamenti, pagamenti a rate e abbonamenti (mensili o annuali).
create table public.casa_spese_fisse (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome        text not null,                 -- es. "Apple iPhone", "Netflix"
  tipo        text not null check (tipo in ('mutuo','finanziamento','rate','abbonamento')),
  creditore   text,                          -- BNL, Findomestic, PayPal…
  pagamento   text check (pagamento in ('conto_hb','carta_hb','amex','revolut')), -- vuoto = da completare
  importo     numeric(10,2) not null check (importo >= 0),
  frequenza   text not null default 'mensile' check (frequenza in ('mensile','annuale')),
  giorno      smallint check (giorno between 1 and 31),  -- vuoto = da completare
  mese        smallint check (mese between 1 and 12),    -- solo per gli annuali
  inizio      date,                          -- prima rata (se nota)
  fine        date,                          -- ultima rata; vuoto = senza scadenza
  cerca       text,                          -- testo per riconoscerla nei Movimenti
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index casa_spese_fisse_user_idx on public.casa_spese_fisse (user_id);

create trigger casa_spese_fisse_updated_at
  before update on public.casa_spese_fisse
  for each row execute function public.casa_set_updated_at();

alter table public.casa_spese_fisse enable row level security;
revoke all on public.casa_spese_fisse from anon;
grant select, insert, update, delete on public.casa_spese_fisse to authenticated;

create policy "casa_spese_fisse_proprietario" on public.casa_spese_fisse
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Budget: tetto mensile delle spese variabili e obiettivo di risparmio (con il mese da cui valgono),
-- e saldo del conto inserito a mano per il calcolo "Fino allo stipendio".
create table public.casa_budget (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  valido_dal           date not null,          -- primo giorno del mese
  tetto_variabili      numeric(10,2) not null check (tetto_variabili >= 0),
  obiettivo_risparmio  numeric(10,2) not null default 0 check (obiettivo_risparmio >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, valido_dal),
  check (extract(day from valido_dal) = 1)
);

create trigger casa_budget_updated_at
  before update on public.casa_budget
  for each row execute function public.casa_set_updated_at();

alter table public.casa_budget enable row level security;
revoke all on public.casa_budget from anon;
grant select, insert, update, delete on public.casa_budget to authenticated;
create policy "casa_budget_proprietario" on public.casa_budget
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table public.casa_saldi (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conto       text not null default 'conto_hb' check (conto in ('conto_hb', 'revolut')),
  data        date not null,
  saldo       numeric(10,2) not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, conto, data)
);

create trigger casa_saldi_updated_at
  before update on public.casa_saldi
  for each row execute function public.casa_set_updated_at();

alter table public.casa_saldi enable row level security;
revoke all on public.casa_saldi from anon;
grant select, insert, update, delete on public.casa_saldi to authenticated;
create policy "casa_saldi_proprietario" on public.casa_saldi
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Fotovoltaico (installato a ottobre 2022): produzione e immissione per bimestre, bonifici GSE.

create table public.casa_fotovoltaico (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  codice        text not null,              -- stesso nome della bolletta luce del bimestre: 202608, ...
  periodo_dal   date not null,
  periodo_al    date not null,
  kwh_prodotti  numeric(10,1) not null default 0,
  kwh_immessi   numeric(10,1),              -- "venduti"; null se il dato non è disponibile
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, codice),
  check (periodo_al >= periodo_dal),
  check (kwh_prodotti >= 0 and (kwh_immessi is null or kwh_immessi >= 0))
);

create table public.casa_gse_bonifici (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data_accredito  date not null,
  importo         numeric(10,2) not null,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index casa_gse_bonifici_user_data_idx on public.casa_gse_bonifici (user_id, data_accredito);

create trigger casa_fotovoltaico_updated_at
  before update on public.casa_fotovoltaico
  for each row execute function public.casa_set_updated_at();
create trigger casa_gse_bonifici_updated_at
  before update on public.casa_gse_bonifici
  for each row execute function public.casa_set_updated_at();

alter table public.casa_fotovoltaico enable row level security;
alter table public.casa_gse_bonifici enable row level security;

revoke all on public.casa_fotovoltaico from anon;
revoke all on public.casa_gse_bonifici from anon;
grant select, insert, update, delete on public.casa_fotovoltaico to authenticated;
grant select, insert, update, delete on public.casa_gse_bonifici to authenticated;

create policy "casa_fotovoltaico_proprietario" on public.casa_fotovoltaico
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "casa_gse_bonifici_proprietario" on public.casa_gse_bonifici
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

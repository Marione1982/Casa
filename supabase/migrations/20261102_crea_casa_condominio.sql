-- Condominio: pagamenti delle quote condominiali (ordinarie e straordinarie).

create table public.casa_condominio (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data_pagamento  date not null,
  importo         numeric(10,2) not null,
  tipo            text not null default 'ordinaria' check (tipo in ('ordinaria', 'straordinaria')),
  competenza_dal  date,                       -- primo mese coperto (giorno 1)
  competenza_al   date,                       -- ultimo mese coperto (giorno 1)
  causale         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (competenza_al is null or competenza_dal is null or competenza_al >= competenza_dal)
);

create index casa_condominio_user_data_idx on public.casa_condominio (user_id, data_pagamento);

create trigger casa_condominio_updated_at
  before update on public.casa_condominio
  for each row execute function public.casa_set_updated_at();

alter table public.casa_condominio enable row level security;

revoke all on public.casa_condominio from anon;
grant select, insert, update, delete on public.casa_condominio to authenticated;

create policy "casa_condominio_proprietario" on public.casa_condominio
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

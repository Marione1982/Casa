-- Schema completo delle tabelle di Casa (allineato al database). Le tabelle vivono nel progetto Supabase "Pizzeria da Mario".
-- App "Casa" – sezione Forniture
-- Tabella separata dalla pizzeria (prefisso casa_), accessibile solo al proprietario.

create table public.casa_bollette (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo            text not null check (tipo in ('luce', 'gas', 'acqua')),
  categoria       text not null default 'bolletta' check (categoria in ('bolletta', 'deposito', 'altro')),
  codice          text not null,              -- il nome del file: 202608, 20261, ...
  fornitore       text not null,
  periodo_dal     date not null,
  periodo_al      date not null,
  data_emissione  date,
  importo         numeric(10,2) not null,     -- costo della bolletta (negativo se a credito)
  consumo         numeric(10,3) not null default 0,  -- kWh, Smc o m³ secondo il tipo
  oneri_extra     numeric(10,2) not null default 0, -- voci non legate ai consumi: rate, depositi, volture
  bonus           numeric(10,2) not null default 0, -- bonus sociali ricevuti
  lettura_finale  numeric(10,3),              -- solo acqua: lettura del contatore a fine periodo
  note            text,
  file_nome       text,                       -- es. Luce/202608.pdf
  file_url        text,                       -- link al PDF su OneDrive
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, tipo, codice, categoria),
  check (periodo_al >= periodo_dal)
);

create index casa_bollette_user_tipo_idx on public.casa_bollette (user_id, tipo, periodo_al);

-- aggiorna updated_at a ogni modifica
create function public.casa_set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger casa_bollette_updated_at
  before update on public.casa_bollette
  for each row execute function public.casa_set_updated_at();

-- sicurezza: solo il proprietario vede e modifica le sue bollette
alter table public.casa_bollette enable row level security;

revoke all on public.casa_bollette from anon;
grant select, insert, update, delete on public.casa_bollette to authenticated;

create policy "casa_bollette_proprietario" on public.casa_bollette
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

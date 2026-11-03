-- Movimenti bancari: conto corrente Hello bank, carta di credito Hello bank, Amex (in seguito Revolut).

create table public.casa_movimenti (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fonte           text not null check (fonte in ('conto_hb', 'carta_hb', 'amex', 'revolut')),
  data            date not null,                -- data dell'operazione
  data_contabile  date,                         -- data di registrazione della banca
  descrizione     text not null,
  importo         numeric(10,2) not null,       -- positivo = entrata, negativo = uscita
  categoria       text,
  tipo            text not null default 'normale'
                  check (tipo in ('normale', 'pagamento_carta', 'giroconto')),  -- solo 'normale' conta come entrata/spesa
  estratto        text,                         -- estratto conto di provenienza (es. 202503) o 'csv'
  impronta        text not null,                -- chiave anti-doppioni (fonte, data, importo, descrizione, progressivo)
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, impronta)
);

create index casa_movimenti_user_data_idx on public.casa_movimenti (user_id, data);

create trigger casa_movimenti_updated_at
  before update on public.casa_movimenti
  for each row execute function public.casa_set_updated_at();

alter table public.casa_movimenti enable row level security;
revoke all on public.casa_movimenti from anon;
grant select, insert, update, delete on public.casa_movimenti to authenticated;

create policy "casa_movimenti_proprietario" on public.casa_movimenti
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Regole per assegnare la categoria: se la descrizione contiene "testo", il movimento va in "categoria".
create table public.casa_regole_categorie (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  testo       text not null,
  categoria   text not null,
  tipo        text not null default 'normale'
              check (tipo in ('normale', 'pagamento_carta', 'giroconto')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, testo)
);

create trigger casa_regole_categorie_updated_at
  before update on public.casa_regole_categorie
  for each row execute function public.casa_set_updated_at();

alter table public.casa_regole_categorie enable row level security;
revoke all on public.casa_regole_categorie from anon;
grant select, insert, update, delete on public.casa_regole_categorie to authenticated;

create policy "casa_regole_categorie_proprietario" on public.casa_regole_categorie
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

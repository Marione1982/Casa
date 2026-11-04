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


-- Fotovoltaico (installato a ottobre 2022): produzione e immissione per bimestre, bonifici GSE.

create table public.casa_fotovoltaico (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  codice        text not null,              -- stesso nome della bolletta luce del bimestre: 202608, ...
  periodo_dal   date not null,
  periodo_al    date not null,
  kwh_prodotti  numeric(10,1) not null default 0, -- lordo: produzione dei pannelli (come app Fox ESS); fino a feb 2024 = uscita inverter
  kwh_netti     numeric(10,1) check (kwh_netti is null or kwh_netti >= 0), -- netto: uscita inverter (dopo perdite di conversione e batteria)
  kwh_immessi   numeric(10,1),              -- "venduti"; null se il dato non è disponibile
  kwh_prelevati numeric(10,1) check (kwh_prelevati is null or kwh_prelevati >= 0), -- prelievo dalla rete misurato dall'inverter (Fox ESS gridConsumption)
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

-- Spese fisse: mutuo, finanziamenti, pagamenti a rate e abbonamenti (mensili o annuali).
create table public.casa_spese_fisse (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome        text not null,                 -- es. "Apple iPhone", "Netflix"
  tipo        text not null check (tipo in ('mutuo','finanziamento','rate','abbonamento','carta')),
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
  updated_at  timestamptz not null default now(),
  estratto_carta text check (estratto_carta in ('carta_hb','amex','revolut')), -- tipo carta: di quale carta leggere l'estratto
  mese_estratto  smallint not null default 0 check (mese_estratto in (0,1))   -- 1 = estratto del mese precedente
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
  conto       text not null default 'conto_hb' check (conto in ('conto_hb', 'revolut', 'carta_hb', 'amex')),
  data        date not null,
  saldo       numeric(10,2) not null,       -- per le carte: speso dall'ultimo estratto (positivo)
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

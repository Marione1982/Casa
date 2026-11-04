-- Buste paga (sezione Stipendio): una riga per busta, letta dal PDF in OneDrive Documenti/Lavoro/BustePaga/AAAA/.
-- Solo numeri: niente codice fiscale né coordinate bancarie (restano nel PDF).
create table public.casa_buste_paga (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users(id) on delete cascade,
  codice                text not null,               -- nome del file: 202607, 202606q (quattordicesima), 202612t (tredicesima)
  mese                  date not null,               -- primo giorno del mese di retribuzione
  tipo                  text not null default 'mensile' check (tipo in ('mensile', 'tredicesima', 'quattordicesima')),
  datore                text not null default 'MetLife',
  data_elaborazione     date,                        -- data stampata sulla busta
  lordo                 numeric(10,2) not null,      -- totale competenze, senza l'anticipo recuperato
  contributi            numeric(10,2) not null default 0,  -- INPS e fondi a carico del dipendente
  irpef                 numeric(10,2) not null default 0,  -- ritenute IRPEF del mese, compresi conguaglio di fine anno e imposte su premi e arretrati
  addizionali           numeric(10,2) not null default 0,  -- addizionali regionale e comunale
  altre_trattenute      numeric(10,2) not null default 0,  -- tutto il resto (arrotondamenti, altre voci)
  rimborso_730          numeric(10,2) not null default 0,  -- rimborso del 730 pagato in busta (tasse degli anni prima)
  netto                 numeric(10,2) not null,      -- totale netto del mese = lordo + rimborso_730 - trattenute
  retribuzione_base     numeric(10,2),               -- paga base + assorbibili (importo base mensile)
  prossimo_scatto       date,
  tfr                   numeric(10,2),               -- quota TFR del mese (versata al fondo)
  ferie_residue         numeric(7,2),                -- giorni, saldo a fine mese
  ex_festivita_residue  numeric(7,2),                -- giorni
  rol_residui_ore       numeric(7,2),                -- ore (FE.RE.)
  imponibile_irpef_anno numeric(10,2),               -- progressivi dell'anno, per il controllo
  irpef_anno            numeric(10,2),
  voci                  jsonb not null default '[]'::jsonb,  -- voci variabili: [{nome, importo, figurativa}]
  file_url              text,
  note                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, codice),
  check (extract(day from mese) = 1)
);

create trigger casa_buste_paga_updated_at
  before update on public.casa_buste_paga
  for each row execute function public.casa_set_updated_at();

alter table public.casa_buste_paga enable row level security;
revoke all on public.casa_buste_paga from anon;
grant select, insert, update, delete on public.casa_buste_paga to authenticated;
create policy "casa_buste_paga_proprietario" on public.casa_buste_paga
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

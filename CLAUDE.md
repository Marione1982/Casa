# Casa

## Cos'è
Webapp in italiano per i conti di casa e famiglia, a sezioni. Sezione attiva: **Forniture** (bollette di luce, gas e acqua) con riepilogo dell'intero periodo dal 2022, spesa per anno, confronto mese per mese tra anni, costo per unità, elenco bollette con link ai PDF su OneDrive e finestra per aggiungere/modificare/eliminare; scheda **Fotovoltaico** (impianto da ottobre 2022) con produzione, autoconsumo, venduti, copertura dei consumi e bonifici GSE. Sezione **Condominio**: pagamenti delle quote condominiali (ordinarie e straordinarie) con riepilogo, griglia dei mesi pagati / da pagare, versato per anno ed elenco con finestra per aggiungere/modificare/eliminare. Sezione **Movimenti**: movimenti di conto corrente Hello bank, carta di credito Hello bank e Amex (Revolut in arrivo) da gennaio 2025, con entrate/uscite, grafico mensile, uscite per categoria, elenco con ricerca, modifica della categoria con regole e pulsante "Importa". Sezioni "Spese fisse" e "Budget" presenti nel menu ma ancora vuote.

## Stack
- HTML, CSS e JavaScript puro. Nessun build, nessun package manager.
- `@supabase/supabase-js` 2.118.0 e `chart.js` 4.4.1 da CDN (jsdelivr) in `index.html`.
- Hosting: GitHub Pages, <https://marione1982.github.io/Casa/> (pubblicato da `.github/workflows/deploy.yml` a ogni push su `main`).

## File
- `index.html`: struttura, accesso, sezioni, finestra bolletta.
- `app.js`: logica (accesso, lettura dati, ripartizione mensile, grafici, elenco, salvataggio).
- `movimenti.js`: sezione Movimenti (regole di categoria, grafici, importazione CSV/JSON). Usa le funzioni globali di `app.js`, quindi va caricato dopo.
- `styles.css`: stile responsive con tema chiaro/scuro (colori come variabili CSS).
- `supabase-config.js`: URL e chiave publishable (pubblica per progetto).
- `supabase/schema.sql`: schema completo delle tabelle di Casa; `supabase/migrations/`: migrazioni applicate.

## Supabase
- Le tabelle stanno nel progetto **"Pizzeria da Mario"** (ref `xtgtnbjpludhdjqrkiqh`), per restare nel piano gratuito (massimo 2 progetti attivi). Prefisso `casa_` per tenerle separate da quelle della pizzeria. Stesso account di accesso; siccome i due siti stanno sullo stesso dominio `marione1982.github.io`, il login è condiviso.
- Tabella `casa_bollette`: una riga per bolletta. `importo` è il costo della bolletta (negativo se a credito, già al netto dei crediti riportati dalle bollette precedenti). `oneri_extra` sono voci non legate ai consumi (rate, depositi, volture) e `bonus` i bonus sociali: il costo per unità usa `importo - oneri_extra + bonus`. `categoria` = bolletta / deposito / altro. Unicità su `(user_id, tipo, codice, categoria)`.
- Tabella `casa_fotovoltaico`: una riga per bimestre, `codice` uguale al nome della bolletta luce dello stesso bimestre. `kwh_prodotti` = lordo, produzione dei pannelli (come l'app Fox ESS: variabile `PVEnergyTotal`, disponibile da feb 2024; prima = uscita inverter), `kwh_netti` = netto, uscita inverter dopo le perdite di conversione e batteria (variabile `generation`), `kwh_immessi` = venduti (variabile `feedin`). Dal 2 novembre tutti i valori sono allineati a Fox ESS Cloud (inverter ibrido H1-6.0-E con batteria da 10 kWh). Se un bimestre FV non ha ancora la bolletta luce (manca il prelievo), la copertura è per eccesso: l'app mette un asterisco sul riquadro e sull'anno coinvolto, con una nota che elenca i bimestri mancanti. Calcolati nell'app: perdite = lordo − netti; autoconsumo = netti − immessi; consumo totale = consumo della bolletta luce (prelievo) + autoconsumo. Dati iniziali dal foglio LUCE di OneDrive `Spese Casa.xlsx`.
- Tabella `casa_gse_bonifici`: un accredito per riga (`data_accredito`, `importo`). Le prime 4 date sono indicative (fine del bimestre in cui erano annotate). La spesa luce netta = bollette luce dal primo bimestre FV − bonifici GSE.
- Tabella `casa_condominio`: un pagamento per riga (`data_pagamento`, `importo`, `tipo` ordinaria/straordinaria, `causale`). Le quote ordinarie hanno `competenza_dal`/`competenza_al` (primo giorno del primo e dell'ultimo mese coperto); le straordinarie no. L'app ricava i mesi coperti, la quota mensile attuale (ultima quota ordinaria ÷ mesi) e le quote arretrate (mesi senza quota dal primo mese fino al mese precedente a oggi). Dati iniziali dal foglio "Concorde" di `Spese Casa.xlsx` (36 righe, 6.071,45 €); due righe miste sono state divise: 13/08/2022 = 390 € quote gen-giu 2022 + 55,45 € conguaglio bilancio 2021; 27/09/2024 = 65 € quota luglio 2024 + 71 € riparazione citofono.
- **Fox ESS**: la funzione Supabase `casa-foxess-sync` (codice in `supabase/functions/casa-foxess-sync/`, `verify_jwt` attivo) legge dall'Open API Fox ESS (`/op/v0/device/report/query`, dimensione anno) `PVEnergyTotal`, `generation` e `feedin` e aggiorna i bimestri dell'anno in corso (anche quello in corso, e l'anno precedente a gennaio-febbraio). Gira con il JWT dell'utente (RLS), senza `service_role`. La chiave sta solo nel segreto Supabase `FOXESS_API_KEY` (una sola chiave per account; per revocarla bisogna contattare Fox ESS); il numero di serie dell'inverter lo ricava dall'API. L'app la chiama all'apertura (al massimo ogni 6 ore per dispositivo) e con il pulsante "Aggiorna da Fox ESS". Prova senza scrivere: `?prova=1`.
- Le tabelle del fotovoltaico le aggiorna Fox ESS (o l'utente dall'app); l'attività pianificata giornaliera scrive solo in `casa_bollette`. Anche `casa_condominio` si compila solo dall'app.
- Tabella `casa_movimenti`: un movimento per riga. `fonte` = conto_hb / carta_hb / amex / revolut; `data` = data dell'operazione (per il conto la data valuta), `data_contabile`; `importo` positivo = entrata, negativo = uscita. `tipo` = normale / pagamento_carta / giroconto: solo `normale` entra nei totali (l'addebito mensile delle carte sul conto è `pagamento_carta`, perché le spese sono già una per una negli estratti delle carte). `estratto` = codice del PDF (es. 202603) o `csv`. `impronta` (unica per utente) evita i doppioni: fonte|estratto|data contabile|importo|descrizione|progressivo.
- Tabella `casa_regole_categorie`: "se la descrizione contiene `testo` → `categoria` (e `tipo`)". Si crea dall'app ("Applica anche agli altri movimenti") e ha la precedenza sulle regole di base scritte in `movimenti.js` (REGOLE_BASE, e per Amex la categoria stampata sotto la spesa).
- RLS attiva, una policy per il proprietario, `revoke all` ad `anon`, `grant` ad `authenticated`.

## Bollette e OneDrive
- PDF in OneDrive `Documenti/Casa/Utenze/{Luce,Gas,Acqua}`.
- Nomi file: luce e gas = anno + mese finale del bimestre di consumo (`202608` = luglio-agosto 2026); acqua = anno + trimestre 1-4 (`20263`).
- Il 202407 della luce è la bolletta di fine fornitura del gestore precedente (Servizio Elettrico Nazionale): è una bolletta normale.
- Edison: il "totale bolletta" stampato include i crediti riportati dalla bolletta precedente ("Restituzione crediti"); nel database va il costo del solo periodo.
- AQP: le bollette alternano acconti e conguagli; il consumo registrato è la differenza tra le letture finali di bollette consecutive (contatore sostituito il 21/02/2025).

## Movimenti bancari
- PDF in OneDrive `Documenti/Banca/HelloBank/`: `HB Estratto Conto` (conto, trimestrale, nome = anno+mese di chiusura, es. 202609), `CDC Estratto Conto` (carta Hello, mensile, chiude il 21), `Amex` (mensile, chiude il 20; mese senza estratto = nessuna spesa, vale 0 €). Nomi AAAAMM = mese di chiusura.
- Dati iniziali da gennaio 2025 (movimenti con data operazione dal 1/1/2025): Claude ha letto i PDF (conto 7, carta 22, Amex 14) controllando ogni estratto con i totali stampati, e ha creato `Banca/Import Casa/movimenti_2025-2026.json` (formato `{movimenti:[{fonte,data,data_contabile,descrizione,importo,estratto,categoria_amex}]}`), da caricare con "Importa".
- Aggiornamenti: il CSV "lista movimenti" di Hello bank (`Data contabile;Data valuta;Descrizione;Dettaglio;Importo`) si importa così com'è. Le righe "Non contabilizzato" si saltano; quelle con data contabile già coperta da un estratto PDF dello stesso conto si saltano. Le descrizioni del CSV sono diverse da quelle dei PDF, quindi un periodo va preso da una sola delle due fonti.
- Conto: nei PDF entrate e uscite si distinguono solo dalla colonna (uscite finiscono a x≈494, entrate a x≈554); il piè di pagina ".rev - 30LPMTQA…" va tolto dalle descrizioni. Carta Hello: spese nella colonna di destra (x1>515). Amex: "CR" sotto l'importo = accredito; "ADDEBITO IN C/C" = pagamento dal conto, non è una spesa.

## Avvio locale
`python3 -m http.server 3000`, poi `http://localhost:3000`. Aggiorna il parametro `?v=` di `app.js` e `styles.css` in `index.html` quando li cambi.

## Regole di lavoro
- Prima di cambiare il database, leggi lo stato reale. Mostra l'SQL e aspetta conferma prima di applicarlo.
- Ogni modifica al database passa da una migrazione con nome descrittivo, e `supabase/schema.sql` si aggiorna nello stesso lavoro.
- Mai `service_role` né chiavi segrete nel browser o nel repo: il repository è pubblico.
- Non toccare le tabelle della pizzeria.
- Testi in italiano; considera sempre PC, smartphone e tablet. Commit brevi in italiano su `main`.

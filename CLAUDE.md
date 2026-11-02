# Casa

## Cos'è
Webapp in italiano per i conti di casa e famiglia, a sezioni. Sezione attiva: **Forniture** (bollette di luce, gas e acqua) con riepilogo dell'intero periodo dal 2022, spesa per anno, confronto mese per mese tra anni, costo per unità, elenco bollette con link ai PDF su OneDrive e finestra per aggiungere/modificare/eliminare. Sezioni "Spese fisse" e "Budget" presenti nel menu ma ancora vuote.

## Stack
- HTML, CSS e JavaScript puro. Nessun build, nessun package manager.
- `@supabase/supabase-js` 2.118.0 e `chart.js` 4.4.1 da CDN (jsdelivr) in `index.html`.
- Hosting: GitHub Pages, <https://marione1982.github.io/Casa/> (pubblicato da `.github/workflows/deploy.yml` a ogni push su `main`).

## File
- `index.html`: struttura, accesso, sezioni, finestra bolletta.
- `app.js`: logica (accesso, lettura dati, ripartizione mensile, grafici, elenco, salvataggio).
- `styles.css`: stile responsive con tema chiaro/scuro (colori come variabili CSS).
- `supabase-config.js`: URL e chiave publishable (pubblica per progetto).
- `supabase/schema.sql`: schema completo delle tabelle di Casa; `supabase/migrations/`: migrazioni applicate.

## Supabase
- Le tabelle stanno nel progetto **"Pizzeria da Mario"** (ref `xtgtnbjpludhdjqrkiqh`), per restare nel piano gratuito (massimo 2 progetti attivi). Prefisso `casa_` per tenerle separate da quelle della pizzeria. Stesso account di accesso; siccome i due siti stanno sullo stesso dominio `marione1982.github.io`, il login è condiviso.
- Tabella `casa_bollette`: una riga per bolletta. `importo` è il costo della bolletta (negativo se a credito, già al netto dei crediti riportati dalle bollette precedenti). `oneri_extra` sono voci non legate ai consumi (rate, depositi, volture) e `bonus` i bonus sociali: il costo per unità usa `importo - oneri_extra + bonus`. `categoria` = bolletta / deposito / altro. Unicità su `(user_id, tipo, codice, categoria)`.
- RLS attiva, una policy per il proprietario, `revoke all` ad `anon`, `grant` ad `authenticated`.

## Bollette e OneDrive
- PDF in OneDrive `Documenti/Casa/Utenze/{Luce,Gas,Acqua}`.
- Nomi file: luce e gas = anno + mese finale del bimestre di consumo (`202608` = luglio-agosto 2026); acqua = anno + trimestre 1-4 (`20263`).
- Il 202407 della luce è la bolletta di fine fornitura del gestore precedente (Servizio Elettrico Nazionale): è una bolletta normale.
- Edison: il "totale bolletta" stampato include i crediti riportati dalla bolletta precedente ("Restituzione crediti"); nel database va il costo del solo periodo.
- AQP: le bollette alternano acconti e conguagli; il consumo registrato è la differenza tra le letture finali di bollette consecutive (contatore sostituito il 21/02/2025).

## Avvio locale
`python3 -m http.server 3000`, poi `http://localhost:3000`. Aggiorna il parametro `?v=` di `app.js` e `styles.css` in `index.html` quando li cambi.

## Regole di lavoro
- Prima di cambiare il database, leggi lo stato reale. Mostra l'SQL e aspetta conferma prima di applicarlo.
- Ogni modifica al database passa da una migrazione con nome descrittivo, e `supabase/schema.sql` si aggiorna nello stesso lavoro.
- Mai `service_role` né chiavi segrete nel browser o nel repo: il repository è pubblico.
- Non toccare le tabelle della pizzeria.
- Testi in italiano; considera sempre PC, smartphone e tablet. Commit brevi in italiano su `main`.

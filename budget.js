// Casa – sezione Budget: tetto mensile delle spese variabili, obiettivo di risparmio (tabella casa_budget)
// e disponibilità che serve sul conto Hello fino al prossimo stipendio (saldo in casa_saldi).
// Usa i dati e le funzioni globali di app.js (bollette, ym, ymAdd, …), movimenti.js (movimenti, norm),
// prossime.js (prossimeBollette, ritardoPagamento, storico, piuGiorni, giorniTra, mediana, fmtGiorno)
// e spese.js (tutteLeVoci, vociCarte, attivaNelMese, dataPrevista, abbinaMese, cartaDelMese, ultimaDataFonte).
'use strict';

let budgetImp = [];        // casa_budget: tetto e obiettivo, ognuno valido da un mese
let saldi = [];            // casa_saldi: saldi del conto inseriti a mano
let bgVista = 'variabili';

// Categorie che non sono spese variabili (spese fisse, bollette, rate)
const CATEGORIE_FISSE = ['Finanziamenti', 'Condominio', 'Utenze', 'Abbonamenti'];
// Spese una tantum (lavori, affitto temporaneo…): fuori dal tetto e dalla mediana, ma contano nel risparmio
const STRAORDINARIE = 'Straordinarie';
// Stipendi accreditati sul conto Hello. Se il giorno è sabato, domenica o festivo arrivano il giorno lavorativo prima;
// a dicembre arrivano entrambi verso il 15 (con la tredicesima).
const STIPENDI = [
  { id: 'ministero', nome: 'Stipendio Ministero', cerca: 'MINISTERO', giorno: 23 },
  { id: 'metlife', nome: 'Stipendio MetLife', cerca: 'METLIFE', giorno: 27 },
];
const GIORNO_DICEMBRE = 15;
const CONTI_SALDO = ['conto_hb', 'revolut'];   // conti da cui escono le spese da coprire (Revolut: il prestito, coperto da un giroconto dal conto Hello)

/* ---------- Dati ---------- */

async function caricaBudget() {
  if (!sb || !currentUser) return;
  const [b, s] = await Promise.all([
    sb.from('casa_budget').select('*').order('valido_dal'),
    sb.from('casa_saldi').select('*').order('data'),
  ]);
  if (b.error) console.warn('Budget non disponibile:', b.error.message);
  if (s.error) console.warn('Saldi non disponibili:', s.error.message);
  budgetImp = (b.data || []).map(r => ({ ...r, tetto_variabili: Number(r.tetto_variabili), obiettivo_risparmio: Number(r.obiettivo_risparmio) }));
  saldi = (s.data || []).map(r => ({ ...r, saldo: Number(r.saldo) }));
  renderBudget();
}

const budgetDel = k => budgetImp.filter(r => r.valido_dal <= `${k}-01`).at(-1) || null;
const ultimoSaldo = () => saldi.filter(r => r.conto === 'conto_hb').at(-1) || null;
const listaMov = () => typeof movimenti !== 'undefined' ? movimenti : [];
const sommaImp = (l, f = x => x.importo) => l.reduce((t, x) => t + (f(x) || 0), 0);

/* ---------- Carte: speso dall'ultimo estratto, inserito a mano ---------- */

// Giorno di chiusura degli estratti: la carta Hello chiude il 21, Amex il 20
const CHIUSURA = { carta_hb: 21, amex: 20 };
const NOMI_CARTE = { carta_hb: 'Carta Hello', amex: 'Amex' };
const codiceDa = (fonte, d) => { const k = ym(d); return (Number(d.slice(8)) > CHIUSURA[fonte] ? ymAdd(k, 1) : k).replace('-', ''); };
const kDaCodice = c => `${c.slice(0, 4)}-${c.slice(4)}`;
const fineEstratto = (fonte, c) => `${kDaCodice(c)}-${String(CHIUSURA[fonte]).padStart(2, '0')}`;
const inizioEstratto = (fonte, c) => piuGiorni(fineEstratto(fonte, ymAdd(kDaCodice(c), -1).replace('-', '')), 1);
const giaImportato = (fonte, c) => -sommaImp(listaMov().filter(m => m.fonte === fonte && m.estratto === c));

// Ultimo speso inserito per la carta, se è più recente dei movimenti importati (altrimenti valgono i movimenti)
function spesoCarta(fonte) {
  const r = saldi.filter(x => x.conto === fonte).at(-1);
  const ultima = ultimaDataFonte(fonte);
  if (!r || (ultima && r.data <= ultima)) return null;
  const codice = codiceDa(fonte, r.data);
  const fine = fineEstratto(fonte, codice);
  const mancanti = Math.max(0, giorniTra(r.data, fine));
  const giorniEstratto = giorniTra(inizioEstratto(fonte, codice), fine) + 1;
  const stimaResto = mancanti ? stimaEstratto(fonte) / giorniEstratto * mancanti : 0;
  // parte non ancora importata e giorni a cui si riferisce
  const daGiorno = [inizioEstratto(fonte, codice), ultima ? piuGiorni(ultima, 1) : null].filter(Boolean).sort().at(-1);
  return { fonte, data: r.data, speso: r.saldo, codice, fine, mancanti, totale: r.saldo + stimaResto,
    nonImportato: Math.max(0, r.saldo - giaImportato(fonte, codice)), daGiorno };
}

// Quota delle spese con carta non ancora importate che cade nel mese k (divisa in proporzione ai giorni)
function carteNonImportate(k) {
  const out = [];
  for (const fonte of Object.keys(CHIUSURA)) {
    const c = spesoCarta(fonte);
    if (!c || !c.nonImportato || c.daGiorno > c.data) continue;
    const tot = giorniTra(c.daGiorno, c.data) + 1;
    const da = c.daGiorno > `${k}-01` ? c.daGiorno : `${k}-01`, a = c.data < `${k}-${ultimoGiorno(k)}` ? c.data : `${k}-${ultimoGiorno(k)}`;
    const nel = da <= a ? giorniTra(da, a) + 1 : 0;
    if (nel) out.push({ id: `stima-${fonte}`, fonte, data: a, tipo: 'normale', categoria: 'Carta (inserito a mano)', importo: -Math.round(c.nonImportato * nel / tot * 100) / 100 });
  }
  return out;
}

/* ---------- Calendario: festivi e giorni di stipendio ---------- */

function pasqua(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return `${y}-${String(Math.floor(n / 31)).padStart(2, '0')}-${String(n % 31 + 1).padStart(2, '0')}`;
}
const FESTE = ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'];
function festivo(iso) {
  const w = toDate(iso).getUTCDay();
  if (w === 0 || w === 6 || FESTE.includes(iso.slice(5))) return true;
  return iso === piuGiorni(pasqua(Number(iso.slice(0, 4))), 1);   // Pasquetta
}
function lavorativoPrima(iso) { while (festivo(iso)) iso = piuGiorni(iso, -1); return iso; }

const dataStipendio = (st, k) => lavorativoPrima(`${k}-${String(k.endsWith('-12') ? GIORNO_DICEMBRE : st.giorno).padStart(2, '0')}`);
const movStipendio = st => listaMov().filter(m => m.fonte === 'conto_hb' && m.importo > 0 && m.categoria === 'Stipendi' && norm(m.descrizione).includes(st.cerca));

// Importo atteso. MetLife: dalle buste paga (stipendio.js: netto della busta del mese k se c'è già, altrimenti
// netto tipico più 14ª a giugno e 13ª a dicembre). Altrimenti (e per il Ministero): mediana degli ultimi 6 mesi
// (escluso dicembre), prendendo per ogni mese l'accredito più alto.
function importoStipendio(st, k = null) {
  if (st.id === 'metlife' && typeof nettoMetlife === 'function') { const v = nettoMetlife(k); if (v) return v; }
  // dicembre (con la tredicesima): gli accrediti del dicembre precedente
  if (k && k.endsWith('-12')) {
    const prec = movStipendio(st).filter(m => ym(m.data) === ymAdd(k, -12));
    if (prec.length) return sommaImp(prec);
  }
  const perMese = {};
  for (const m of movStipendio(st)) { const k = ym(m.data); if (!k.endsWith('-12')) perMese[k] = Math.max(perMese[k] || 0, m.importo); }
  const ultimi = Object.keys(perMese).sort().slice(-6).map(k => perMese[k]);
  return ultimi.length ? mediana(ultimi) : 0;
}
// Lo stipendio del mese k è già sul conto?
const stipendioArrivato = (st, k) => { const d = dataStipendio(st, k); return movStipendio(st).some(m => Math.abs(giorniTra(d, m.data)) <= 6); };

/* ---------- Spese variabili ---------- */

// Movimenti abbinati alle spese fisse del mese k (non sono spese variabili, anche se pagati con una carta)
function idFissiDelMese(k) {
  const voci = tutteLeVoci().filter(s => attivaNelMese(s, k));
  const abb = abbinaMese(k, voci);
  return new Set([...abb.values()].map(m => m.id));
}

// Spese variabili del mese k: uscite normali tranne fisse, bollette e rate, meno i rimborsi
function variabiliDelMese(k, fissi = idFissiDelMese(k)) {
  const l = listaMov().filter(m => m.tipo === 'normale' && ym(m.data) === k && !fissi.has(m.id) && !CATEGORIE_FISSE.includes(m.categoria)
    && m.categoria !== STRAORDINARIE && (m.importo < 0 || m.categoria === 'Rimborsi'));
  l.push(...carteNonImportate(k));
  return { totale: -sommaImp(l), lista: l };
}

// Spese straordinarie del mese k (fuori tetto)
const straordinarieDelMese = k => -sommaImp(listaMov().filter(m => m.tipo === 'normale' && ym(m.data) === k && m.categoria === STRAORDINARIE));

// Risparmio del mese k: tutte le entrate meno tutte le uscite (giroconti e addebiti delle carte esclusi)
function risparmioDelMese(k) {
  const l = [...listaMov().filter(m => m.tipo === 'normale' && ym(m.data) === k), ...carteNonImportate(k)];
  return { entrate: sommaImp(l.filter(m => m.importo > 0)), uscite: -sommaImp(l.filter(m => m.importo < 0)), netto: sommaImp(l) };
}

// Statistiche degli ultimi 12 mesi completi (per proporre il tetto e stimare le spese quotidiane)
function statsVariabili() {
  const oggi = oggiRoma(), k0 = ym(oggi);
  const mesi = [];
  for (let i = 12; i >= 1; i--) mesi.push(ymAdd(k0, -i));
  const righe = mesi.map(k => ({ k, ...variabiliDelMese(k) }));
  const conDati = righe.filter(r => r.lista.length);
  // quota delle spese variabili che esce direttamente dal conto (il resto passa dalle carte e si paga il mese dopo)
  const tot = sommaImp(conDati, r => r.totale);
  const dalConto = sommaImp(conDati, r => -sommaImp(r.lista.filter(m => m.fonte === 'conto_hb')));
  return {
    mediana: conDati.length ? mediana(conDati.map(r => r.totale)) : 0,
    media: conDati.length ? tot / conDati.length : 0,
    quotaConto: tot > 0 ? Math.min(1, Math.max(0, dalConto / tot)) : 0.4,
    righe,
  };
}

// Spese fisse del mese k (tutte, anche quelle pagate con le carte) e media mensile delle bollette dell'ultimo anno
function fisseDelMese(k) { return sommaImp(tutteLeVoci().filter(s => attivaNelMese(s, k))); }
function bolletteMediaMese() {
  const da = piuGiorni(oggiRoma(), -365);
  const l = (typeof bollette !== 'undefined' ? bollette : []).filter(b => b.periodo_al >= da && b.categoria === 'bolletta');
  return sommaImp(l) / 12;
}

/* ---------- Fino allo stipendio ---------- */

// Totale stimato di un estratto carta non ancora caricato: mediana degli ultimi 3 estratti
function stimaEstratto(fonte) {
  const per = {};
  for (const m of listaMov()) if (m.fonte === fonte && /^\d{6}$/.test(m.estratto || '')) per[m.estratto] = (per[m.estratto] || 0) - m.importo;
  const ultimi = Object.keys(per).sort().slice(-3).map(k => per[k]);
  return ultimi.length ? mediana(ultimi) : 0;
}

// Bollette già arrivate ma non ancora pagate (prossime.js guarda solo quelle non ancora arrivate)
function bolletteDaPagare() {
  const oggi = oggiRoma(), out = [];
  for (const t of TIPI) {
    const lista = storico(t);
    if (!lista.length) continue;
    const ritardo = AUTOMATICO[t] ? ritardoPagamento(t, lista).giorni : RITARDO_DEFAULT[t];
    for (const b of lista) {
      if (!b.data_emissione || b.importo <= 0 || giorniTra(b.data_emissione, oggi) > 80) continue;
      const pagata = listaMov().some(x => x.importo < 0 && Math.abs(-x.importo - b.importo) < 0.01 && x.data >= b.data_emissione
        && giorniTra(b.data_emissione, x.data) <= 75 && CHIAVI_PAGAMENTO[t].some(c => norm(x.descrizione).includes(c)));
      if (!pagata) out.push({ tipo: t, codice: b.codice, importo: b.importo, data: piuGiorni(b.data_emissione, ritardo), automatico: AUTOMATICO[t] });
    }
  }
  return out;
}

// Uscite dal conto (e dal prestito Revolut) con data tra dopo "dal" e "al" compreso, non ancora addebitate
function usciteFra(dal, al) {
  const out = [];
  for (let k = ym(piuGiorni(dal, 1)); k <= ym(al); k = ymAdd(k, 1)) {
    // spese fisse
    const voci = tutteLeVoci().filter(s => attivaNelMese(s, k));
    const abb = abbinaMese(k, voci);
    for (const s of voci) {
      const d = dataPrevista(s, k);
      if (!d || d <= dal || d > al || !CONTI_SALDO.includes(s.pagamento) || abb.has(s.id)) continue;
      out.push({ data: d, nome: s.nome, sotto: [s.creditore, s.pagamento === 'revolut' ? 'da Revolut' : null].filter(Boolean).join(' · '), importo: s.importo, colore: TIPI_SF[s.tipo].colore });
    }
    // addebiti delle carte sul conto
    for (const v of vociCarte().filter(s => attivaNelMese(s, k) && CONTI_SALDO.includes(s.pagamento))) {
      const c = cartaDelMese(v, k), d = dataPrevista(c, k);
      if (!d || d <= dal || d > al || c.importo === 0 || abbinaMese(k, [c]).has(c.id)) continue;
      let stimato = c.importo == null, importo = c.importo, sotto = `estratto di ${nomeEstratto(v, k)}`;
      if (stimato) {
        const sp = spesoCarta(v.estratto_carta);
        if (sp && sp.codice === codiceEstratto(v, k)) {
          importo = sp.totale; stimato = sp.mancanti > 0;
          sotto += sp.mancanti ? `: speso ${eur0.format(sp.speso)} al ${fmtGiorno(sp.data)} + stima fino al ${fmtGiorno(sp.fine)}` : `: speso ${eur0.format(sp.speso)}, estratto chiuso`;
        } else {
          importo = stimaEstratto(v.estratto_carta);
          sotto += ' non ancora caricato: stima';
        }
        if (!importo) continue;
      }
      out.push({ data: d, nome: v.nome, sotto, importo, stimato, colore: TIPI_SF.carta.colore });
    }
  }
  // bollette: già arrivate e da arrivare
  const boll = [
    ...bolletteDaPagare().map(b => ({ ...b, nomeP: b.codice, arrivata: true })),
    ...prossimeBollette().map(r => ({ tipo: r.tipo, codice: r.codice, importo: Math.max(0, Math.round(r.stima)), data: r.dataPagamento, automatico: r.automatico, nomeP: nomePeriodo(r) })),
  ];
  for (const b of boll) {
    if (b.data <= dal || b.data > al || !b.importo) continue;
    out.push({ data: b.data, nome: `Bolletta ${NOMI[b.tipo].toLowerCase()}`, sotto: `${b.arrivata ? 'arrivata' : 'stima'}${b.automatico ? ', addebito diretto' : ', da pagare a mano'}`, importo: b.importo, stimato: !b.arrivata, colore: `--${b.tipo}` });
  }
  return out.sort((a, b) => a.data.localeCompare(b.data) || b.importo - a.importo);
}

// Periodi tra uno stipendio e l'altro, a partire da "base" (data del saldo, o ieri se il saldo non c'è)
function periodiStipendio(base) {
  const eventi = [];
  for (let i = 0; i < 3; i++) {
    const k = ymAdd(ym(piuGiorni(base, 1)), i);
    for (const st of STIPENDI) {
      const d = dataStipendio(st, k);
      if (d > base && !stipendioArrivato(st, k)) eventi.push({ data: d, st, importo: importoStipendio(st, k) });
    }
  }
  eventi.sort((a, b) => a.data.localeCompare(b.data));
  const periodi = [];
  let dal = base;
  for (const e of eventi.slice(0, 3)) {
    const al = piuGiorni(e.data, -1);   // le spese del giorno dello stipendio passano al periodo dopo
    periodi.push({ dal, al, stipendio: e, uscite: usciteFra(dal, al) });
    dal = al;
  }
  return periodi;
}

/* ---------- Disegno ---------- */

function renderBudget() {
  const sez = $('#section-budget');
  if (!sez || sez.hidden || typeof tutteLeVoci !== 'function') return;
  const oggi = oggiRoma(), k = ym(oggi);
  const stats = statsVariabili();
  renderStipendio(stats);
  renderBudgetMese(k, stats);
  renderPrevisione(ymAdd(k, 1), stats);
  renderBudgetStorico(stats);
  $('#bg-imposta-btn').textContent = budgetDel(k) ? 'Modifica budget' : 'Imposta budget';
}

function rigaUscita(u) {
  return `<div class="pross-riga">
    <i class="dot" style="background:var(${u.colore})"></i>
    <div class="pross-desc">
      <div><strong>${esc(u.nome)}</strong></div>
      <div class="pross-date">${fmtGiorno(u.data)}${u.sotto ? ` · ${esc(u.sotto)}` : ''}</div>
    </div>
    <div class="pross-importo"><span>${u.stimato ? '~' : ''}${eur.format(u.importo)}</span></div>
  </div>`;
}

function renderStipendio(stats) {
  const oggi = oggiRoma();
  const saldo = ultimoSaldo();
  // il saldo inserito comprende già gli addebiti fino al giorno prima: quelli del giorno stesso si contano ancora (per prudenza)
  const base = piuGiorni(saldo ? saldo.data : oggi, -1);
  const periodi = periodiStipendio(base);
  if (!periodi.length) { $('#bg-stip-kpis').innerHTML = '<p class="muted">Nessuno stipendio trovato nei Movimenti.</p>'; return; }
  const b = budgetDel(ym(oggi));
  // spese quotidiane pagate direttamente dal conto (prelievi, bonifici, Revolut…): quota del tetto per i giorni del periodo
  const quotidiane = p => {
    if (!b) return 0;
    const inizio = p.dal > oggi ? p.dal : piuGiorni(oggi, -1);
    const gg = Math.max(0, giorniTra(inizio, p.al));
    return Math.round(b.tetto_variabili * stats.quotaConto / 30 * gg);
  };

  // saldo di partenza: ultimo saldo inserito + movimenti del conto importati dopo quella data
  let corrente = null;
  if (saldo) corrente = saldo.saldo + sommaImp(listaMov().filter(m => m.fonte === 'conto_hb' && m.data > saldo.data));
  const p1 = periodi[0];
  const fisse1 = sommaImp(p1.uscite), q1 = quotidiane(p1);
  $('#bg-stip-titolo').textContent = `Fino allo stipendio del ${fmtGiorno(p1.stipendio.data)}`;
  $('#bg-stip-sotto').textContent = `${p1.stipendio.st.nome.replace('Stipendio ', 'stipendio ')}, ~${eur0.format(p1.stipendio.importo)} · addebiti dal ${fmtGiorno(piuGiorni(p1.dal, 1))} al ${fmtGiorno(p1.al)}`;

  let kpi = `
    <div class="kpi"><div class="label">Addebiti da coprire</div><div class="value">${eur0.format(fisse1)}</div><div class="sub">${p1.uscite.length} addebiti</div></div>
    <div class="kpi"><div class="label">Con le spese quotidiane</div><div class="value">${b ? eur0.format(fisse1 + q1) : '–'}</div><div class="sub">${b ? `~${eur0.format(q1)} di spese dal conto` : 'imposta il budget'}</div></div>`;
  if (corrente != null) {
    const resta = corrente - fisse1 - q1;
    kpi += `
    <div class="kpi"><div class="label">Sul conto ora</div><div class="value">${eur0.format(corrente)}</div><div class="sub">saldo del ${fmtGiorno(saldo.data)}${corrente !== saldo.saldo ? ' + movimenti dopo' : ''}</div></div>
    <div class="kpi ${resta < 0 ? 'bg-rosso' : 'bg-verde'}"><div class="label">${resta < 0 ? 'Mancano' : 'Ti restano'}</div><div class="value">${eur0.format(Math.abs(resta))}</div><div class="sub">il ${fmtGiorno(p1.al)}, prima dello stipendio</div></div>`;
  } else {
    kpi += `<div class="kpi bg-saldo-vuoto"><div class="label">Sul conto ora</div><div class="value">?</div><div class="sub"><button type="button" class="link-btn" data-saldo>Inserisci il saldo</button> per sapere se basta</div></div>`;
  }
  $('#bg-stip-kpis').innerHTML = kpi;
  $('#bg-stip-lista').innerHTML = p1.uscite.length ? p1.uscite.map(rigaUscita).join('') : '<p class="muted">Nessun addebito previsto fino allo stipendio.</p>';

  // periodi successivi, con il saldo che si porta avanti
  let s = corrente != null ? corrente - fisse1 - q1 : null;
  const dopo = periodi.slice(1).map((p, i) => {
    const prima = periodi[i].stipendio;
    if (s != null) s += prima.importo;
    const f = sommaImp(p.uscite), q = quotidiane(p);
    if (s != null) s -= f + q;
    return `<details class="bg-periodo">
      <summary><span><strong>Dal ${fmtGiorno(prima.data)} al ${fmtGiorno(p.al)}</strong><small>dopo lo ${prima.st.nome.toLowerCase()} (~${eur0.format(prima.importo)})</small></span>
        <span class="bg-periodo-num">${eur0.format(f)}${s != null ? `<small>resta ~${eur0.format(s)}</small>` : ''}</span></summary>
      <div class="pross-lista">${p.uscite.length ? p.uscite.map(rigaUscita).join('') : '<p class="muted">Nessun addebito previsto.</p>'}</div>
    </details>`;
  }).join('');
  $('#bg-stip-dopo').innerHTML = dopo;
  const agg = ['conto_hb', 'carta_hb', 'amex', 'revolut'].map(f => [f, ultimaDataFonte(f)]).filter(([, d]) => d);
  $('#bg-stip-foot').textContent = `Conta gli addebiti sul conto Hello (spese fisse, bollette, carta Hello e Amex) e il prestito Revolut, non ancora trovati nei Movimenti. `
    + `Le spese del giorno dello stipendio passano al periodo dopo. Se il giorno cade di sabato, domenica o festivo, lo stipendio arriva il giorno lavorativo prima; a dicembre verso il 15. `
    + `Movimenti importati fino al: ${agg.map(([f, d]) => `${PAGAMENTI_SF[f]} ${fmtGiorno(d)}`).join(', ')}.`;
}

function renderBudgetMese(k, stats) {
  const oggi = oggiRoma(), b = budgetDel(k);
  const nome = ymNome(k);
  $('#bg-mese-titolo').textContent = nome.replace(/^./, c => c.toUpperCase());
  const entrate = sommaImp(STIPENDI, st => importoStipendio(st, k));
  const fisse = fisseDelMese(k) + bolletteMediaMese();
  const v = variabiliDelMese(k), r = risparmioDelMese(k), straord = straordinarieDelMese(k);
  const giorniMese = ultimoGiorno(k), oggiG = Number(oggi.slice(8));
  if (!b) {
    $('#bg-period').textContent = 'Budget non ancora impostato';
    $('#bg-mese-kpis').innerHTML = `
      <div class="kpi"><div class="label">Entrate previste</div><div class="value">${eur0.format(entrate)}</div><div class="sub">i due stipendi</div></div>
      <div class="kpi"><div class="label">Spese fisse e bollette</div><div class="value">${eur0.format(fisse)}</div><div class="sub">al mese</div></div>
      <div class="kpi"><div class="label">Spese variabili tipiche</div><div class="value">${eur0.format(stats.mediana)}</div><div class="sub">mediana degli ultimi 12 mesi</div></div>
      <div class="kpi"><div class="label">Resterebbe</div><div class="value">${eur0.format(entrate - fisse - stats.mediana)}</div><div class="sub">al mese</div></div>`;
    $('#bg-barre').innerHTML = `<p class="muted">Imposta il tetto delle spese variabili e l’obiettivo di risparmio: ti propongo già i valori di partenza. <button type="button" class="link-btn" data-imposta>Imposta budget</button></p>`;
    $('#bg-mese-foot').textContent = '';
    return;
  }
  const previsto = entrate - fisse - b.tetto_variabili;
  $('#bg-period').textContent = `Tetto ${eur0.format(b.tetto_variabili)} al mese · obiettivo di risparmio ${eur0.format(b.obiettivo_risparmio)}`;
  $('#bg-mese-kpis').innerHTML = `
    <div class="kpi"><div class="label">Entrate previste</div><div class="value">${eur0.format(entrate)}</div><div class="sub">finora ${eur0.format(r.entrate)}</div></div>
    <div class="kpi"><div class="label">Spese fisse e bollette</div><div class="value">${eur0.format(fisse)}</div><div class="sub">bollette come media dell’ultimo anno</div></div>
    <div class="kpi"><div class="label">Tetto spese variabili</div><div class="value">${eur0.format(b.tetto_variabili)}</div><div class="sub">finora ${eur0.format(v.totale)}</div></div>
    <div class="kpi ${previsto < b.obiettivo_risparmio ? 'bg-rosso' : 'bg-verde'}"><div class="label">Risparmio previsto</div><div class="value">${eur0.format(previsto)}</div><div class="sub">obiettivo ${eur0.format(b.obiettivo_risparmio)}</div></div>`;

  const pctV = b.tetto_variabili ? v.totale / b.tetto_variabili : 0;
  const pctOggi = oggiG / giorniMese;
  const restaV = b.tetto_variabili - v.totale, ggRestano = giorniMese - oggiG + 1;
  const statoV = pctV > 1 ? 'rosso' : pctV > pctOggi + 0.1 ? 'giallo' : 'verde';
  const pctR = b.obiettivo_risparmio > 0 ? Math.max(0, r.netto) / b.obiettivo_risparmio : 1;
  $('#bg-barre').innerHTML = `
    ${barra('Spese variabili', `${eur0.format(v.totale)} di ${eur0.format(b.tetto_variabili)}`, pctV, pctOggi, statoV,
      restaV >= 0 ? `Ti restano ${eur0.format(restaV)} per ${ggRestano} giorni, circa ${eur0.format(restaV / ggRestano)} al giorno.` : `Hai superato il tetto di ${eur0.format(-restaV)}.`)}
    ${b.obiettivo_risparmio > 0 ? barra('Risparmio del mese', `${eur0.format(r.netto)} di ${eur0.format(b.obiettivo_risparmio)}`, pctR, null, pctR >= 1 ? 'verde' : 'neutro',
      `Entrate ${eur0.format(r.entrate)} meno uscite ${eur0.format(r.uscite)} finora. Si legge bene a fine mese, dopo gli stipendi.`) : ''}
    ${straord > 0 ? `<div class="bg-straord"><strong>Spese straordinarie</strong><span>${eur0.format(straord)}</span><small>fuori dal tetto, ma contano nel risparmio</small></div>` : ''}`;
  const inserite = Object.keys(CHIUSURA).map(spesoCarta).filter(Boolean);
  const carte = ['carta_hb', 'amex'].filter(f => !inserite.some(c => c.fonte === f)).map(f => [f, ultimaDataFonte(f)]).filter(([, d]) => d && d < oggi);
  $('#bg-mese-foot').textContent = `Spese variabili = tutte le uscite tranne spese fisse, bollette, condominio, rate, abbonamenti e straordinarie; i rimborsi le riducono. `
    + `La tacca sulla barra indica dove dovresti essere oggi. `
    + (inserite.length ? `Speso con le carte inserito a mano: ${inserite.map(c => `${NOMI_CARTE[c.fonte]} ${eur0.format(c.speso)} al ${fmtGiorno(c.data)}`).join(', ')} (la parte non ancora importata è divisa per giorni). ` : '')
    + (carte.length ? `Le carte entrano con gli estratti: ${carte.map(([f, d]) => `${PAGAMENTI_SF[f]} fino al ${fmtGiorno(d)}`).join(', ')}.` : '');
}

// Box del mese successivo: entrate (a dicembre con la tredicesima), spese fisse del mese, bollette previste in pagamento, tetto
function bolletteDelMese(k) {
  const l = [
    ...bolletteDaPagare().map(b => ({ ...b, nomeP: nomeBolletta(b), arrivata: true })),
    ...prossimeBollette().map(r => ({ tipo: r.tipo, importo: Math.max(0, Math.round(r.stima)), data: r.dataPagamento, automatico: r.automatico, nomeP: nomePeriodo(r) })),
  ];
  return l.filter(b => ym(b.data) === k && b.importo > 0).sort((a, b) => a.data.localeCompare(b.data));
}
const nomeBolletta = b => b.tipo === 'acqua' ? `${b.codice.slice(4)}° trimestre ${b.codice.slice(0, 4)}` : nomeBimestre(b.codice);

function renderPrevisione(k, stats) {
  const b = budgetDel(k);
  $('#bg-prev-titolo').textContent = `Previsione ${ymNome(k)}`;
  const entrate = sommaImp(STIPENDI, st => importoStipendio(st, k));
  const fisse = fisseDelMese(k);
  const boll = bolletteDelMese(k), totBoll = sommaImp(boll);
  const variabili = b ? b.tetto_variabili : stats.mediana;
  const previsto = entrate - fisse - totBoll - variabili;
  const dic = k.endsWith('-12');
  const date = STIPENDI.map(st => fmtGiorno(dataStipendio(st, k)));
  $('#bg-prev-kpis').innerHTML = `
    <div class="kpi"><div class="label">Entrate previste</div><div class="value">${eur0.format(entrate)}</div><div class="sub">${dic ? `con la tredicesima, verso il ${date[0]}` : `il ${date.join(' e il ')}`}</div></div>
    <div class="kpi"><div class="label">Spese fisse</div><div class="value">${eur0.format(fisse)}</div><div class="sub">del mese, comprese le annuali</div></div>
    <div class="kpi"><div class="label">Bollette previste</div><div class="value">${totBoll ? '~' + eur0.format(totBoll) : '–'}</div><div class="sub">${boll.length ? `${boll.length} in pagamento nel mese` : 'nessuna prevista per ora'}</div></div>
    <div class="kpi ${b && previsto < b.obiettivo_risparmio ? 'bg-rosso' : 'bg-verde'}"><div class="label">Risparmio previsto</div><div class="value">${eur0.format(previsto)}</div><div class="sub">${b ? `con il tetto di ${eur0.format(variabili)} · obiettivo ${eur0.format(b.obiettivo_risparmio)}` : `con spese variabili tipiche di ${eur0.format(variabili)}`}</div></div>`;
  $('#bg-prev-bollette').innerHTML = boll.map(x => rigaUscita({ data: x.data, nome: `Bolletta ${NOMI[x.tipo].toLowerCase()} · ${x.nomeP}`, sotto: `${x.arrivata ? 'arrivata' : 'stima'}${x.automatico ? ', addebito diretto' : ', da pagare a mano'}`, importo: x.importo, stimato: !x.arrivata, colore: `--${x.tipo}` })).join('');
  const nuoveFisse = tutteLeVoci().filter(s => attivaNelMese(s, k) && !attivaNelMese(s, ymAdd(k, -1)));
  const finite = tutteLeVoci().filter(s => !attivaNelMese(s, k) && attivaNelMese(s, ymAdd(k, -1)) && s.frequenza === 'mensile');
  $('#bg-prev-foot').textContent = (dic ? 'A dicembre gli stipendi arrivano verso il 15: per il Ministero vale l’accredito di dicembre dell’anno scorso, per MetLife il netto tipico più l’ultima tredicesima. ' : '')
    + (nuoveFisse.length ? `Spese che ci sono solo in questo mese o iniziano ora: ${nuoveFisse.map(s => `${s.nome} ${eur0.format(s.importo)}`).join(', ')}. ` : '')
    + (finite.length ? `Finite il mese prima: ${finite.map(s => s.nome).join(', ')}. ` : '')
    + 'Le spese straordinarie non sono previste.';
}

function barra(titolo, valore, pct, tacca, stato, nota) {
  return `<div class="bg-barra ${stato}">
    <div class="bg-barra-head"><strong>${titolo}</strong><span>${valore}</span></div>
    <div class="bg-barra-fondo"><i style="width:${Math.min(100, Math.max(0, pct * 100)).toFixed(1)}%"></i>${tacca != null ? `<b style="left:${(tacca * 100).toFixed(1)}%" title="dove dovresti essere oggi"></b>` : ''}</div>
    <div class="bg-barra-nota">${nota}</div>
  </div>`;
}

function renderBudgetStorico(stats) {
  $$('#bg-vista button').forEach(b => b.classList.toggle('on', b.dataset.vista === bgVista));
  const k0 = ym(oggiRoma());
  const righe = [...stats.righe, { k: k0, ...variabiliDelMese(k0) }];
  const labels = righe.map(r => `${MESI[Number(r.k.slice(5)) - 1]} ${r.k.slice(2, 4)}`);
  const opts = baseOptions();
  opts.scales.y.ticks.callback = v => eur0.format(v);
  let datasets, foot;
  if (bgVista === 'variabili') {
    const tetti = righe.map(r => budgetDel(r.k)?.tetto_variabili ?? null);
    const straord = righe.map(r => Math.round(straordinarieDelMese(r.k)));
    datasets = [
      { type: 'bar', label: 'Spese variabili', stack: 's', data: righe.map(r => Math.round(r.totale)), backgroundColor: righe.map((r, i) => tetti[i] != null && r.totale > tetti[i] ? css('--uscite') : css('--rete')), borderRadius: 4, maxBarThickness: 40 },
      { type: 'bar', label: 'Straordinarie', stack: 's', data: straord.map(v => v || null), backgroundColor: css('--str'), borderRadius: 4, maxBarThickness: 40 },
      { type: 'line', label: 'Tetto', stack: 't', data: tetti, borderColor: css('--accent'), borderDash: [5, 4], pointRadius: 0, stepped: 'middle', spanGaps: false },
    ];
    opts.scales.x.stacked = true; opts.scales.y.stacked = true;
    foot = `Mediana degli ultimi 12 mesi: ${eur0.format(stats.mediana)} al mese, senza le straordinarie (in viola, fuori dal tetto). In rosso i mesi oltre il tetto. Il mese in corso è parziale.`;
  } else {
    const ris = righe.map(r => risparmioDelMese(r.k).netto);
    const obiettivi = righe.map(r => budgetDel(r.k)?.obiettivo_risparmio ?? null);
    datasets = [
      { type: 'bar', label: 'Risparmio', data: ris.map(Math.round), backgroundColor: ris.map(v => v >= 0 ? css('--entrate') : css('--uscite')), borderRadius: 4, maxBarThickness: 40 },
      { type: 'line', label: 'Obiettivo', data: obiettivi, borderColor: css('--accent'), borderDash: [5, 4], pointRadius: 0, stepped: 'middle', spanGaps: false },
    ];
    opts.scales.y.beginAtZero = true;
    const validi = ris.slice(0, -1);
    foot = `Risparmio = entrate meno uscite del mese (i passaggi tra i tuoi conti non contano). Media degli ultimi 12 mesi: ${eur0.format(validi.reduce((a, b) => a + b, 0) / Math.max(1, validi.length))}. Il mese in corso è parziale.`;
  }
  opts.plugins.tooltip.callbacks = { label: c => c.parsed.y == null ? null : ` ${c.dataset.label}: ${eur0.format(c.parsed.y)}` };
  disegna('chart-bg', { type: 'bar', data: { labels, datasets }, options: opts });
  $('#bg-storico-foot').textContent = foot;
}

/* ---------- Eventi e finestre ---------- */

$('#bg-vista').addEventListener('click', e => { const v = e.target.closest('[data-vista]')?.dataset.vista; if (v) { bgVista = v; renderBudgetStorico(statsVariabili()); } });

const bgDlg = $('#bg-dialog'), bgForm = $('#bg-form');
function apriBudget() {
  const k = ym(oggiRoma()), b = budgetDel(k), stats = statsVariabili();
  const entrate = sommaImp(STIPENDI, st => importoStipendio(st)), fisse = fisseDelMese(k) + bolletteMediaMese();
  bgForm.reset();
  bgForm.elements.tetto_variabili.value = b ? b.tetto_variabili : Math.round(stats.mediana / 50) * 50;
  bgForm.elements.obiettivo_risparmio.value = b?.obiettivo_risparmio ?? Math.max(0, Math.floor((entrate - fisse - Number(bgForm.elements.tetto_variabili.value)) / 50) * 50);
  bgForm.elements.valido_dal.value = k;
  $('#bg-message').textContent = '';
  const info = () => {
    const t = Number(bgForm.elements.tetto_variabili.value) || 0, o = Number(bgForm.elements.obiettivo_risparmio.value) || 0;
    const resta = entrate - fisse - t;
    $('#bg-dialog-info').innerHTML = `<span>Entrate ~${eur0.format(entrate)} − fisse e bollette ~${eur0.format(fisse)} − tetto ${eur0.format(t)}</span>
      <strong>Risparmio previsto ${eur0.format(resta)} al mese</strong>
      <span class="${resta < o ? 'testo-rosso' : ''}">${resta < o ? `Sotto l’obiettivo: per risparmiare ${eur0.format(o)} il tetto dovrebbe essere al massimo ${eur0.format(Math.max(0, entrate - fisse - o))}.` : 'Obiettivo raggiungibile.'}</span>
      <span>Spese variabili negli ultimi 12 mesi: mediana ${eur0.format(stats.mediana)}, media ${eur0.format(stats.media)}.</span>`;
  };
  bgForm.oninput = info; info();
  bgDlg.showModal();
}
$('#bg-imposta-btn').addEventListener('click', apriBudget);
bgDlg.querySelector('[data-close]').addEventListener('click', () => bgDlg.close());
bgForm.addEventListener('submit', async e => {
  e.preventDefault();
  const f = bgForm.elements;
  const r = { valido_dal: `${f.valido_dal.value}-01`, tetto_variabili: Number(f.tetto_variabili.value), obiettivo_risparmio: Number(f.obiettivo_risparmio.value) };
  $('#bg-message').textContent = 'Salvataggio…';
  const { error } = await sb.from('casa_budget').upsert(r, { onConflict: 'user_id,valido_dal' });
  if (error) { $('#bg-message').textContent = 'Errore: ' + error.message; return; }
  bgDlg.close(); await caricaBudget();
});

const saldoDlg = $('#saldo-dialog'), saldoForm = $('#saldo-form');
function aggiornaSaldoForm() {
  const carta = saldoForm.elements.conto.value !== 'conto_hb';
  $('#saldo-label').firstChild.textContent = carta ? 'Speso dall’ultimo estratto €' : 'Saldo €';
  saldoForm.elements.saldo.min = carta ? '0' : '';
  $('#saldo-aiuto').textContent = carta
    ? `Quanto hai speso con la carta dall’ultimo estratto (chiude il ${CHIUSURA[saldoForm.elements.conto.value]} di ogni mese), come lo vedi nell’app della banca. Serve finché non importi il PDF dell’estratto.`
    : 'Il saldo disponibile che vedi nell’app della banca. Da qui in poi l’app aggiunge i movimenti del conto che importi con data successiva.';
}
function apriSaldo() {
  saldoForm.reset();
  saldoForm.elements.data.value = oggiRoma();
  aggiornaSaldoForm();
  $('#saldo-message').textContent = '';
  saldoDlg.showModal();
  saldoForm.elements.saldo.focus();
}
$('#bg-saldo-btn').addEventListener('click', apriSaldo);
saldoForm.elements.conto.addEventListener('change', aggiornaSaldoForm);
saldoDlg.querySelector('[data-close]').addEventListener('click', () => saldoDlg.close());
saldoForm.addEventListener('submit', async e => {
  e.preventDefault();
  const r = { conto: saldoForm.elements.conto.value, data: saldoForm.elements.data.value, saldo: Number(saldoForm.elements.saldo.value) };
  $('#saldo-message').textContent = 'Salvataggio…';
  const { error } = await sb.from('casa_saldi').upsert(r, { onConflict: 'user_id,conto,data' });
  if (error) { $('#saldo-message').textContent = 'Errore: ' + error.message; return; }
  saldoDlg.close(); await caricaBudget();
});
$('#section-budget').addEventListener('click', e => {
  if (e.target.closest('[data-saldo]')) apriSaldo();
  if (e.target.closest('[data-imposta]')) apriBudget();
});

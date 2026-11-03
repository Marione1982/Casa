// Casa – sezione Movimenti: conto corrente, carte di credito (e in futuro Revolut).
// Usa le funzioni e le variabili globali di app.js (sb, $, $$, eur, eur0, esc, fmtData, baseOptions, disegna, css, MESI…).
'use strict';

const FONTI = { conto_hb: 'Conto Hello', carta_hb: 'Carta Hello', amex: 'Amex', revolut: 'Revolut' };
const CATEGORIE_USCITA = ['Spesa', 'Ristoranti e bar', 'Casa', 'Utenze', 'Condominio', 'Finanziamenti', 'Trasporti', 'Salute',
  'Abbonamenti', 'Shopping', 'Sport e svago', 'Viaggi', 'Istruzione', 'Bonifici', 'Contanti', 'Banca e tasse', 'Altro'];
const CATEGORIE_ENTRATA = ['Stipendi', 'Rimborsi', 'Altre entrate'];
const TIPI_MOV = { normale: '', pagamento_carta: 'pagamento carta', giroconto: 'giroconto' };

// Regole di base: se la descrizione contiene il testo (maiuscolo), il movimento va nella categoria.
// Le regole salvate dall'app (casa_regole_categorie) hanno la precedenza. L'ordine conta: vince la prima.
const REGOLE_BASE = [
  // pagamenti delle carte dal conto: non sono spese (le spese sono nei loro estratti)
  ['AMERICAN EXPRESS', 'Altro', 'pagamento_carta'],
  ['ESTRATTO CONTO CARTA', 'Altro', 'pagamento_carta'],
  ['ADDEBITO CARTA DI CREDITO', 'Altro', 'pagamento_carta'],
  ['ADDEBITO SALDO CARTA', 'Altro', 'pagamento_carta'],
  ['UTILIZZO CARTA DI CREDITO', 'Altro', 'pagamento_carta'],
  // entrate
  ['STIPENDI', 'Stipendi'], ['EMOLUMENTI', 'Stipendi'], ['INPS', 'Altre entrate'], ['ASSEGNO UNICO', 'Altre entrate'],
  ['GESTORE DEI SERVIZI ENERGETICI', 'Altre entrate'], ['VERSAMENTO DI CONTANTE', 'Altre entrate'],
  ['RIMBORSO FINANZIAMENTO', 'Finanziamenti'], ['RIF. CIRCUITO', 'Rimborsi'],
  ['RIMBORSO', 'Rimborsi'], ['STORNO', 'Rimborsi'],
  // utenze e casa
  ['EDISON', 'Utenze'], ['AMGAS', 'Utenze'], ['ACQUEDOTTO', 'Utenze'], ['ENEL', 'Utenze'], ['SERVIZIO ELETTRICO', 'Utenze'],
  ['TELECOM', 'Utenze'], ['TIM ', 'Utenze'], ['ILIAD', 'Utenze'], ['VODAFONE', 'Utenze'], ['WINDTRE', 'Utenze'], ['FASTWEB', 'Utenze'],
  ['CONDOMINIO', 'Condominio'], ['QUOTA ORDINARIA', 'Condominio'], ['QUOTE ORDINARIE', 'Condominio'],
  ['PAG PUB', 'Banca e tasse'], ['GOMME', 'Trasporti'], ['POLIAMBULATOR', 'Salute'], ['MOBILI', 'Casa'], ['AGRIEURO', 'Casa'],
  ['ARCAPLANET', 'Casa'], ['GIOIELL', 'Shopping'],
  ['LEROY MERLIN', 'Casa'], ['BRICO', 'Casa'], ['IKEA', 'Casa'], ['CASA MANIA', 'Casa'], ['HAPPY CASA', 'Casa'], ['TECNOMAT', 'Casa'],
  ['VORWERK', 'Casa'], ['FERRAMENTA', 'Casa'], ['EDILSERVICE', 'Casa'], ['BOTANICALS', 'Casa'],
  // finanziamenti
  ['RATA FINANZIAMENTO', 'Finanziamenti'], ['RATA MUTUO', 'Finanziamenti'], ['MUTUO', 'Finanziamenti'], ['FINDOMESTIC', 'Finanziamenti'],
  ['COFIDIS', 'Finanziamenti'], ['AGOS', 'Finanziamenti'], ['SANTANDER', 'Finanziamenti'], ['FIDITALIA', 'Finanziamenti'],
  ['TIMFIN', 'Finanziamenti'], ['PAGA IN 3', 'Finanziamenti'], ['PAYPAL CREDIT', 'Finanziamenti'], ['SCALAPAY', 'Finanziamenti'],
  ['KLARNA', 'Finanziamenti'], ['EROGAZIONE FINANZIAMENTO', 'Altre entrate'],
  // spesa
  ['FAMILA', 'Spesa'], ['MEGAGEST', 'Spesa'], ['COOP', 'Spesa'], ['LIDL', 'Spesa'], ['CONAD', 'Spesa'], ['CARREFOUR', 'Spesa'], ['CRF EXP', 'Spesa'],
  ['ESSELUNGA', 'Spesa'], ['EUROSPIN', 'Spesa'], ['IPER', 'Spesa'], ['SUPERMERCATO', 'Spesa'], ['DISTRIBUZIONE G.M.', 'Spesa'], ['MACELLERIA', 'Spesa'],
  ['PANIFICIO', 'Spesa'], ['FRUTTERIA', 'Spesa'], ['FRUTTI', 'Spesa'], ['FONTE DEL PANE', 'Spesa'], ['TIGOTA', 'Spesa'], ['ALIMENTARI', 'Spesa'],
  ['ENOTECA', 'Spesa'], ['LE DELIZIE DI', 'Spesa'], ['D MODUGNO', 'Spesa'], ['SIGNORILE', 'Spesa'],
  // ristoranti e bar
  ['CAFFE', 'Ristoranti e bar'], ['CAFE', 'Ristoranti e bar'], ['BAR ', 'Ristoranti e bar'], ['COFFEE', 'Ristoranti e bar'], ['GELATERIA', 'Ristoranti e bar'],
  ['PASTICCERIA', 'Ristoranti e bar'], ['RISTORANT', 'Ristoranti e bar'], ['PIZZERIA', 'Ristoranti e bar'], ['TRATTORIA', 'Ristoranti e bar'],
  ['ROSTICCERIA', 'Ristoranti e bar'], ['MC DONALD', 'Ristoranti e bar'], ['MCDONALD', 'Ristoranti e bar'], ['ROADHOUSE', 'Ristoranti e bar'],
  ['FISH BAR', 'Ristoranti e bar'], ['CHEF', 'Ristoranti e bar'], ['TAGLIEROTECA', 'Ristoranti e bar'], ['DELIVEROO', 'Ristoranti e bar'], ['JUST EAT', 'Ristoranti e bar'],
  ['GLOVO', 'Ristoranti e bar'], ['SUSHI', 'Ristoranti e bar'], ['GROTTA BIANCA', 'Ristoranti e bar'],
  // trasporti
  ['TRENITALIA', 'Trasporti'], ['ITALO', 'Trasporti'], ['AUTOSERVIZI', 'Trasporti'], ['AZIENDATRAS', 'Trasporti'], ['MYCICERO', 'Trasporti'],
  ['EASYPARK', 'Trasporti'], ['PARKING', 'Trasporti'], ['TANA DIREZ', 'Trasporti'], ['AUTOSTRAD', 'Trasporti'], ['TELEPASS', 'Trasporti'],
  ['ASPIT', 'Trasporti'], ['TERRAVISION', 'Trasporti'], ['MOBILITA', 'Trasporti'], ['ENI ', 'Trasporti'], ['Q8', 'Trasporti'], ['ESSO', 'Trasporti'],
  ['CARBURANT', 'Trasporti'], ['RYANAIR', 'Viaggi'], ['BOOKING', 'Viaggi'], ['AIRBNB', 'Viaggi'], ['HOTEL', 'Viaggi'],
  // salute
  ['FARMACIA', 'Salute'], ['ANALISI', 'Salute'], ['DIAGNOS', 'Salute'], ['STUDIO DENTIST', 'Salute'], ['SALMOIRAGHI', 'Salute'], ['OTTICA', 'Salute'],
  ['AGRIFARMA', 'Salute'],
  // abbonamenti
  ['NETFLIX', 'Abbonamenti'], ['DISNEY', 'Abbonamenti'], ['SPOTIFY', 'Abbonamenti'], ['SKY', 'Abbonamenti'], ['ITUNES', 'Abbonamenti'],
  ['APPLE.COM', 'Abbonamenti'], ['MICROSOFT', 'Abbonamenti'], ['PLAYSTATION', 'Abbonamenti'], ['BUDDYFIT', 'Abbonamenti'], ['COVERDRONE', 'Abbonamenti'],
  ['PRIME VIDEO', 'Abbonamenti'], ['DAZN', 'Abbonamenti'], ['AUDIBLE', 'Abbonamenti'],
  // shopping
  ['AMAZON', 'Shopping'], ['AMZN', 'Shopping'], ['VINTED', 'Shopping'], ['DECATHLON', 'Shopping'], ['ZARA', 'Shopping'], ['OVS', 'Shopping'],
  ['H&M', 'Shopping'], ['HM IT', 'Shopping'], ['UPIM', 'Shopping'], ['NIKE', 'Shopping'], ['CISALFA', 'Shopping'], ['FLYING TIGER', 'Shopping'],
  ['CARTA PENNA', 'Shopping'], ['CARTOLIBRERIA', 'Istruzione'], ['FACISTORE', 'Shopping'], ['MERCATO DELL INTIMO', 'Shopping'], ['CLIOMAKEUP', 'Shopping'],
  ['PARRUCCHIER', 'Shopping'], ['SALONE DI BELLEZZA', 'Shopping'], ['BEAUTY', 'Shopping'], ['EBAY', 'Shopping'], ['TEMU', 'Shopping'], ['SHEIN', 'Shopping'],
  // sport, svago, istruzione
  ['TENNIS', 'Sport e svago'], ['A.S.D.', 'Sport e svago'], ['ASD ', 'Sport e svago'], ['WATERPOLO', 'Sport e svago'], ['PISCINA', 'Sport e svago'],
  ['PALESTRA', 'Sport e svago'], ['CINEMA', 'Sport e svago'], ['UCI ', 'Sport e svago'], ['VIVATICKET', 'Sport e svago'], ['TICKET', 'Sport e svago'],
  ['LIDO', 'Sport e svago'], ['RUOTA PANORAMICA', 'Sport e svago'], ['ASSOCIAZIONE CULTURALE', 'Sport e svago'],
  ['LEARN AND SPEAK', 'Istruzione'], ['SCUOLA', 'Istruzione'], ['LIBRERIA', 'Istruzione'],
  ['OSTERIA', 'Ristoranti e bar'], ['GYRO', 'Ristoranti e bar'], ['BRACERIA', 'Ristoranti e bar'], ['PANINOTECA', 'Ristoranti e bar'],
  ['EASYJET', 'Viaggi'], ['VILLAGGIO TURISTICO', 'Viaggi'], ['RADIOLOGIA', 'Salute'], ['DR ', 'Salute'], ['DOTT', 'Salute'], ['REVISIONE', 'Trasporti'],
  ['HAIR', 'Shopping'], ['ASOS', 'Shopping'], ['MEDIA WORLD', 'Shopping'], ['MEDIAWORLD', 'Shopping'], ['TEDI ', 'Shopping'], ['GEDIDIGITAL', 'Abbonamenti'],
  // banca, tasse, contanti, bonifici
  ['PRELIEVO', 'Contanti'], ['PREL ', 'Contanti'], ['CANONE CONTO', 'Banca e tasse'], ['IMPOSTA DI BOLLO', 'Banca e tasse'], ['BOLLO', 'Banca e tasse'],
  ['COMMISSION', 'Banca e tasse'], ['INTERESSI', 'Banca e tasse'], ['F24', 'Banca e tasse'], ['PAGOPA', 'Banca e tasse'], ['CBILL', 'Banca e tasse'],
  ['IMPOSTE', 'Banca e tasse'], ['POSTE ITALIANE', 'Banca e tasse'],
  ['BONIFICO', 'Bonifici'],
];
// Categorie stampate da Amex sotto ogni spesa
const CATEGORIE_AMEX = [
  [/supermercat|discount|aliment|panetter|macell|gastronom/i, 'Spesa'],
  [/ristorant|fast food|bar|pasticcer|dolciumi|pizzer|gelater/i, 'Ristoranti e bar'],
  [/ferrament|fai da te|casaling|arredament|goods/i, 'Casa'],
  [/farmac|medic|ottic/i, 'Salute'],
  [/club|sport|ricreativ|cinema|teatr/i, 'Sport e svago'],
  [/abbigliament|calzatur|profumer|grandi magazzini/i, 'Shopping'],
  [/carburant|trasport|parchegg|autostrad/i, 'Trasporti'],
  [/alberg|hotel|viagg|compagnie aeree/i, 'Viaggi'],
];

let movimenti = [];
let regoleUtente = [];
let movState = { fonte: 'tutte', anno: null, categoria: '', cerca: '', mostra: 100 };

/* ---------- Dati ---------- */

async function caricaMovimenti() {
  if (!sb || !currentUser) return;
  const righe = [];
  for (let da = 0; ; da += 1000) {   // Supabase restituisce al massimo 1000 righe per richiesta
    const { data, error } = await sb.from('casa_movimenti').select('*').order('data', { ascending: false }).order('id').range(da, da + 999);
    if (error) { console.warn('Movimenti non disponibili:', error.message); return; }
    righe.push(...data);
    if (data.length < 1000) break;
  }
  movimenti = righe.map(r => ({ ...r, importo: Number(r.importo) }));
  const { data: reg } = await sb.from('casa_regole_categorie').select('*');
  regoleUtente = reg || [];
  renderMovimenti();
}

const contaNeiTotali = m => m.tipo === 'normale';
const movFiltrati = () => movimenti.filter(m => (movState.fonte === 'tutte' || m.fonte === movState.fonte) && (movState.anno === 'tutti' || m.data.startsWith(movState.anno)));

/* ---------- Categorie ---------- */

const norm = s => String(s || '').toUpperCase().replace(/\s+/g, ' ');
function categorizza(m) {
  const d = norm(m.descrizione);
  const r = regoleUtente.find(x => d.includes(norm(x.testo)));
  if (r) return { categoria: r.categoria, tipo: r.tipo };
  const b = REGOLE_BASE.find(([t]) => d.includes(t));
  let categoria = b?.[1], tipo = b?.[2] || 'normale';
  if (!b && m.categoria_amex) categoria = CATEGORIE_AMEX.find(([re]) => re.test(m.categoria_amex))?.[1];
  // le entrate non finiscono in una categoria di spesa (es. un rimborso Amazon)
  if (m.importo > 0 && tipo === 'normale' && !CATEGORIE_ENTRATA.includes(categoria)) categoria = m.fonte === 'conto_hb' ? 'Altre entrate' : 'Rimborsi';
  if (m.importo < 0 && CATEGORIE_ENTRATA.includes(categoria)) categoria = 'Altro';
  if (!categoria) categoria = m.importo > 0 ? 'Altre entrate' : 'Altro';
  return { categoria, tipo };
}

/* ---------- Rendering ---------- */

function renderMovimenti() {
  const anni = [...new Set(movimenti.map(m => m.data.slice(0, 4)))].sort().reverse();
  if (movState.anno === null || (movState.anno !== 'tutti' && !anni.includes(movState.anno))) movState.anno = anni[0] || 'tutti';
  $('#mov-anno').innerHTML = `<option value="tutti">Tutti gli anni</option>` + anni.map(y => `<option value="${y}" ${movState.anno === y ? 'selected' : ''}>${y}</option>`).join('');
  const fonti = Object.keys(FONTI).filter(f => movimenti.some(m => m.fonte === f));
  $('#mov-fonte').innerHTML = [['tutte', 'Tutti'], ...fonti.map(f => [f, FONTI[f]])]
    .map(([k, n]) => `<button type="button" data-fonte="${k}" class="${movState.fonte === k ? 'on' : ''}">${n}</button>`).join('');

  if (!movimenti.length) {
    $('#mov-period').textContent = 'Nessun movimento: usa “Importa” per caricare un file.';
    $('#mov-kpis').innerHTML = ''; $('#mov-categorie').innerHTML = ''; $('#mov-lista').innerHTML = '<p class="muted">Nessun movimento.</p>';
    charts['chart-mov']?.destroy(); return;
  }
  const date = movimenti.map(m => m.data).sort();
  const ultimi = Object.keys(FONTI).filter(f => movimenti.some(m => m.fonte === f))
    .map(f => `${FONTI[f]} fino al ${fmtData(movimenti.filter(m => m.fonte === f).map(m => m.data).sort().at(-1))}`);
  $('#mov-period').textContent = `Da ${meseAnno(date[0])} · ${ultimi.join(' · ')}`;

  const lista = movFiltrati();
  const valide = lista.filter(contaNeiTotali);
  const entrate = valide.filter(m => m.importo > 0).reduce((s, m) => s + m.importo, 0);
  const uscite = -valide.filter(m => m.importo < 0).reduce((s, m) => s + m.importo, 0);
  const mesi = [...new Set(valide.map(m => m.data.slice(0, 7)))].length || 1;
  const conto = movState.fonte === 'tutte' || movState.fonte === 'conto_hb';
  $('#mov-kpis').innerHTML = `
    <div class="kpi"><div class="label"><i class="dot" style="background:var(--entrate)"></i>Entrate</div><div class="value">${eur0.format(entrate)}</div><div class="sub">${conto ? 'stipendi, rimborsi e altro' : 'rimborsi sulla carta'}</div></div>
    <div class="kpi"><div class="label"><i class="dot" style="background:var(--uscite)"></i>Uscite</div><div class="value">${eur0.format(uscite)}</div><div class="sub">${valide.filter(m => m.importo < 0).length} movimenti</div></div>
    <div class="kpi"><div class="label">Differenza</div><div class="value">${entrate - uscite >= 0 ? '+' : '−'}${eur0.format(Math.abs(entrate - uscite))}</div><div class="sub">entrate − uscite</div></div>
    <div class="kpi"><div class="label">Uscite medie al mese</div><div class="value">${eur0.format(uscite / mesi)}</div><div class="sub">su ${mesi} ${mesi === 1 ? 'mese' : 'mesi'}</div></div>`;

  renderGraficoMov(valide);
  renderCategorie(valide, uscite);
  renderListaMov(lista);
}

function renderGraficoMov(valide) {
  const perMese = {};
  for (const m of valide) {
    const k = m.data.slice(0, 7), s = perMese[k] ??= { e: 0, u: 0 };
    if (m.importo > 0) s.e += m.importo; else s.u -= m.importo;
  }
  const ks = Object.keys(perMese).sort();
  const opts = baseOptions();
  opts.scales.y.ticks.callback = v => eur0.format(v);
  opts.scales.x.ticks.maxRotation = 0; opts.scales.x.ticks.autoSkip = true;
  opts.plugins.tooltip.callbacks = {
    label: c => ` ${c.dataset.label}: ${eur.format(c.parsed.y)}`,
    footer: items => { const s = perMese[ks[items[0].dataIndex]]; return `Differenza: ${s.e - s.u >= 0 ? '+' : '−'}${eur.format(Math.abs(s.e - s.u))}`; },
  };
  const etichetta = k => movState.anno === 'tutti' ? `${MESI[Number(k.slice(5)) - 1]} ${k.slice(2, 4)}` : MESI[Number(k.slice(5)) - 1];
  disegna('chart-mov', {
    type: 'bar',
    data: {
      labels: ks.map(etichetta),
      datasets: [
        { label: 'Entrate', data: ks.map(k => +perMese[k].e.toFixed(2)), backgroundColor: css('--entrate'), borderRadius: 4, borderSkipped: 'bottom', maxBarThickness: 28 },
        { label: 'Uscite', data: ks.map(k => +perMese[k].u.toFixed(2)), backgroundColor: css('--uscite'), borderRadius: 4, borderSkipped: 'bottom', maxBarThickness: 28 },
      ],
    },
    options: opts,
  });
}

function renderCategorie(valide, uscite) {
  const perCat = {};
  for (const m of valide) if (m.importo < 0) perCat[m.categoria || 'Altro'] = (perCat[m.categoria || 'Altro'] || 0) - m.importo;
  const cats = Object.entries(perCat).sort((a, b) => b[1] - a[1]);
  const max = cats[0]?.[1] || 1;
  $('#mov-cat-tot').textContent = uscite ? `${eur0.format(uscite)} in tutto` : '';
  $('#mov-categorie').innerHTML = cats.length ? cats.map(([c, v]) => `
    <button type="button" class="cat-riga ${movState.categoria === c ? 'on' : ''}" data-cat="${esc(c)}">
      <span>${esc(c)}</span>
      <span class="barra"><i style="width:${(v / max * 100).toFixed(1)}%"></i></span>
      <span class="num">${eur0.format(v)}<small>${num0.format(v / uscite * 100)}%</small></span>
    </button>`).join('') : '<p class="muted">Nessuna uscita nel periodo.</p>';
}

function renderListaMov(lista) {
  const tutte = [...new Set([...CATEGORIE_USCITA, ...CATEGORIE_ENTRATA, ...movimenti.map(m => m.categoria).filter(Boolean)])];
  $('#mov-cat').innerHTML = `<option value="">Tutte le categorie</option>` + tutte.map(c => `<option ${movState.categoria === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const q = norm(movState.cerca.trim());
  const vis = lista.filter(m => (!movState.categoria || m.categoria === movState.categoria) && (!q || norm(m.descrizione + ' ' + (m.note || '')).includes(q)));
  const tot = vis.filter(contaNeiTotali).reduce((s, m) => s + m.importo, 0);
  $('#mov-conta').textContent = `${vis.length} ${vis.length === 1 ? 'movimento' : 'movimenti'}${movState.categoria || q ? ` · ${tot >= 0 ? '+' : '−'}${eur.format(Math.abs(tot))}` : ''}`;
  $('#mov-lista').innerHTML = vis.slice(0, movState.mostra).map(m => `
    <div class="riga riga-mov ${contaNeiTotali(m) ? '' : 'escluso'}" data-mov="${m.id}" role="button" tabindex="0">
      <div class="data">${fmtData(m.data)}</div>
      <div class="desc"><div>${esc(m.descrizione)}</div>
        <div class="meta"><span class="chip">${esc(m.categoria || 'Altro')}</span>${TIPI_MOV[m.tipo] ? `<span>${TIPI_MOV[m.tipo]}, non conta</span>` : ''}${m.note ? `<span>${esc(m.note)}</span>` : ''}</div></div>
      <div class="fonte">${FONTI[m.fonte]}</div>
      <div class="num ${m.importo > 0 ? 'entrata' : ''}">${m.importo > 0 ? '+' : '−'}${eur.format(Math.abs(m.importo))}</div>
    </div>`).join('') || '<p class="muted">Nessun movimento.</p>';
  $('#mov-altri').hidden = vis.length <= movState.mostra;
  $('#mov-altri').textContent = `Mostra altri (${vis.length - movState.mostra})`;
}

/* ---------- Interazioni ---------- */

$('#mov-fonte').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  movState.fonte = b.dataset.fonte; movState.mostra = 100; renderMovimenti();
});
$('#mov-anno').addEventListener('change', e => { movState.anno = e.target.value; movState.mostra = 100; renderMovimenti(); });
$('#mov-categorie').addEventListener('click', e => {
  const c = e.target.closest('[data-cat]')?.dataset.cat; if (c == null) return;
  movState.categoria = movState.categoria === c ? '' : c; movState.mostra = 100;
  renderMovimenti();
  if (movState.categoria) $('#mov-elenco').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#mov-cat').addEventListener('change', e => { movState.categoria = e.target.value; movState.mostra = 100; renderMovimenti(); });
let cercaTimer;
$('#mov-cerca').addEventListener('input', e => {
  clearTimeout(cercaTimer);
  cercaTimer = setTimeout(() => { movState.cerca = e.target.value; movState.mostra = 100; renderListaMov(movFiltrati()); }, 200);
});
$('#mov-altri').addEventListener('click', () => { movState.mostra += 200; renderListaMov(movFiltrati()); });
$$('.section-tab').forEach(tab => tab.addEventListener('click', () => { if (tab.dataset.section === 'movimenti' && currentUser) renderMovimenti(); }));

/* ---------- Finestra movimento ---------- */

const mDlg = $('#mov-dialog'), mForm = $('#mov-form');
let mId = null;
// Testo proposto per la regola: la parte iniziale della descrizione, senza numeri e codici
const testoRegola = d => String(d).replace(/^(Pag MAESTRO Carta \d+ [\d.: ]+in EUR|PAYPAL \*|SUMUP \*)\s*/i, '')
  .replace(/\b\S*\d\S*\b/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ').toUpperCase();

function apriMov(m) {
  mId = m.id; mForm.reset();
  $('#mov-message').textContent = ''; $('#mov-message').classList.remove('error');
  $('#mov-info').innerHTML = `<strong class="${m.importo > 0 ? 'entrata' : ''}">${m.importo > 0 ? '+' : '−'}${eur.format(Math.abs(m.importo))}</strong>
    <span>${esc(m.descrizione)}</span><span class="muted small-text">${FONTI[m.fonte]} · ${fmtData(m.data)}${m.estratto && m.estratto !== 'csv' ? ` · estratto ${esc(m.estratto)}` : ''}</span>`;
  const cats = [...new Set([...(m.importo > 0 ? CATEGORIE_ENTRATA : CATEGORIE_USCITA), m.categoria].filter(Boolean))];
  $('#mov-f-cat').innerHTML = cats.map(c => `<option>${esc(c)}</option>`).join('');
  const f = mForm.elements;
  f.categoria.value = m.categoria || 'Altro'; f.tipo.value = m.tipo; f.note.value = m.note || '';
  f.testo.value = testoRegola(m.descrizione); f.testo.disabled = true;
  aggiornaInfoRegola();
  mDlg.showModal();
}
function simili(testo) { const t = norm(testo); return t.length >= 3 ? movimenti.filter(x => norm(x.descrizione).includes(t)) : []; }
function aggiornaInfoRegola() {
  const f = mForm.elements;
  f.testo.disabled = !f.regola.checked;
  const n = f.regola.checked ? simili(f.testo.value).length : 0;
  $('#mov-regola-info').textContent = f.regola.checked ? `${n} ${n === 1 ? 'movimento' : 'movimenti'} cambieranno categoria, e anche quelli che importerai in futuro.` : '';
}
mForm.elements.regola.addEventListener('change', aggiornaInfoRegola);
mForm.elements.testo.addEventListener('input', aggiornaInfoRegola);
mDlg.querySelector('[data-close]').addEventListener('click', () => mDlg.close());
$('#mov-lista').addEventListener('click', e => { const id = e.target.closest('[data-mov]')?.dataset.mov; if (id) apriMov(movimenti.find(m => m.id === id)); });
$('#mov-lista').addEventListener('keydown', e => { if (e.key === 'Enter') { const id = e.target.closest('[data-mov]')?.dataset.mov; if (id) apriMov(movimenti.find(m => m.id === id)); } });

mForm.addEventListener('submit', async e => {
  e.preventDefault();
  const f = mForm.elements, msg = $('#mov-message');
  const err = t => { msg.textContent = t; msg.classList.add('error'); };
  const r = { categoria: f.categoria.value, tipo: f.tipo.value, note: f.note.value.trim() || null };
  msg.textContent = 'Salvataggio…'; msg.classList.remove('error');
  const { error } = await sb.from('casa_movimenti').update(r).eq('id', mId);
  if (error) return err('Errore: ' + error.message);
  if (f.regola.checked) {
    const testo = f.testo.value.trim();
    if (norm(testo).length < 3) return err('Il testo della regola deve avere almeno 3 caratteri.');
    const { error: e1 } = await sb.from('casa_regole_categorie').upsert({ testo: norm(testo), categoria: r.categoria, tipo: r.tipo }, { onConflict: 'user_id,testo' });
    if (e1) return err('Errore nella regola: ' + e1.message);
    const ids = simili(testo).map(x => x.id).filter(id => id !== mId);
    for (let i = 0; i < ids.length; i += 200) {
      const { error: e2 } = await sb.from('casa_movimenti').update({ categoria: r.categoria, tipo: r.tipo }).in('id', ids.slice(i, i + 200));
      if (e2) return err('Errore: ' + e2.message);
    }
  }
  mDlg.close(); await caricaMovimenti();
});

/* ---------- Importazione ---------- */

// Formati accettati:
// 1) CSV "lista movimenti" di Hello bank (Data contabile;Data valuta;Descrizione;Dettaglio;Importo)
// 2) JSON preparato da Claude dagli estratti conto PDF: { movimenti: [{fonte, data, data_contabile, descrizione, importo, estratto, categoria_amex}] }
const dmY = s => { const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
const numIt = s => Number(String(s).replace(/\./g, '').replace(',', '.').replace('+', ''));
const decodifica = s => String(s).replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

function leggiCsvHelloBank(testo) {
  const righe = testo.replace(/^﻿/, '').split(/\r?\n/);
  const i = righe.findIndex(r => /^"?Data contabile"?;/i.test(r));
  if (i < 0) return null;
  const out = []; let saltate = 0;
  for (const r of righe.slice(i + 1)) {
    if (!r.trim()) continue;
    // campi tra virgolette: un ";" dentro le virgolette (es. "Dell&apos;istruzione") non separa i campi
    const c = (r.match(/("([^"]*)"|[^;]*)(;|$)/g) || []).map(x => decodifica(x.replace(/;$/, '').replace(/^"|"$/g, '').trim()));
    if (c.length < 5) continue;
    const contabile = dmY(c[0]), valuta = dmY(c[1]);
    if (!contabile) { saltate++; continue; }          // "Non contabilizzato": arriverà col prossimo file
    const descrizione = [c[2], c[3]].filter(Boolean).join(' – ');
    out.push({ fonte: 'conto_hb', data: valuta || contabile, data_contabile: contabile, descrizione, importo: numIt(c[4]), estratto: 'csv' });
  }
  return { movimenti: out, nonContabilizzati: saltate };
}

async function importaFile(file) {
  const msg = $('#mov-import-msg');
  const mostra = (t, errore = false) => { msg.hidden = false; msg.textContent = t; msg.classList.toggle('error', errore); };
  mostra('Lettura del file…');
  const testo = await file.text();
  let lotto, nonContabilizzati = 0;
  if (/\.json$/i.test(file.name) || testo.trim().startsWith('{')) {
    try { lotto = JSON.parse(testo).movimenti; } catch { return mostra('Il file JSON non è leggibile.', true); }
  } else {
    const r = leggiCsvHelloBank(testo);
    if (!r) return mostra('Formato non riconosciuto: serve il CSV “lista movimenti” di Hello bank o un file preparato da Claude.', true);
    lotto = r.movimenti; nonContabilizzati = r.nonContabilizzati;
  }
  if (!Array.isArray(lotto) || !lotto.length) return mostra('Nel file non ci sono movimenti.', true);

  // Per ogni fonte, i movimenti già coperti da un estratto conto PDF non si importano di nuovo dal CSV
  const finePdf = {};
  for (const m of movimenti) if (m.estratto !== 'csv') { const d = m.data_contabile || m.data; if (!finePdf[m.fonte] || d > finePdf[m.fonte]) finePdf[m.fonte] = d; }
  const contatori = {}; let coperti = 0;
  const righe = [];
  for (const m of lotto) {
    if (!FONTI[m.fonte] || !m.data || !m.descrizione || !Number.isFinite(m.importo)) continue;
    if (m.estratto === 'csv' && finePdf[m.fonte] && (m.data_contabile || m.data) <= finePdf[m.fonte]) { coperti++; continue; }
    const base = [m.fonte, m.estratto || '', m.data_contabile || m.data, m.importo.toFixed(2), norm(m.descrizione)].join('|');
    contatori[base] = (contatori[base] || 0) + 1;          // due movimenti identici nello stesso giorno restano distinti
    const { categoria, tipo } = categorizza(m);
    righe.push({ fonte: m.fonte, data: m.data, data_contabile: m.data_contabile || null, descrizione: m.descrizione.slice(0, 300),
      importo: Math.round(m.importo * 100) / 100, categoria, tipo, estratto: m.estratto || null, impronta: `${base}|${contatori[base]}` });
  }
  const prima = movimenti.length;
  for (let i = 0; i < righe.length; i += 500) {
    mostra(`Importazione… ${Math.min(i + 500, righe.length)} di ${righe.length}`);
    const { error } = await sb.from('casa_movimenti').upsert(righe.slice(i, i + 500), { onConflict: 'user_id,impronta', ignoreDuplicates: true });
    if (error) return mostra('Errore durante l’importazione: ' + error.message, true);
  }
  await caricaMovimenti();
  const nuovi = movimenti.length - prima;
  const note = [
    `${nuovi} ${nuovi === 1 ? 'movimento nuovo' : 'movimenti nuovi'}`,
    righe.length - nuovi ? `${righe.length - nuovi} già presenti` : '',
    coperti ? `${coperti} già coperti dagli estratti conto` : '',
    nonContabilizzati ? `${nonContabilizzati} non ancora contabilizzati (li prenderai col prossimo file)` : '',
  ].filter(Boolean);
  mostra(`Importazione completata: ${note.join(', ')}.`);
}

$('#mov-file').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (file) await importaFile(file);
});

// Ridisegna il grafico quando cambia il tema chiaro/scuro
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => movimenti.length && renderMovimenti());

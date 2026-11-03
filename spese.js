// Casa – sezione Spese fisse: mutuo, finanziamenti, pagamenti a rate e abbonamenti (tabella casa_spese_fisse).
// Per ogni mese mostra le spese previste e le confronta con i Movimenti per dire se sono state addebitate.
// Usa le funzioni e i dati globali di app.js (sb, cond, condQuota, ym, ymAdd, …) e movimenti.js (movimenti, norm).
'use strict';

let spese = [];
let speseMese = null;          // 'YYYY-MM' mostrato nel riquadro del mese
let speseVista = 'attive';     // elenco: attive / concluse

const TIPI_SF = {
  mutuo: { nome: 'Mutuo', colore: '--acqua' },
  finanziamento: { nome: 'Finanziamenti', colore: '--str' },
  rate: { nome: 'Pagamenti a rate', colore: '--luce' },
  abbonamento: { nome: 'Abbonamenti', colore: '--fv' },
  condominio: { nome: 'Condominio', colore: '--ord' },
};
const PAGAMENTI_SF = { conto_hb: 'Conto Hello', carta_hb: 'Carta Hello', amex: 'Amex', revolut: 'Revolut' };
const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

/* ---------- Dati ---------- */

async function caricaSpese() {
  if (!sb || !currentUser) return;
  const { data, error } = await sb.from('casa_spese_fisse').select('*').order('giorno', { ascending: true, nullsFirst: false });
  if (error) { console.warn('Spese fisse non disponibili:', error.message); return; }
  spese = data.map(r => ({ ...r, importo: Number(r.importo) }));
  renderSpese();
}

// Il condominio non sta in casa_spese_fisse: è una voce "virtuale" presa dalla sezione Condominio
function voceCondominio() {
  const q = typeof condQuota === 'function' ? condQuota() : null;
  if (!q) return null;
  return { id: 'condominio', nome: 'Condominio', tipo: 'condominio', creditore: 'Quota ordinaria', pagamento: 'conto_hb', importo: q, frequenza: 'mensile', giorno: 27, cerca: 'CONDOMINIO', virtuale: true };
}
const tutteLeVoci = () => { const c = voceCondominio(); return c ? [...spese, c] : spese; };

// La voce è dovuta nel mese k?
function attivaNelMese(s, k) {
  if (s.inizio && ym(s.inizio) > k) return false;
  if (s.fine && ym(s.fine) < k) return false;
  if (s.frequenza === 'annuale') return Number(k.slice(5)) === s.mese;
  return true;
}
const ultimoGiorno = k => { const [y, m] = k.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const dataPrevista = (s, k) => s.giorno ? `${k}-${String(Math.min(s.giorno, ultimoGiorno(k))).padStart(2, '0')}` : null;
const giorniFra = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
const quotaMensile = s => s.frequenza === 'annuale' ? s.importo / 12 : s.importo;

// Numero di rate che mancano da oggi (comprese quelle di oggi) fino all'ultima
function rateRimaste(s) {
  if (!s.fine || s.frequenza !== 'mensile') return null;
  const oggi = oggiRoma();
  let k = ym(oggi), n = 0;
  if (s.inizio && ym(s.inizio) > k) k = ym(s.inizio);
  for (; k <= ym(s.fine); k = ymAdd(k, 1)) { const d = dataPrevista(s, k); if (!d || d >= oggi) n++; }
  return n;
}

/* ---------- Confronto con i Movimenti ---------- */

// Abbina le voci del mese k ai movimenti: stesso conto/carta, importo vicino, data entro pochi giorni, descrizione che contiene una delle parole di "cerca".
function abbinaMese(k, voci) {
  const lista = typeof movimenti !== 'undefined' ? movimenti : [];
  const usati = new Set(Object.values(abbinamentiFuori(k)));
  const coppie = [];
  for (const s of voci) {
    const prev = dataPrevista(s, k);
    if (!prev || !s.pagamento) continue;
    const parole = (s.cerca || '').split('|').map(p => p.trim().toUpperCase()).filter(Boolean);
    const toll = Math.max(1, s.importo * 0.04);
    for (const m of lista) {
      if (m.importo >= 0 || m.fonte !== s.pagamento) continue;
      const dg = giorniFra(prev, m.data);
      if (dg < -8 || dg > 10) continue;
      const di = Math.abs(-m.importo - s.importo);
      if (di > toll) continue;
      if (parole.length && !parole.some(p => norm(m.descrizione).includes(p))) continue;
      coppie.push({ s, m, punti: di * 10 + Math.abs(dg) * 0.3 });
    }
  }
  coppie.sort((a, b) => a.punti - b.punti);
  const esito = new Map();
  for (const c of coppie) {
    if (esito.has(c.s.id) || usati.has(c.m.id)) continue;
    esito.set(c.s.id, c.m); usati.add(c.m.id);
  }
  return esito;
}
// Movimenti già abbinati nei mesi vicini (così lo stesso addebito non vale per due mesi)
const cacheAbbinamenti = {};
function abbinamentiFuori(k) {
  const out = {};
  for (const kk of [ymAdd(k, -1), ymAdd(k, 1)]) {
    const e = cacheAbbinamenti[kk];
    if (e) for (const [id, m] of e) out[id + kk] = m.id;
  }
  return out;
}

const ultimaDataFonte = fonte => (typeof movimenti !== 'undefined' ? movimenti : []).reduce((mx, m) => m.fonte === fonte && m.data > mx ? m.data : mx, '');

function statoVoce(s, k, abb) {
  if (!s.giorno || !s.pagamento) return { cls: 'completa', testo: 'Da completare: carta e giorno' };
  const prev = dataPrevista(s, k);
  const m = abb.get(s.id);
  if (m) {
    const diverso = Math.abs(-m.importo - s.importo) >= 0.01 ? ` (${eur.format(-m.importo)})` : '';
    return { cls: 'ok', testo: `Addebitata il ${fmtGiorno(m.data)}${diverso}`, mov: m };
  }
  const oggi = oggiRoma();
  if (prev >= oggi) return { cls: 'arrivo', testo: `In arrivo il ${fmtGiorno(prev)}` };
  const ultima = ultimaDataFonte(s.pagamento);
  if (!ultima || giorniFra(prev, ultima) < 10) return { cls: 'attesa', testo: `Prevista il ${fmtGiorno(prev)}, movimenti non ancora importati` };
  return { cls: 'manca', testo: `Non trovata nei movimenti (prevista il ${fmtGiorno(prev)})` };
}

/* ---------- Disegno ---------- */

function renderSpese() {
  if (!$('#section-spese')) return;
  const oggi = oggiRoma(), meseOggi = ym(oggi);
  if (!speseMese) speseMese = meseOggi;
  const voci = tutteLeVoci();
  const attive = voci.filter(s => !s.fine || s.fine >= oggi);

  // Riepilogo
  const delMese = voci.filter(s => attivaNelMese(s, meseOggi));
  const somma = (l, f = s => s.importo) => l.reduce((t, s) => t + f(s), 0);
  const mensiliOggi = delMese.filter(s => s.frequenza === 'mensile');
  const annuali = attive.filter(s => s.frequenza === 'annuale');
  const perTipo = t => somma(mensiliOggi.filter(s => s.tipo === t));
  const conRate = attive.filter(s => ['mutuo', 'finanziamento', 'rate'].includes(s.tipo) && s.fine);
  const residuo = somma(conRate, s => s.importo * (rateRimaste(s) || 0));
  const residuoNoMutuo = somma(conRate.filter(s => s.tipo !== 'mutuo'), s => s.importo * (rateRimaste(s) || 0));
  const daCompletare = voci.filter(s => !s.virtuale && (!s.giorno || !s.pagamento));
  $('#sf-period').textContent = `${attive.length} voci attive${daCompletare.length ? ` · ${daCompletare.length} da completare` : ''}`;
  $('#sf-kpis').innerHTML = `
    <div class="kpi"><div class="label">Spese fisse al mese</div><div class="value">${eur0.format(somma(mensiliOggi))}</div><div class="sub">${annuali.length ? `più ${eur0.format(somma(annuali))} all’anno di annuali` : 'questo mese'}</div></div>
    <div class="kpi"><div class="label"><i class="dot" style="background:var(--str)"></i>Finanziamenti e rate</div><div class="value">${eur0.format(perTipo('finanziamento') + perTipo('rate'))}</div><div class="sub">mutuo ${eur0.format(perTipo('mutuo'))} al mese</div></div>
    <div class="kpi"><div class="label"><i class="dot" style="background:var(--fv)"></i>Abbonamenti</div><div class="value">${eur0.format(perTipo('abbonamento'))}</div><div class="sub">al mese, più condominio ${eur0.format(perTipo('condominio'))}</div></div>
    <div class="kpi"><div class="label">Debito residuo</div><div class="value">${eur0.format(residuoNoMutuo)}</div><div class="sub">senza mutuo · con mutuo ${eur0.format(residuo)}</div></div>`;

  renderSpeseMese();
  renderSpeseAnni(voci);
  renderSpeseElenco(voci);
}

function renderSpeseMese() {
  const k = speseMese, voci = tutteLeVoci().filter(s => attivaNelMese(s, k));
  voci.sort((a, b) => (a.giorno ?? 99) - (b.giorno ?? 99) || b.importo - a.importo);
  const abb = abbinaMese(k, voci);
  cacheAbbinamenti[k] = abb;
  const stati = voci.map(s => ({ s, st: statoVoce(s, k, abb) }));
  const tot = voci.reduce((t, s) => t + s.importo, 0);
  const pagato = stati.filter(x => x.st.cls === 'ok').reduce((t, x) => t + x.s.importo, 0);
  const mancanti = stati.filter(x => x.st.cls === 'manca').length;
  $('#sf-mese-nome').textContent = ymNome(k).replace(/^./, c => c.toUpperCase());
  $('#sf-mese-tot').innerHTML = `${eur.format(tot)}<small>${pagato ? `addebitati ${eur.format(pagato)}` : 'niente ancora addebitato'}${mancanti ? ` · <b class="manca">${mancanti} non ${mancanti === 1 ? 'trovata' : 'trovate'}</b>` : ''}</small>`;
  $('#sf-mese-lista').innerHTML = stati.length ? stati.map(({ s, st }) => `
    <div class="pross-riga sf-riga" ${s.virtuale ? '' : `data-sf="${s.id}" role="button" tabindex="0"`}>
      <i class="dot" style="background:var(${TIPI_SF[s.tipo].colore})"></i>
      <div class="pross-desc">
        <div><strong>${esc(s.nome)}</strong>${s.creditore ? ` <span class="muted">· ${esc(s.creditore)}</span>` : ''}</div>
        <div class="pross-date"><span class="sf-giorno">${s.giorno ? `giorno ${s.giorno}` : 'giorno ?'}</span> · ${s.pagamento ? PAGAMENTI_SF[s.pagamento] : 'carta ?'}${s.frequenza === 'annuale' ? ' · annuale' : ''}${ultimaRata(s, k) ? ' · <b>ultima rata</b>' : ''}</div>
        <div class="sf-stato ${st.cls}">${st.testo}</div>
      </div>
      <div class="pross-importo"><span>${eur.format(s.importo)}</span></div>
    </div>`).join('') : '<p class="muted">Nessuna spesa fissa in questo mese.</p>';
  $('#sf-succ').disabled = k >= ymAdd(ym(oggiRoma()), 24);
}
const ultimaRata = (s, k) => s.fine && s.frequenza === 'mensile' && ym(s.fine) === k;

// Media al mese per anno, divisa per tipo: mostra come scende la spesa fissa man mano che finiscono le rate
function renderSpeseAnni(voci) {
  const oggi = oggiRoma(), y0 = Number(oggi.slice(0, 4));
  const fineMax = voci.filter(s => s.fine && s.tipo !== 'mutuo').reduce((mx, s) => Math.max(mx, Number(s.fine.slice(0, 4))), y0);
  const anni = [];
  for (let y = y0; y <= Math.min(fineMax + 1, y0 + 12); y++) anni.push(y);
  const tipi = Object.keys(TIPI_SF);
  const dati = Object.fromEntries(tipi.map(t => [t, []]));
  for (const y of anni) {
    const mesi = [];
    for (let m = (y === y0 ? Number(oggi.slice(5, 7)) : 1); m <= 12; m++) mesi.push(`${y}-${String(m).padStart(2, '0')}`);
    for (const t of tipi) {
      const tot = mesi.reduce((acc, k) => acc + voci.filter(s => s.tipo === t && attivaNelMese(s, k)).reduce((a, s) => a + s.importo, 0), 0);
      dati[t].push(Math.round(tot / mesi.length * 100) / 100);
    }
  }
  const usati = tipi.filter(t => dati[t].some(v => v > 0));
  $('#sf-anni-legend').innerHTML = usati.map(t => `<span><i style="background:var(${TIPI_SF[t].colore})"></i>${TIPI_SF[t].nome}</span>`).join('');
  const opts = baseOptions();
  opts.scales.x.stacked = true; opts.scales.y.stacked = true;
  opts.scales.y.ticks.callback = v => eur0.format(v);
  opts.plugins.tooltip.callbacks = {
    label: c => ` ${c.dataset.label}: ${eur.format(c.parsed.y)}`,
    footer: items => `Totale: ${eur.format(items.reduce((s, i) => s + i.parsed.y, 0))} al mese`,
  };
  disegna('chart-sf', {
    type: 'bar',
    data: {
      labels: anni.map(y => y === y0 ? `${y} (da ora)` : String(y)),
      datasets: usati.map(t => ({ label: TIPI_SF[t].nome, data: dati[t], backgroundColor: css(TIPI_SF[t].colore), borderColor: css('--surface'), borderWidth: { top: 2 }, borderRadius: 4, borderSkipped: 'bottom', maxBarThickness: 56 })),
    },
    options: opts,
  });
  const mutuo = voci.find(s => s.tipo === 'mutuo' && s.fine);
  $('#sf-anni-foot').textContent = `Media al mese di ogni anno; gli abbonamenti annuali contano nel mese in cui si pagano.${mutuo ? ` Il mutuo continua fino a ${ymNome(ym(mutuo.fine))}.` : ''}`;
}

function renderSpeseElenco(voci) {
  const oggi = oggiRoma();
  $$('#sf-vista button').forEach(b => b.classList.toggle('on', b.dataset.vista === speseVista));
  const vis = voci.filter(s => !s.virtuale && (speseVista === 'attive' ? !s.fine || s.fine >= oggi : s.fine && s.fine < oggi));
  const ordine = { mutuo: 0, finanziamento: 1, rate: 2, abbonamento: 3 };
  vis.sort((a, b) => ordine[a.tipo] - ordine[b.tipo] || (a.giorno ?? 99) - (b.giorno ?? 99) || b.importo - a.importo || a.nome.localeCompare(b.nome));
  let tipoCorrente = null;
  $('#sf-lista').innerHTML = vis.length ? vis.map(s => {
    const n = rateRimaste(s);
    const intest = s.tipo !== tipoCorrente ? `<h3 class="sf-gruppo">${TIPI_SF[s.tipo].nome}</h3>` : '';
    tipoCorrente = s.tipo;
    const quando = s.frequenza === 'annuale' ? `ogni anno, ${s.giorno ?? '?'} ${MESI_LUNGHI[s.mese - 1] ?? ''}` : `ogni mese, giorno ${s.giorno ?? '?'}`;
    const fine = s.fine ? (s.fine < oggi ? `finita a ${ymNome(ym(s.fine))}` : `fino a ${ymNome(ym(s.fine))}${n != null ? ` · ${n} ${n === 1 ? 'rata' : 'rate'}, ${eur0.format(n * s.importo)} da pagare` : ''}`) : 'senza scadenza';
    return `${intest}
    <div class="pross-riga sf-riga" data-sf="${s.id}" role="button" tabindex="0">
      <i class="dot" style="background:var(${TIPI_SF[s.tipo].colore})"></i>
      <div class="pross-desc">
        <div><strong>${esc(s.nome)}</strong>${s.creditore ? ` <span class="muted">· ${esc(s.creditore)}</span>` : ''}${!s.giorno || !s.pagamento ? '<span class="badge da-completare">da completare</span>' : ''}</div>
        <div class="pross-date">${quando} · ${s.pagamento ? PAGAMENTI_SF[s.pagamento] : 'carta ?'}</div>
        <div class="pross-inv">${fine}</div>
        ${s.note ? `<div class="pross-inv">${esc(s.note)}</div>` : ''}
      </div>
      <div class="pross-importo"><span>${eur.format(s.importo)}</span><small>${s.frequenza === 'annuale' ? 'all’anno' : 'al mese'}</small></div>
    </div>`;
  }).join('') : `<p class="muted">${speseVista === 'attive' ? 'Nessuna spesa attiva.' : 'Nessuna spesa conclusa.'}</p>`;
}

/* ---------- Eventi ---------- */

$('#sf-prec').addEventListener('click', () => { speseMese = ymAdd(speseMese, -1); renderSpeseMese(); });
$('#sf-succ').addEventListener('click', () => { speseMese = ymAdd(speseMese, 1); renderSpeseMese(); });
$('#sf-oggi').addEventListener('click', () => { speseMese = ym(oggiRoma()); renderSpeseMese(); });
$('#sf-vista').addEventListener('click', e => { const v = e.target.closest('[data-vista]')?.dataset.vista; if (v) { speseVista = v; renderSpeseElenco(tutteLeVoci()); } });
for (const sel of ['#sf-mese-lista', '#sf-lista']) {
  const apri = e => { const id = e.target.closest('[data-sf]')?.dataset.sf; if (id) apriSpesa(spese.find(s => s.id === id)); };
  $(sel).addEventListener('click', apri);
  $(sel).addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apri(e); } });
}

/* ---------- Finestra spesa ---------- */

const sfDlg = $('#sf-dialog'), sfForm = $('#sf-form');
const SF_CAMPI = ['nome', 'tipo', 'creditore', 'pagamento', 'importo', 'frequenza', 'giorno', 'mese', 'inizio', 'fine', 'cerca', 'note'];
let sfId = null;

function sfAggiorna() {
  const annuale = sfForm.elements.frequenza.value === 'annuale';
  $$('.solo-annuale', sfForm).forEach(el => el.hidden = !annuale);
  sfForm.elements.mese.required = annuale;
}

function apriSpesa(s = null) {
  sfId = s?.id || null;
  sfForm.reset();
  $('#sf-message').textContent = '';
  $('#sf-delete-btn').hidden = !s;
  $('#sf-title').textContent = s ? `Modifica ${s.nome}` : 'Nuova spesa fissa';
  const v = s || { tipo: 'abbonamento', frequenza: 'mensile', pagamento: 'conto_hb' };
  for (const c of SF_CAMPI) sfForm.elements[c].value = v[c] ?? '';
  sfAggiorna();
  sfDlg.showModal();
}

$('#sf-add-btn').addEventListener('click', () => apriSpesa());
sfForm.elements.frequenza.addEventListener('change', sfAggiorna);
sfDlg.querySelector('[data-close]').addEventListener('click', () => sfDlg.close());
sfForm.addEventListener('submit', async e => {
  e.preventDefault();
  const r = {};
  for (const c of SF_CAMPI) { const v = sfForm.elements[c].value.trim(); r[c] = v === '' ? null : (['importo', 'giorno', 'mese'].includes(c) ? Number(v) : v); }
  if (r.frequenza !== 'annuale') r.mese = null;
  if (r.cerca) r.cerca = r.cerca.toUpperCase();
  if (r.inizio && r.fine && r.fine < r.inizio) { $('#sf-message').textContent = 'L’ultima rata è prima della prima.'; return; }
  $('#sf-message').textContent = 'Salvataggio…';
  const { error } = sfId ? await sb.from('casa_spese_fisse').update(r).eq('id', sfId) : await sb.from('casa_spese_fisse').insert(r);
  if (error) { $('#sf-message').textContent = 'Errore: ' + error.message; return; }
  sfDlg.close(); await caricaSpese();
});
$('#sf-delete-btn').addEventListener('click', async () => {
  const s = spese.find(x => x.id === sfId);
  if (!s || !confirm(`Eliminare “${s.nome}”? Se è solo finita, conviene lasciarla: compare tra le concluse.`)) return;
  const { error } = await sb.from('casa_spese_fisse').delete().eq('id', sfId);
  if (error) { $('#sf-message').textContent = 'Errore: ' + error.message; return; }
  sfDlg.close(); await caricaSpese();
});

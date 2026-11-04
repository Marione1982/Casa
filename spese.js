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
  carta: { nome: 'Addebiti carte', colore: '--rete' },
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
// Le spese fisse vere e proprie; gli addebiti delle carte (tipo "carta") stanno a parte e non entrano nei totali,
// perché contengono già le spese fisse pagate con le carte.
const tutteLeVoci = () => { const f = spese.filter(s => s.tipo !== 'carta'); const c = voceCondominio(); return c ? [...f, c] : f; };
const vociCarte = () => spese.filter(s => s.tipo === 'carta');

/* ---------- Addebiti delle carte ---------- */

// Codice dell'estratto della carta che viene addebitato nel mese k (es. carta Hello: novembre ← estratto di ottobre)
const codiceEstratto = (s, k) => ymAdd(k, -(s.mese_estratto || 0)).replace('-', '');
const nomeEstratto = (s, k) => MESI_LUNGHI[Number(ymAdd(k, -(s.mese_estratto || 0)).slice(5)) - 1];
// Totale dell'estratto (dai movimenti importati con quel codice); null se l'estratto non è ancora caricato, 0 se non esiste (nessuna spesa)
function totaleEstratto(s, k) {
  const lista = typeof movimenti !== 'undefined' ? movimenti : [];
  const cod = codiceEstratto(s, k);
  const mov = lista.filter(m => m.fonte === s.estratto_carta && m.estratto === cod);
  if (mov.length) return Math.round(-mov.reduce((t, m) => t + m.importo, 0) * 100) / 100;
  const ultimo = lista.reduce((mx, m) => m.fonte === s.estratto_carta && /^\d{6}$/.test(m.estratto || '') && m.estratto > mx ? m.estratto : mx, '');
  return ultimo && ultimo > cod ? 0 : null;   // estratti successivi già caricati → quel mese non c'era niente da pagare
}
// La voce carta con l'importo del mese k
const cartaDelMese = (s, k) => ({ ...s, importo: totaleEstratto(s, k), _stima: true });

// La voce è dovuta nel mese k?
function attivaNelMese(s, k) {
  if (s.inizio && ym(s.inizio) > k) return false;
  if (s.fine && ym(s.fine) < k) return false;
  if (s.frequenza === 'annuale') return Number(k.slice(5)) === s.mese;
  return true;
}
const finoA = k => { const n = ymNome(ym(k)); return `fino a${/^[aeiou]/.test(n) ? 'd' : ''} ${n}`; };
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
    const toll = s.tipo === 'carta' ? (s.importo == null ? Infinity : 1) : Math.max(1, s.importo * 0.04);
    for (const m of lista) {
      if (m.importo >= 0 || m.fonte !== s.pagamento) continue;
      const dg = giorniFra(prev, m.data);
      if (dg < -8 || dg > 10) continue;
      const di = s.importo == null ? 0 : Math.abs(-m.importo - s.importo);
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
    const diverso = s.importo != null && Math.abs(-m.importo - s.importo) >= 0.01 ? ` (${eur.format(-m.importo)})` : '';
    return { cls: 'ok', testo: `Addebitata il ${fmtGiorno(m.data)}${diverso}`, mov: m };
  }
  const oggi = oggiRoma();
  if (s.tipo === 'carta' && prev >= oggi) return s.importo == null
    ? { cls: 'attesa', testo: `Previsto il ${fmtGiorno(prev)} · estratto di ${nomeEstratto(s, ym(prev))} non ancora caricato` }
    : { cls: 'arrivo', testo: `Pianificato il ${fmtGiorno(prev)} · estratto di ${nomeEstratto(s, ym(prev))}` };
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
    <div class="kpi kpi-tocca" data-kpi="tutte" role="button" tabindex="0"><div class="label">Spese fisse al mese</div><div class="value">${eur0.format(somma(mensiliOggi))}</div><div class="sub">${annuali.length ? `più ${eur0.format(somma(annuali))} all’anno di annuali` : 'questo mese'}</div></div>
    <div class="kpi kpi-tocca" data-kpi="finanz" role="button" tabindex="0"><div class="label"><i class="dot" style="background:var(--str)"></i>Finanziamenti e rate</div><div class="value">${eur0.format(perTipo('finanziamento') + perTipo('rate'))}</div><div class="sub">mutuo ${eur0.format(perTipo('mutuo'))} al mese</div></div>
    <div class="kpi kpi-tocca" data-kpi="abbon" role="button" tabindex="0"><div class="label"><i class="dot" style="background:var(--fv)"></i>Abbonamenti</div><div class="value">${eur0.format(perTipo('abbonamento'))}</div><div class="sub">al mese, più condominio ${eur0.format(perTipo('condominio'))}</div></div>
    <div class="kpi kpi-tocca" data-kpi="debito" role="button" tabindex="0"><div class="label">Debito residuo</div><div class="value">${eur0.format(residuoNoMutuo)}</div><div class="sub">senza mutuo · con mutuo ${eur0.format(residuo)}</div></div>`;

  renderKpiDettaglio();
  renderSpeseMese();
  renderSpeseAnni(voci);
  renderSpeseElenco(voci);
  if (typeof renderBudget === 'function') renderBudget();   // il budget dipende da spese fisse e movimenti
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
  renderCarteMese(k);
}

// Riquadro "Addebiti delle carte" del mese: importo = totale dell'estratto, non sommato alle spese fisse
function renderCarteMese(k) {
  const voci = vociCarte().filter(s => attivaNelMese(s, k)).map(s => cartaDelMese(s, k)).filter(s => s.importo !== 0);
  const box = $('#sf-carte');
  if (!voci.length) { box.hidden = true; return; }
  voci.sort((a, b) => (a.giorno ?? 99) - (b.giorno ?? 99));
  const abb = abbinaMese(k, voci);
  const tot = voci.reduce((t, s) => t + (s.importo || 0), 0);
  const manca = voci.some(s => s.importo == null);
  box.hidden = false;
  box.innerHTML = `
    <div class="sf-carte-head"><h3>Addebiti carte</h3><span>${voci.every(s => s.importo == null) ? '–' : eur.format(tot)}${manca ? `<small>${voci.every(s => s.importo == null) ? 'estratti' : 'più gli estratti'} non ancora caricati</small>` : ''}</span></div>
    ${voci.map(s => { const st = statoVoce(s, k, abb); return `
    <div class="pross-riga sf-riga" data-sf="${s.id}" role="button" tabindex="0">
      <i class="dot" style="background:var(${TIPI_SF.carta.colore})"></i>
      <div class="pross-desc">
        <div><strong>${esc(s.nome)}</strong></div>
        <div class="pross-date">giorno ${s.giorno} · ${PAGAMENTI_SF[s.pagamento]}</div>
        <div class="sf-stato ${st.cls}">${st.testo}</div>
      </div>
      <div class="pross-importo"><span>${s.importo == null ? '–' : eur.format(s.importo)}</span></div>
    </div>`; }).join('')}
    <p class="foot muted">Non sommati alle spese fisse: contengono già le spese pagate con le carte (es. Apple Watch, Tatoo, Claude). L’importo è il totale dell’estratto della carta.</p>`;
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
  const vis = [...voci, ...vociCarte()].filter(s => !s.virtuale && (speseVista === 'attive' ? !s.fine || s.fine >= oggi : s.fine && s.fine < oggi));
  const ordine = { mutuo: 0, finanziamento: 1, rate: 2, abbonamento: 3, carta: 4 };
  vis.sort((a, b) => ordine[a.tipo] - ordine[b.tipo] || (a.giorno ?? 99) - (b.giorno ?? 99) || b.importo - a.importo || a.nome.localeCompare(b.nome));
  let tipoCorrente = null;
  $('#sf-lista').innerHTML = vis.length ? vis.map(s => {
    const n = rateRimaste(s);
    const intest = s.tipo !== tipoCorrente ? `<h3 class="sf-gruppo">${TIPI_SF[s.tipo].nome}</h3>` : '';
    tipoCorrente = s.tipo;
    const quando = s.frequenza === 'annuale' ? `ogni anno, ${s.giorno ?? '?'} ${MESI_LUNGHI[s.mese - 1] ?? ''}` : `ogni mese, giorno ${s.giorno ?? '?'}`;
    if (s.tipo === 'carta') return `${intest}${rigaCartaElenco(s)}`;
    const fine = s.fine ? (s.fine < oggi ? `finita a ${ymNome(ym(s.fine))}` : `${finoA(s.fine)}${n != null ? ` · ${n} ${n === 1 ? 'rata' : 'rate'}, ${eur0.format(n * s.importo)} da pagare` : ''}`) : 'senza scadenza';
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

// Nell'elenco la carta mostra l'ultimo addebito trovato sul conto
function rigaCartaElenco(s) {
  const parole = (s.cerca || '').split('|').map(p => p.trim()).filter(Boolean);
  const ultimo = (typeof movimenti !== 'undefined' ? movimenti : []).filter(m => m.fonte === s.pagamento && m.importo < 0 && parole.some(p => norm(m.descrizione).includes(p)))
    .reduce((u, m) => !u || m.data > u.data ? m : u, null);
  return `
    <div class="pross-riga sf-riga" data-sf="${s.id}" role="button" tabindex="0">
      <i class="dot" style="background:var(${TIPI_SF.carta.colore})"></i>
      <div class="pross-desc">
        <div><strong>${esc(s.nome)}</strong>${s.creditore ? ` <span class="muted">· ${esc(s.creditore)}</span>` : ''}</div>
        <div class="pross-date">ogni mese, giorno ${s.giorno ?? '?'} · ${s.pagamento ? PAGAMENTI_SF[s.pagamento] : 'conto ?'} · estratto ${s.mese_estratto ? 'del mese prima' : 'dello stesso mese'}</div>
        <div class="pross-inv">${ultimo ? `ultimo addebito il ${fmtGiorno(ultimo.data)}` : 'nessun addebito trovato'}</div>
      </div>
      <div class="pross-importo"><span>${ultimo ? eur.format(-ultimo.importo) : '–'}</span><small>variabile</small></div>
    </div>`;
}

/* ---------- Dettaglio dei riquadri in alto ---------- */

let sfKpi = null;   // riquadro aperto: tutte / finanz / abbon / debito
const residuoDi = s => { const n = rateRimaste(s); return n == null ? null : { n, tot: Math.round(n * s.importo * 100) / 100 }; };
// Ordine: debito residuo più alto prima; le voci senza scadenza dopo, per importo
const perResiduo = l => l.map(s => ({ s, res: residuoDi(s) }))
  .sort((a, b) => (b.res?.tot ?? -1) - (a.res?.tot ?? -1) || b.s.importo - a.s.importo || a.s.nome.localeCompare(b.s.nome));

function datiKpi(tipo) {
  const oggi = oggiRoma(), k = ym(oggi);
  const voci = tutteLeVoci();
  const mensili = voci.filter(s => attivaNelMese(s, k) && s.frequenza === 'mensile');
  const annuali = voci.filter(s => s.frequenza === 'annuale' && (!s.fine || s.fine >= oggi));
  const conRate = voci.filter(s => ['mutuo', 'finanziamento', 'rate'].includes(s.tipo) && s.fine && s.fine >= oggi);
  const di = t => l => l.filter(s => t.includes(s.tipo));
  switch (tipo) {
    case 'tutte': return { titolo: `Spese fisse di ${ymNome(k)}`, righe: perResiduo(mensili), esclusi: perResiduo(annuali), titoloEsclusi: 'Annuali, non inclusi' };
    case 'finanz': return { titolo: 'Finanziamenti e rate del mese', righe: perResiduo(di(['finanziamento', 'rate'])(mensili)), esclusi: perResiduo(di(['mutuo'])(mensili)), titoloEsclusi: 'Mutuo, non incluso' };
    case 'abbon': return { titolo: 'Abbonamenti del mese', righe: perResiduo(di(['abbonamento'])(mensili)), esclusi: perResiduo([...di(['condominio'])(mensili), ...di(['abbonamento'])(annuali)]), titoloEsclusi: 'Non inclusi' };
    case 'debito': return { titolo: 'Debito residuo', debito: true, righe: perResiduo(di(['finanziamento', 'rate'])(conRate)), esclusi: perResiduo(di(['mutuo'])(conRate)), titoloEsclusi: 'Mutuo, non incluso' };
  }
}

function rigaKpi({ s, res }, debito) {
  const giorno = s.frequenza === 'annuale' ? `${s.giorno ?? '?'} ${MESI_LUNGHI[s.mese - 1] ?? ''}` : `giorno ${s.giorno ?? '?'}`;
  const fine = s.fine ? finoA(s.fine) : 'senza scadenza';
  const principale = debito ? res.tot : s.importo;
  const sotto = debito ? `${res.n} × ${eur.format(s.importo)}` : res ? `resta ${eur0.format(res.tot)}` : (s.frequenza === 'annuale' ? 'all’anno' : 'al mese');
  return `
    <div class="sf-dett-riga" ${s.virtuale ? '' : `data-sf="${s.id}" role="button" tabindex="0"`}>
      <i class="dot" style="background:var(${TIPI_SF[s.tipo].colore})"></i>
      <div class="sf-dett-nome"><strong>${esc(s.nome)}</strong>${s.creditore ? ` <span class="muted">· ${esc(s.creditore)}</span>` : ''}<small>${giorno} · ${fine}${res && !debito ? ` · ${res.n} ${res.n === 1 ? 'rata' : 'rate'}` : ''}</small></div>
      <div class="sf-dett-num"><span>${eur.format(principale)}</span><small>${sotto}</small></div>
    </div>`;
}

function renderKpiDettaglio() {
  $$('#sf-kpis [data-kpi]').forEach(el => { el.classList.toggle('on', el.dataset.kpi === sfKpi); el.setAttribute('aria-expanded', el.dataset.kpi === sfKpi); });
  const box = $('#sf-kpi-dett');
  if (!sfKpi) { box.hidden = true; return; }
  const d = datiKpi(sfKpi);
  const val = x => d.debito ? x.res.tot : x.s.importo;
  const tot = d.righe.reduce((t, x) => t + val(x), 0);
  const totEsclusi = d.esclusi.reduce((t, x) => t + val(x), 0);
  box.hidden = false;
  box.innerHTML = `
    <header class="card-head"><h2>${d.titolo}</h2><button class="icon-btn" type="button" data-chiudi aria-label="Chiudi">✕</button></header>
    <div class="sf-dett-lista">${d.righe.length ? d.righe.map(x => rigaKpi(x, d.debito)).join('') : '<p class="muted">Nessuna voce.</p>'}</div>
    <div class="sf-dett-tot"><span>Totale${d.debito ? '' : ' al mese'}</span><span>${eur.format(tot)}</span></div>
    ${d.esclusi.length ? `
    <h3 class="sf-gruppo">${d.titoloEsclusi}</h3>
    <div class="sf-dett-lista esclusi">${d.esclusi.map(x => rigaKpi(x, d.debito)).join('')}</div>
    ${d.debito ? `<div class="sf-dett-tot"><span>Totale con mutuo</span><span>${eur.format(tot + totEsclusi)}</span></div>` : ''}` : ''}
    <p class="foot muted">${d.debito ? 'Rate che mancano × importo della rata: è quanto pagherai ancora, interessi e spese compresi (il capitale da restituire per un’estinzione anticipata è più basso).' : 'In ordine di debito residuo; le voci senza scadenza in fondo, per importo.'} Tocca una voce per modificarla.</p>`;
}

function apriKpi(el) {
  if (!el) return;
  sfKpi = sfKpi === el.dataset.kpi ? null : el.dataset.kpi;
  renderKpiDettaglio();
}
$('#sf-kpis').addEventListener('click', e => apriKpi(e.target.closest('[data-kpi]')));
$('#sf-kpis').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apriKpi(e.target.closest('[data-kpi]')); } });
$('#sf-kpi-dett').addEventListener('click', e => { if (e.target.closest('[data-chiudi]')) { sfKpi = null; renderKpiDettaglio(); } });

/* ---------- Eventi ---------- */

$('#sf-prec').addEventListener('click', () => { speseMese = ymAdd(speseMese, -1); renderSpeseMese(); });
$('#sf-succ').addEventListener('click', () => { speseMese = ymAdd(speseMese, 1); renderSpeseMese(); });
$('#sf-oggi').addEventListener('click', () => { speseMese = ym(oggiRoma()); renderSpeseMese(); });
$('#sf-vista').addEventListener('click', e => { const v = e.target.closest('[data-vista]')?.dataset.vista; if (v) { speseVista = v; renderSpeseElenco(tutteLeVoci()); } });
for (const sel of ['#sf-kpi-dett', '#sf-mese-lista', '#sf-carte', '#sf-lista']) {
  const apri = e => { const id = e.target.closest('[data-sf]')?.dataset.sf; if (id) apriSpesa(spese.find(s => s.id === id)); };
  $(sel).addEventListener('click', apri);
  $(sel).addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apri(e); } });
}

/* ---------- Finestra spesa ---------- */

const sfDlg = $('#sf-dialog'), sfForm = $('#sf-form');
const SF_CAMPI = ['nome', 'tipo', 'creditore', 'pagamento', 'importo', 'frequenza', 'giorno', 'mese', 'inizio', 'fine', 'cerca', 'note', 'estratto_carta', 'mese_estratto'];
let sfId = null;

function sfAggiorna() {
  const annuale = sfForm.elements.frequenza.value === 'annuale';
  $$('.solo-annuale', sfForm).forEach(el => el.hidden = !annuale);
  sfForm.elements.mese.required = annuale;
  const carta = sfForm.elements.tipo.value === 'carta';
  $$('.solo-carta', sfForm).forEach(el => el.hidden = !carta);
  $$('.non-carta', sfForm).forEach(el => el.hidden = carta);
  sfForm.elements.importo.required = !carta;
  sfForm.elements.estratto_carta.required = carta;
}

function apriSpesa(s = null) {
  sfId = s?.id || null;
  sfForm.reset();
  $('#sf-message').textContent = '';
  $('#sf-delete-btn').hidden = !s;
  $('#sf-title').textContent = s ? `Modifica ${s.nome}` : 'Nuova spesa fissa';
  const v = s || { tipo: 'abbonamento', frequenza: 'mensile', pagamento: 'conto_hb', mese_estratto: 0 };
  for (const c of SF_CAMPI) sfForm.elements[c].value = v[c] ?? '';
  sfAggiorna();
  sfDlg.showModal();
}

$('#sf-add-btn').addEventListener('click', () => apriSpesa());
sfForm.elements.frequenza.addEventListener('change', sfAggiorna);
sfForm.elements.tipo.addEventListener('change', sfAggiorna);
sfDlg.querySelector('[data-close]').addEventListener('click', () => sfDlg.close());
sfForm.addEventListener('submit', async e => {
  e.preventDefault();
  const r = {};
  for (const c of SF_CAMPI) { const v = sfForm.elements[c].value.trim(); r[c] = v === '' ? null : (['importo', 'giorno', 'mese', 'mese_estratto'].includes(c) ? Number(v) : v); }
  if (r.frequenza !== 'annuale') r.mese = null;
  if (r.tipo === 'carta') { r.importo = 0; r.frequenza = 'mensile'; r.mese = null; } else { r.estratto_carta = null; r.mese_estratto = 0; }
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

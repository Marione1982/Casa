// Casa – sezione Stipendio: buste paga MetLife (tabella casa_buste_paga), lette dai PDF in OneDrive
// Documenti/Lavoro/BustePaga/AAAA/ (nome file AAAAMM, AAAAMMq quattordicesima, AAAAMMt tredicesima).
// Usa i dati e le funzioni globali di app.js (sb, $, eur, eur0, num1, MESI, MESI_LUNGHI, ymNome, esc, css,
// baseOptions, disegna, fmtData), movimenti.js (movimenti, norm) e prossime.js (mediana, giorniTra, piuGiorni).
// Fornisce nettoMetlife(k) a budget.js per l'importo atteso dello stipendio.
'use strict';

let buste = [];
const stState = { misura: 'netto', anno: null, extraAnno: null };
const NUM_BUSTA = ['lordo', 'contributi', 'irpef', 'addizionali', 'altre_trattenute', 'rimborso_730', 'netto', 'retribuzione_base',
  'tfr', 'ferie_residue', 'ex_festivita_residue', 'rol_residui_ore', 'imponibile_irpef_anno', 'irpef_anno'];
const TIPO_BREVE = { tredicesima: '13ª', quattordicesima: '14ª' };

/* ---------- Dati ---------- */

async function caricaStipendio() {
  if (!sb || !currentUser) return;
  const { data, error } = await sb.from('casa_buste_paga').select('*').order('mese').order('codice');
  if (error) { console.warn('Buste paga non disponibili:', error.message); buste = []; return; }
  buste = data.map(r => {
    const o = { ...r, voci: Array.isArray(r.voci) ? r.voci : [] };
    for (const c of NUM_BUSTA) o[c] = r[c] == null ? null : Number(r[c]);
    return o;
  });
  renderStipendioSezione();
  if (typeof renderBudget === 'function') renderBudget();   // il Budget usa il netto delle buste
}

const annoB = b => b.mese.slice(0, 4);
const meseB = b => Number(b.mese.slice(5, 7));
const kB = b => b.mese.slice(0, 7);
const mensili = () => buste.filter(b => b.tipo === 'mensile');
const nettoStip = b => b.netto - b.rimborso_730;                 // netto senza il rimborso del 730
const tasseB = b => b.irpef + b.addizionali;
const annoNum = v => v == null ? '–' : num1.format(v);

/* ---------- Per il Budget ---------- */

// Netto MetLife atteso nel mese k ('AAAA-MM'): se c'è già la busta, il suo netto (con 13ª/14ª dello stesso mese);
// altrimenti il netto tipico (mediana delle ultime 6 buste mensili, senza 730) più 14ª a giugno e 13ª a dicembre.
// Restituisce null se non ci sono buste.
function nettoMetlife(k = null) {
  const m = mensili();
  if (!m.length) return null;
  if (k) {
    const del = buste.filter(b => kB(b) === k);
    if (del.some(b => b.tipo === 'mensile')) return del.reduce((s, b) => s + b.netto, 0);
  }
  const tipico = mediana(m.slice(-6).map(nettoStip));
  if (!k) return tipico;
  const extra = k.endsWith('-06') ? 'quattordicesima' : k.endsWith('-12') ? 'tredicesima' : null;
  const ultimaExtra = extra ? buste.filter(b => b.tipo === extra).at(-1) : null;
  return tipico + (ultimaExtra ? ultimaExtra.netto : 0);
}

/* ---------- Accredito nei Movimenti ---------- */

const movMetlife = () => (typeof movimenti !== 'undefined' ? movimenti : [])
  .filter(m => m.fonte === 'conto_hb' && m.importo > 0 && norm(m.descrizione).includes('METLIFE'));

// Accredito della busta sul conto Hello: stesso importo (entro 1 €), da 5 giorni prima a 20 dopo la data della busta.
// null = movimenti non disponibili per quel periodo; false = non trovato.
function accredito(b, accr) {
  if (!b.data_elaborazione) return null;
  const primo = (typeof movimenti !== 'undefined' ? movimenti : []).filter(m => m.fonte === 'conto_hb').map(m => m.data).sort()[0];
  if (!primo || b.data_elaborazione < primo) return null;
  const m = accr.find(x => Math.abs(x.importo - b.netto) <= 1 && giorniTra(b.data_elaborazione, x.data) >= -5 && giorniTra(b.data_elaborazione, x.data) <= 20);
  return m || false;
}

/* ---------- Disegno ---------- */

function renderStipendioSezione() {
  const sez = $('#section-stipendio');
  if (!sez || sez.hidden) return;
  if (!buste.length) {
    $('#st-kpis').innerHTML = '<p class="muted">Nessuna busta paga caricata.</p>';
    return;
  }
  const anni = [...new Set(buste.map(annoB))].sort();
  if (!stState.anno || !anni.includes(stState.anno)) stState.anno = anni.at(-1);
  if (!stState.extraAnno || !anni.includes(stState.extraAnno)) stState.extraAnno = anni.at(-1);
  const prima = mensili()[0], ultima = mensili().at(-1);
  $('#st-period').textContent = `Buste paga ${ultima.datore} · da ${ymNome(kB(prima))} a ${ymNome(kB(ultima))}`;
  renderStKpi(anni);
  renderStMesi(anni);
  renderStAnni(anni);
  renderStExtra(anni);
  renderStBase();
  renderStLista(anni);
}

function renderStKpi(anni) {
  const m = mensili(), u = m.at(-1);
  const annoCor = anni.at(-1), annoPrec = String(Number(annoCor) - 1);
  const mesiCor = buste.filter(b => annoB(b) === annoCor);
  const ultimoMese = Math.max(...mesiCor.map(meseB));
  const nettoAnno = l => l.reduce((s, b) => s + nettoStip(b), 0);
  const cor = nettoAnno(mesiCor);
  const precStesso = buste.filter(b => annoB(b) === annoPrec && meseB(b) <= ultimoMese);
  const delta = precStesso.length ? (cor - nettoAnno(precStesso)) / nettoAnno(precStesso) * 100 : null;
  const sameMonthPrev = m.find(b => kB(b) === `${annoPrec}-${kB(u).slice(5)}`);
  const dUlt = sameMonthPrev ? nettoStip(u) - nettoStip(sameMonthPrev) : null;
  const scatto = u.prossimo_scatto ? ymNome(u.prossimo_scatto.slice(0, 7)) : null;
  const rol = u.rol_residui_ore;
  const tfrAnno = mesiCor.reduce((s, b) => s + (b.tfr || 0), 0), tfrTot = buste.reduce((s, b) => s + (b.tfr || 0), 0);
  const segno = v => `${v >= 0 ? '+' : '−'}${eur0.format(Math.abs(v))}`;
  $('#st-kpis').innerHTML = `
    <div class="kpi"><div class="label">Ultimo stipendio</div><div class="value">${eur0.format(nettoStip(u))}</div>
      <div class="sub">${ymNome(kB(u))}${dUlt !== null ? ` · ${segno(dUlt)} su un anno fa` : ''}${u.rimborso_730 ? ` · più ${eur0.format(u.rimborso_730)} di 730` : ''}</div></div>
    <div class="kpi"><div class="label">Netto ${annoCor}</div><div class="value">${eur0.format(cor)}</div>
      <div class="sub">gennaio-${MESI_LUNGHI[ultimoMese - 1]}${delta !== null ? ` · ${delta >= 0 ? '+' : '−'}${num1.format(Math.abs(delta))}% sul ${annoPrec}` : ''}</div></div>
    <div class="kpi"><div class="label">Paga base</div><div class="value">${eur0.format(u.retribuzione_base)}</div>
      <div class="sub">${scatto ? `prossimo scatto: ${scatto}` : 'al mese, lorda'}</div></div>
    <div class="kpi"><div class="label">Ferie residue</div><div class="value">${annoNum(u.ferie_residue)} gg</div>
      <div class="sub">permessi ${annoNum(u.ex_festivita_residue)} gg · ROL ${rol == null ? '–' : rol < 0 ? `${num1.format(Math.abs(rol))} ore in anticipo` : `${num1.format(rol)} ore`}</div></div>`;
  $('#st-kpis').dataset.tfr = `${tfrAnno}|${tfrTot}`;
}

function renderStMesi(anni) {
  const ys = anni.slice(-4), mis = stState.misura;
  const colori = ['--year-2', '--year-3', '--year-4', '--accent'].slice(-ys.length);
  const valore = b => mis === 'netto' ? nettoStip(b) : b.lordo;
  const opts = baseOptions();
  opts.scales.y.beginAtZero = false;
  opts.scales.y.ticks.callback = v => eur0.format(v);
  opts.plugins.tooltip.callbacks = { label: c => c.parsed.y == null ? null : ` ${c.dataset.label}: ${eur.format(c.parsed.y)}` };
  disegna('chart-st-mesi', {
    type: 'line',
    data: {
      labels: MESI,
      datasets: ys.map((y, i) => ({
        label: y,
        data: MESI.map((_, j) => { const b = mensili().find(x => annoB(x) === y && meseB(x) === j + 1); return b ? +valore(b).toFixed(2) : null; }),
        borderColor: css(colori[i]), backgroundColor: css(colori[i]),
        borderWidth: i === ys.length - 1 ? 3 : 2, pointRadius: 3, pointHoverRadius: 5, tension: 0.25, spanGaps: false,
      })),
    },
    options: opts,
  });
  $('#st-legend').innerHTML = ys.map((y, i) => `<span><i class="line" style="background:var(${colori[i]})"></i>${y}</span>`).join('');
}

const PARTI_LORDO = [
  { id: 'netto', nome: 'Netto', col: '--ord', v: b => b.lordo - b.contributi - b.irpef - b.addizionali },
  { id: 'irpef', nome: 'IRPEF', col: '--uscite', v: b => b.irpef },
  { id: 'addiz', nome: 'Addizionali', col: '--da-pagare', v: b => b.addizionali },
  { id: 'contr', nome: 'Contributi', col: '--str', v: b => b.contributi },
];

function renderStAnni(anni) {
  const per = y => buste.filter(b => annoB(b) === y);
  const somma = (l, f) => l.reduce((s, b) => s + f(b), 0);
  const opts = baseOptions();
  opts.scales.x.stacked = true; opts.scales.y.stacked = true;
  opts.scales.y.ticks.callback = v => eur0.format(v);
  opts.plugins.tooltip.callbacks = {
    label: c => ` ${c.dataset.label}: ${eur0.format(c.parsed.y)}`,
    footer: items => `Lordo: ${eur0.format(items.reduce((s, i) => s + i.parsed.y, 0))}`,
  };
  const ultimo = anni.at(-1), mesiUlt = Math.max(...per(ultimo).map(meseB));
  disegna('chart-st-anni', {
    type: 'bar',
    data: {
      labels: anni.map(y => y === ultimo && mesiUlt < 12 ? `${y}*` : y),
      datasets: PARTI_LORDO.map(p => ({
        label: p.nome, data: anni.map(y => Math.round(somma(per(y), p.v))),
        backgroundColor: css(p.col), borderColor: css('--surface'), borderWidth: { top: 2 }, borderRadius: 4, borderSkipped: 'bottom', maxBarThickness: 56,
      })),
    },
    options: opts,
  });
  $('#st-lordo-legend').innerHTML = PARTI_LORDO.map(p => `<span><i style="background:var(${p.col})"></i>${p.nome}</span>`).join('');
  const righe = anni.map(y => {
    const l = per(y), lordo = somma(l, b => b.lordo), netto = somma(l, b => b.lordo - b.contributi - b.irpef - b.addizionali);
    const tasse = somma(l, tasseB), contr = somma(l, b => b.contributi), r730 = somma(l, b => b.rimborso_730);
    return `<tr><td>${y === ultimo && mesiUlt < 12 ? `${y}*` : y}</td><td>${eur0.format(lordo)}</td><td>${eur0.format(netto)}</td>
      <td>${eur0.format(tasse)}</td><td>${eur0.format(contr)}</td><td>${lordo ? num1.format(netto / lordo * 100) : '–'}%</td>
      <td>${r730 ? eur0.format(r730) : '–'}</td></tr>`;
  }).join('');
  $('#st-anni').innerHTML = `<thead><tr><th>Anno</th><th>Lordo</th><th>Netto</th><th>Tasse</th><th>Contributi</th><th>Al netto</th><th>Rimb. 730</th></tr></thead><tbody>${righe}</tbody>`;
  const [tfrAnno, tfrTot] = ($('#st-kpis').dataset.tfr || '0|0').split('|').map(Number);
  $('#st-anni-foot').textContent = `Tutte le buste dell’anno, comprese tredicesima e quattordicesima. Tasse = IRPEF (con il conguaglio di dicembre e le imposte su premi e arretrati) più addizionali regionale e comunale. `
    + `Il rimborso del 730 arriva in busta ma riguarda le tasse dell’anno prima: è a parte. `
    + `TFR maturato: ${eur0.format(tfrAnno)} nel ${ultimo}, ${eur0.format(tfrTot)} da quando sei in MetLife (dal 2025 va al fondo pensione).`
    + (mesiUlt < 12 ? ` * ${ultimo} fino a ${MESI_LUNGHI[mesiUlt - 1]}.` : '');
}

function renderStExtra(anni) {
  const sel = $('#st-extra-anno');
  sel.innerHTML = [...anni].reverse().map(y => `<option value="${y}"${y === stState.extraAnno ? ' selected' : ''}>${y}</option>`).join('');
  const tot = {};
  for (const b of buste.filter(b => annoB(b) === stState.extraAnno)) {
    for (const v of b.voci) {
      const t = tot[v.nome] ||= { nome: v.nome, importo: 0, fig: !!v.figurativa, volte: 0 };
      t.importo += Number(v.importo) || 0; t.volte++;
    }
  }
  const lista = Object.values(tot);
  const riga = (t, max) => `<div class="cat-riga st-voce${t.importo < 0 ? ' neg' : ''}">
      <span>${esc(t.nome)}${t.volte > 1 ? ` <small class="muted">×${t.volte}</small>` : ''}</span>
      <span class="barra"><i style="width:${max ? Math.max(2, Math.abs(t.importo) / max * 100) : 0}%"></i></span>
      <span class="num">${t.importo < 0 ? '−' : ''}${eur0.format(Math.abs(t.importo))}</span></div>`;
  const disegnaLista = (sel, l) => {
    l.sort((a, b) => Math.abs(b.importo) - Math.abs(a.importo));
    const max = Math.max(0, ...l.map(t => Math.abs(t.importo)));
    $(sel).innerHTML = l.length ? l.map(t => riga(t, max)).join('') : '<p class="muted small-text">Nessuna voce.</p>';
  };
  disegnaLista('#st-extra', lista.filter(t => !t.fig));
  disegnaLista('#st-benefit', lista.filter(t => t.fig));
}

function renderStBase() {
  const m = mensili();
  const opts = baseOptions();
  opts.scales.y.beginAtZero = false;
  opts.scales.y.ticks.callback = v => eur0.format(v);
  opts.scales.x.ticks.maxTicksLimit = 8;
  opts.plugins.tooltip.callbacks = { label: c => ` Paga base: ${eur.format(c.parsed.y)}` };
  disegna('chart-st-base', {
    type: 'line',
    data: {
      labels: m.map(b => `${MESI[meseB(b) - 1]} ${annoB(b).slice(2)}`),
      datasets: [{ data: m.map(b => b.retribuzione_base), borderColor: css('--accent'), backgroundColor: css('--accent'), stepped: true, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 }],
    },
    options: opts,
  });
  const u = m.at(-1), p = m[0];
  const aumenti = m.filter((b, i) => i && b.retribuzione_base !== m[i - 1].retribuzione_base).length;
  $('#st-base-sotto').textContent = `${eur0.format(p.retribuzione_base)} → ${eur0.format(u.retribuzione_base)} (+${num1.format((u.retribuzione_base / p.retribuzione_base - 1) * 100)}%), ${aumenti} aumenti`;
}

function renderStLista(anni) {
  const sel = $('#st-anno');
  sel.innerHTML = [...anni].reverse().map(y => `<option value="${y}"${y === stState.anno ? ' selected' : ''}>${y}</option>`).join('');
  const accr = movMetlife();
  const l = buste.filter(b => annoB(b) === stState.anno).sort((a, b) => b.mese.localeCompare(a.mese) || (a.tipo === 'mensile' ? 1 : -1));
  $('#st-lista').innerHTML = l.map(b => {
    const a = accredito(b, accr);
    const stato = a ? `<span class="st-ok">accreditato il ${fmtData(a.data)}</span>` : a === false ? '<span class="st-ko">accredito non trovato</span>' : '';
    const voci = b.voci.map(v => `<div class="mini-riga"><span>${esc(v.nome)}${v.figurativa ? ' <small>benefit, non in busta</small>' : ''}</span><span></span>
      <span>${Number(v.importo) < 0 ? '−' : ''}${eur.format(Math.abs(Number(v.importo)))}</span></div>`).join('');
    const trat = [['Lordo', b.lordo], ['Contributi', -b.contributi], ['IRPEF', -b.irpef], ['Addizionali', -b.addizionali],
      ...(Math.abs(b.altre_trattenute) >= 0.5 ? [['Altre trattenute e arrotondamenti', -b.altre_trattenute]] : []),
      ...(b.rimborso_730 ? [['Rimborso 730', b.rimborso_730]] : []), ['Netto', b.netto]]
      .map(([n, v], i, arr) => `<div class="mini-riga${i === 0 || i === arr.length - 1 ? ' st-tot' : ''}"><span>${n}</span><span></span><span>${v < 0 ? '−' : ''}${eur.format(Math.abs(v))}</span></div>`).join('');
    return `<details class="st-busta">
      <summary>
        <span class="st-nome">${ymNome(kB(b)).replace(/^./, c => c.toUpperCase())}${TIPO_BREVE[b.tipo] ? ` <span class="badge">${TIPO_BREVE[b.tipo]}</span>` : ''}</span>
        <span class="num">${eur0.format(b.netto)}</span>
        <span class="st-sotto">lordo ${eur0.format(b.lordo)}${b.rimborso_730 ? ` · 730 ${eur0.format(b.rimborso_730)}` : ''}${stato ? ` · ${stato}` : ''}</span>
      </summary>
      <div class="st-dett">
        <div class="mini-lista">${trat}</div>
        ${voci ? `<div class="mini-lista"><div class="mini-riga mini-head"><span>Voci del mese</span><span></span><span></span></div>${voci}</div>` : ''}
        <p class="foot muted">${b.data_elaborazione ? `Busta del ${fmtData(b.data_elaborazione)}. ` : ''}${b.tfr ? `TFR maturato ${eur.format(b.tfr)}. ` : ''}${b.tipo === 'mensile' && b.ferie_residue != null ? `Ferie residue ${annoNum(b.ferie_residue)} gg.` : ''}
          ${b.file_url ? `<a class="link" href="${esc(b.file_url)}" target="_blank" rel="noopener">Apri il PDF</a>` : ''}</p>
      </div>
    </details>`;
  }).join('') || '<p class="muted">Nessuna busta in questo anno.</p>';
}

/* ---------- Eventi ---------- */

$('#st-misura').addEventListener('click', e => {
  const b = e.target.closest('[data-misura]'); if (!b) return;
  stState.misura = b.dataset.misura;
  $$('#st-misura button').forEach(x => x.classList.toggle('on', x === b));
  renderStMesi([...new Set(buste.map(annoB))].sort());
});
$('#st-anno').addEventListener('change', e => { stState.anno = e.target.value; renderStLista([...new Set(buste.map(annoB))].sort()); });
$('#st-extra-anno').addEventListener('change', e => { stState.extraAnno = e.target.value; renderStExtra([...new Set(buste.map(annoB))].sort()); });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => renderStipendioSezione());

// Se l'accesso è già avvenuto prima che questo file fosse caricato, carica subito le buste
if (typeof currentUser !== 'undefined' && currentUser && !buste.length) caricaStipendio();

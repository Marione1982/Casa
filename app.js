// Casa – web app per i conti di casa. Sezione attiva: Forniture (luce, gas, acqua).
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const TIPI = ['luce', 'gas', 'acqua'];
const NOMI = { luce: 'Luce', gas: 'Gas', acqua: 'Acqua' };
const UNITA = { luce: 'kWh', gas: 'Smc', acqua: 'm³' };
const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const MESI_LUNGHI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
const eur0 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' });
const num0 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0, useGrouping: 'always' });
const num1 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1, useGrouping: 'always' });
const num2 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const fmtConsumo = (v, tipo) => `${(tipo === 'luce' ? num0 : num1).format(v)} ${UNITA[tipo]}`;

let sb = null;
let bollette = [];
let state = { tipo: 'tutte', confrontoTipo: 'luce', misura: 'spesa', anno: null }; // anno null = ultimo anno disponibile
const charts = {};

/* ---------- Avvio e accesso ---------- */

async function init() {
  const cfg = window.CASA_SUPABASE;
  if (!window.supabase?.createClient || !cfg) { showAuth('Collegamento a Supabase non configurato.', true); return; }
  sb = window.supabase.createClient(cfg.url, cfg.publishableKey);
  sb.auth.onAuthStateChange((_e, session) => setTimeout(() => handleSession(session), 0));
  const { data, error } = await sb.auth.getSession();
  if (error) { showAuth('Non riesco a verificare l’accesso. Ricarica la pagina.', true); return; }
  handleSession(data.session);
}

let currentUser = null;
async function handleSession(session) {
  const user = session?.user || null;
  if (user?.id === currentUser?.id && bollette.length) return;
  currentUser = user;
  if (!user) { showAuth(''); return; }
  $('#auth-view').hidden = true;
  $('#app-view').hidden = false;
  await caricaDati();
  $('#loading').hidden = true;
}

function showAuth(msg, isError = false) {
  $('#loading').hidden = true;
  $('#app-view').hidden = true;
  $('#auth-view').hidden = false;
  const m = $('#auth-message');
  m.textContent = msg || '';
  m.classList.toggle('error', isError);
}

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const m = $('#auth-message');
  m.textContent = 'Accesso in corso…'; m.classList.remove('error');
  const { error } = await sb.auth.signInWithPassword({ email: $('#login-email').value.trim(), password: $('#login-password').value });
  if (error) { m.textContent = 'Email o password non corretti.'; m.classList.add('error'); }
});
$('#logout-btn').addEventListener('click', async () => { await sb.auth.signOut(); bollette = []; });

/* ---------- Dati ---------- */

async function caricaDati() {
  const { data, error } = await sb.from('casa_bollette').select('*').order('periodo_al', { ascending: true });
  if (error) { alert('Non riesco a leggere le bollette: ' + error.message); return; }
  bollette = data.map(r => ({
    ...r,
    importo: Number(r.importo), consumo: Number(r.consumo),
    oneri_extra: Number(r.oneri_extra), bonus: Number(r.bonus),
  }));
  render();
}

// Ricarica quando si torna sull'app (es. dopo aver aggiunto una bolletta da un altro dispositivo)
document.addEventListener('visibilitychange', () => { if (!document.hidden && currentUser) caricaDati(); });

const giorno = 86400000;
const toDate = s => new Date(s + 'T00:00:00Z');

// Ripartisce ogni bolletta sui mesi del suo periodo, in proporzione ai giorni.
function ripartizioneMensile(lista) {
  const mesi = {}; // chiave 'YYYY-MM' -> { luce:{spesa,consumo,netto}, ... }
  for (const b of lista) {
    const dal = toDate(b.periodo_dal), al = toDate(b.periodo_al);
    const tot = Math.round((al - dal) / giorno) + 1;
    const netto = b.importo - b.oneri_extra + b.bonus;
    let d = new Date(dal);
    while (d <= al) {
      const y = d.getUTCFullYear(), m = d.getUTCMonth();
      const fineMese = new Date(Date.UTC(y, m + 1, 0));
      const fine = fineMese < al ? fineMese : al;
      const gg = Math.round((fine - d) / giorno) + 1;
      const f = gg / tot;
      const k = `${y}-${String(m + 1).padStart(2, '0')}`;
      const slot = (mesi[k] ??= {})[b.tipo] ??= { spesa: 0, consumo: 0, netto: 0 };
      slot.spesa += b.importo * f;
      slot.consumo += b.consumo * f;
      slot.netto += netto * f;
      d = new Date(fine.getTime() + giorno);
    }
  }
  return mesi;
}

function perAnno(mesi) {
  const anni = {};
  for (const [k, v] of Object.entries(mesi)) {
    const y = k.slice(0, 4);
    for (const t of TIPI) if (v[t]) {
      const s = (anni[y] ??= {})[t] ??= { spesa: 0, consumo: 0, netto: 0 };
      s.spesa += v[t].spesa; s.consumo += v[t].consumo; s.netto += v[t].netto;
    }
  }
  return anni;
}

const tipiAttivi = () => state.tipo === 'tutte' ? TIPI : [state.tipo];
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function copertura(tipo) {
  const l = bollette.filter(b => b.tipo === tipo);
  if (!l.length) return null;
  return { dal: l.reduce((a, b) => b.periodo_dal < a ? b.periodo_dal : a, l[0].periodo_dal), al: l.reduce((a, b) => b.periodo_al > a ? b.periodo_al : a, l[0].periodo_al) };
}
const meseAnno = s => { const d = toDate(s); return `${MESI_LUNGHI[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

/* ---------- Rendering ---------- */

function render() {
  const mesi = ripartizioneMensile(bollette);
  const anni = perAnno(mesi);
  renderPeriodo();
  renderKpi(mesi, anni);
  renderAnni(anni);
  renderConfronto(mesi);
  renderTipi(anni);
  renderLista();
}

function renderPeriodo() {
  const cov = tipiAttivi().map(copertura).filter(Boolean);
  if (!cov.length) { $('#period-label').textContent = 'Nessuna bolletta'; return; }
  const dal = cov.map(c => c.dal).sort()[0];
  const al = cov.map(c => c.al).sort().at(-1);
  $('#period-label').textContent = `${tipiAttivi().map(t => NOMI[t]).join(', ')} · da ${meseAnno(dal)} a ${meseAnno(al)}`;
}

function renderKpi(mesi, anni) {
  const tipi = tipiAttivi();
  const lista = bollette.filter(b => tipi.includes(b.tipo));
  const totale = lista.reduce((s, b) => s + b.importo, 0);
  const chiavi = Object.keys(mesi).filter(k => tipi.some(t => mesi[k][t])).sort();
  const nMesi = chiavi.length || 1;
  const annoPieno = Object.keys(anni).filter(y => {
    // ultimo anno con tutti i 12 mesi coperti per i tipi selezionati
    return tipi.every(t => MESI.every((_, i) => mesi[`${y}-${String(i + 1).padStart(2, '0')}`]?.[t]));
  }).sort().at(-1);
  const spesaAnno = y => tipi.reduce((s, t) => s + (anni[y]?.[t]?.spesa || 0), 0);
  let annoHtml = '<div class="value">–</div>';
  if (annoPieno) {
    const prev = String(Number(annoPieno) - 1);
    const cur = spesaAnno(annoPieno), p = anni[prev] ? spesaAnno(prev) : null;
    const delta = p ? (cur - p) / Math.abs(p) * 100 : null;
    annoHtml = `<div class="value">${eur0.format(cur)}</div><div class="sub">${delta === null ? 'primo anno completo' : `${delta >= 0 ? '+' : '−'}${num0.format(Math.abs(delta))}% rispetto al ${prev}`}</div>`;
  }
  const extra = lista.reduce((s, b) => s + b.oneri_extra, 0);
  const bonus = lista.reduce((s, b) => s + b.bonus, 0);
  $('#kpis').innerHTML = `
    <div class="kpi"><div class="label">Speso in totale</div><div class="value">${eur0.format(totale)}</div><div class="sub">${lista.filter(b => b.categoria === 'bolletta').length} bollette</div></div>
    <div class="kpi"><div class="label">Media al mese</div><div class="value">${eur0.format(totale / nMesi)}</div><div class="sub">su ${nMesi} mesi</div></div>
    <div class="kpi"><div class="label">Ultimo anno completo${annoPieno ? ` (${annoPieno})` : ''}</div>${annoHtml}</div>
    <div class="kpi"><div class="label">Bonus ricevuti</div><div class="value">${eur0.format(bonus)}</div><div class="sub">oneri extra ${eur0.format(extra)}</div></div>`;
}

function baseOptions() {
  const text = css('--text-2'), grid = css('--grid');
  return {
    responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: css('--surface'), titleColor: css('--text'), bodyColor: css('--text-2'),
        borderColor: css('--border'), borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true,
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: text, font: { family: 'DM Sans' } }, border: { color: grid } },
      y: { grid: { color: grid }, border: { display: false }, ticks: { color: text, font: { family: 'DM Sans' }, maxTicksLimit: 6 }, beginAtZero: true },
    },
  };
}

function disegna(id, config) {
  charts[id]?.destroy();
  charts[id] = new Chart($('#' + id), config);
}

function renderAnni(anni) {
  const ys = Object.keys(anni).sort();
  const tipi = tipiAttivi();
  const ultimo = ys.at(-1);
  const opts = baseOptions();
  opts.scales.x.stacked = true; opts.scales.y.stacked = true;
  opts.scales.y.ticks.callback = v => eur0.format(v);
  opts.plugins.tooltip.callbacks = {
    label: c => ` ${c.dataset.label}: ${eur.format(c.parsed.y)}`,
    footer: items => tipi.length > 1 ? `Totale: ${eur.format(items.reduce((s, i) => s + i.parsed.y, 0))}` : '',
  };
  disegna('chart-anni', {
    type: 'bar',
    data: {
      labels: ys.map(y => y === ultimo ? `${y}*` : y),
      datasets: tipi.map(t => ({
        label: NOMI[t], data: ys.map(y => +(anni[y][t]?.spesa || 0).toFixed(2)),
        backgroundColor: css('--' + t), borderColor: css('--surface'), borderWidth: { top: 2 },
        borderRadius: 4, borderSkipped: 'bottom', maxBarThickness: 56,
      })),
    },
    options: opts,
  });
  $('#legend-anni').innerHTML = tipi.length > 1 ? tipi.map(t => `<span><i style="background:var(--${t})"></i>${NOMI[t]}</span>`).join('') : '';
  const fino = tipi.map(t => { const c = copertura(t); return c ? `${NOMI[t].toLowerCase()} fino a ${meseAnno(c.al)}` : ''; }).filter(Boolean).join(', ');
  $('#anni-foot').textContent = `* ${ultimo} in corso: ${fino}. Le spese sono attribuite ai mesi di consumo, non a quelli di pagamento.`;
}

function renderConfronto(mesi) {
  const t = state.confrontoTipo, mis = state.misura;
  $$('#confronto-tipo button').forEach(b => b.classList.toggle('on', b.dataset.tipo === t));
  $$('#confronto-misura button').forEach(b => b.classList.toggle('on', b.dataset.misura === mis));
  $('#confronto-misura button[data-misura="consumo"]').textContent = `Consumo ${UNITA[t]}`;
  const ys = [...new Set(Object.keys(mesi).filter(k => mesi[k][t]).map(k => k.slice(0, 4)))].sort();
  const greys = ['--year-1', '--year-2', '--year-3', '--year-4'];
  const colore = (i) => i === ys.length - 1 ? css('--' + t) : css(greys[Math.max(0, greys.length - (ys.length - 1 - i))] || '--year-1');
  const opts = baseOptions();
  const fmt = v => mis === 'spesa' ? eur.format(v) : fmtConsumo(v, t);
  opts.scales.y.ticks.callback = v => mis === 'spesa' ? eur0.format(v) : num0.format(v);
  opts.plugins.tooltip.callbacks = { label: c => c.parsed.y == null ? null : ` ${c.dataset.label}: ${fmt(c.parsed.y)}` };
  opts.plugins.tooltip.itemSort = (a, b) => b.datasetIndex - a.datasetIndex;
  disegna('chart-confronto', {
    type: 'line',
    data: {
      labels: MESI,
      datasets: ys.map((y, i) => ({
        label: y,
        data: MESI.map((_, m) => { const v = mesi[`${y}-${String(m + 1).padStart(2, '0')}`]?.[t]; return v ? +v[mis].toFixed(2) : null; }),
        borderColor: colore(i), backgroundColor: colore(i),
        borderWidth: i === ys.length - 1 ? 2.5 : 2, pointRadius: i === ys.length - 1 ? 3 : 0, pointHoverRadius: 5,
        tension: 0.3, spanGaps: false, order: ys.length - i,
      })),
    },
    options: opts,
  });
  $('#legend-confronto').innerHTML = ys.map((y, i) => `<span><i class="line" style="background:${colore(i)}"></i>${y}</span>`).join('');
}

function renderTipi(anni) {
  const ys = Object.keys(anni).sort();
  const box = $('#tipi');
  box.innerHTML = tipiAttivi().map(t => {
    const l = bollette.filter(b => b.tipo === t);
    const spesa = l.reduce((s, b) => s + b.importo, 0);
    const cons = l.reduce((s, b) => s + b.consumo, 0);
    const righe = ys.filter(y => anni[y][t]).map(y => {
      const a = anni[y][t];
      const unit = a.consumo > 0 ? a.netto / a.consumo : null;
      return `<tr><td>${y}</td><td>${eur0.format(a.spesa)}</td><td>${fmtConsumo(a.consumo, t)}</td><td>${unit === null ? '–' : eur.format(unit)}</td></tr>`;
    }).join('');
    return `<article class="card tipo-card">
      <header class="card-head"><h2><i class="dot ${t}"></i>${NOMI[t]}</h2><span class="muted small-text">${[...new Set(l.map(b => b.fornitore))].at(-1) || ''}</span></header>
      <div class="row2"><div><div class="muted small-text">Speso</div><div class="big">${eur0.format(spesa)}</div></div>
      <div style="text-align:right"><div class="muted small-text">Consumato</div><div class="big">${fmtConsumo(cons, t)}</div></div></div>
      <div class="chart-box mini"><canvas id="mini-${t}" aria-label="Consumo per anno ${NOMI[t]}"></canvas></div>
      <table class="years"><thead><tr><th>Anno</th><th>Spesa</th><th>Consumo</th><th>€/${UNITA[t]}</th></tr></thead><tbody>${righe}</tbody></table>
    </article>`;
  }).join('');
  for (const t of tipiAttivi()) {
    const yy = ys.filter(y => anni[y][t]);
    const opts = baseOptions();
    opts.scales.y.ticks.callback = v => num0.format(v);
    opts.scales.y.ticks.maxTicksLimit = 4;
    opts.plugins.tooltip.callbacks = { label: c => ` Consumo: ${fmtConsumo(c.parsed.y, t)}` };
    disegna('mini-' + t, {
      type: 'bar',
      data: { labels: yy, datasets: [{ label: 'Consumo', data: yy.map(y => +anni[y][t].consumo.toFixed(1)), backgroundColor: css('--' + t), borderRadius: 4, borderSkipped: 'bottom', maxBarThickness: 36 }] },
      options: opts,
    });
  }
}

function renderLista() {
  const tipi = tipiAttivi();
  const lista = bollette.filter(b => tipi.includes(b.tipo));
  const anni = [...new Set(lista.map(b => b.periodo_al.slice(0, 4)))].sort().reverse();
  const sel = $('#anno-filter');
  if (state.anno === null || (state.anno !== 'tutti' && !anni.includes(state.anno))) state.anno = anni[0] || 'tutti';
  sel.innerHTML = `<option value="tutti">Tutti gli anni</option>` + anni.map(y => `<option value="${y}" ${state.anno === y ? 'selected' : ''}>${y}</option>`).join('');
  const vis = lista.filter(b => state.anno === 'tutti' || b.periodo_al.startsWith(state.anno))
    .sort((a, b) => b.periodo_al.localeCompare(a.periodo_al) || a.tipo.localeCompare(b.tipo));
  if (!vis.length) { $('#lista').innerHTML = '<p class="muted">Nessuna bolletta.</p>'; return; }
  $('#lista').innerHTML = vis.map(b => `
    <div class="riga">
      <i class="dot ${b.tipo}" title="${NOMI[b.tipo]}"></i>
      <div><div class="codice">${esc(b.codice)}${b.categoria !== 'bolletta' ? `<span class="badge">${b.categoria}</span>` : ''}</div><div class="forn">${esc(b.fornitore)}</div></div>
      <div class="periodo">${fmtData(b.periodo_dal)} – ${fmtData(b.periodo_al)}</div>
      <div class="num consumo">${b.consumo ? fmtConsumo(b.consumo, b.tipo) : '–'}</div>
      <div class="num importo ${b.importo < 0 ? 'neg' : ''}">${eur.format(b.importo)}</div>
      <div class="azioni">${b.file_url ? `<a class="link" href="${esc(b.file_url)}" target="_blank" rel="noopener">PDF</a>` : ''}<button class="icon-btn" data-edit="${b.id}" aria-label="Modifica ${esc(b.codice)}">Modifica</button></div>
      ${b.note ? `<div class="nota">${esc(b.note)}</div>` : ''}
    </div>`).join('');
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Interazioni ---------- */

$('#tipo-filter').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.tipo = b.dataset.tipo;
  if (state.tipo !== 'tutte') state.confrontoTipo = state.tipo;
  $$('#tipo-filter button').forEach(x => x.classList.toggle('on', x === b));
  render();
});
$('#confronto-tipo').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.confrontoTipo = b.dataset.tipo; renderConfronto(ripartizioneMensile(bollette));
});
$('#confronto-misura').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.misura = b.dataset.misura; renderConfronto(ripartizioneMensile(bollette));
});
$('#anno-filter').addEventListener('change', e => { state.anno = e.target.value; renderLista(); });

$$('.section-tab').forEach(tab => tab.addEventListener('click', () => {
  $$('.section-tab').forEach(t => t.classList.toggle('active', t === tab));
  $$('.section').forEach(s => s.hidden = s.id !== 'section-' + tab.dataset.section);
}));

// Ridisegna i grafici quando cambia il tema chiaro/scuro
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => bollette.length && render());

/* ---------- Finestra bolletta ---------- */

const dlg = $('#bolletta-dialog');
const form = $('#bolletta-form');
let editId = null;
const CAMPI = ['tipo', 'codice', 'fornitore', 'categoria', 'periodo_dal', 'periodo_al', 'importo', 'consumo', 'data_emissione', 'oneri_extra', 'bonus', 'file_url', 'note'];

function apriDialog(b = null) {
  editId = b?.id || null;
  form.reset();
  $('#dialog-title').textContent = b ? `Modifica ${b.codice}` : 'Nuova bolletta';
  $('#delete-btn').hidden = !b;
  $('#dialog-message').textContent = '';
  const def = b || { tipo: state.tipo === 'tutte' ? 'luce' : state.tipo, categoria: 'bolletta', consumo: 0, oneri_extra: 0, bonus: 0 };
  if (!b) { const ult = bollette.filter(x => x.tipo === def.tipo).at(-1); if (ult) def.fornitore = ult.fornitore; }
  for (const c of CAMPI) if (def[c] != null) form.elements[c].value = def[c];
  aggiornaUnita();
  dlg.showModal();
}
function aggiornaUnita() { $('#consumo-label').textContent = `Consumo (${UNITA[form.elements.tipo.value]})`; }
form.elements.tipo.addEventListener('change', aggiornaUnita);
$('#add-btn').addEventListener('click', () => apriDialog());
$('#lista').addEventListener('click', e => {
  const id = e.target.closest('[data-edit]')?.dataset.edit;
  if (id) apriDialog(bollette.find(b => b.id === id));
});
$('#cancel-btn').addEventListener('click', () => dlg.close());

form.addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#dialog-message');
  const r = {};
  for (const c of CAMPI) { const v = form.elements[c].value.trim(); r[c] = v === '' ? null : v; }
  for (const c of ['importo', 'consumo', 'oneri_extra', 'bonus']) r[c] = r[c] == null ? 0 : Number(r[c]);
  if (r.periodo_al < r.periodo_dal) { msg.textContent = 'La fine del periodo è prima dell’inizio.'; msg.classList.add('error'); return; }
  msg.textContent = 'Salvataggio…'; msg.classList.remove('error');
  const q = editId ? sb.from('casa_bollette').update(r).eq('id', editId) : sb.from('casa_bollette').insert(r);
  const { error } = await q;
  if (error) { msg.textContent = error.code === '23505' ? 'Esiste già una bolletta con questo nome per questo tipo.' : 'Errore: ' + error.message; msg.classList.add('error'); return; }
  dlg.close(); await caricaDati();
});

$('#delete-btn').addEventListener('click', async () => {
  const b = bollette.find(x => x.id === editId);
  if (!b || !confirm(`Eliminare la bolletta ${b.codice} (${NOMI[b.tipo]})? Il PDF su OneDrive resta dov’è.`)) return;
  const { error } = await sb.from('casa_bollette').delete().eq('id', editId);
  if (error) { $('#dialog-message').textContent = 'Errore: ' + error.message; return; }
  dlg.close(); await caricaDati();
});

init();

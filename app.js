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
let fv = [];      // casa_fotovoltaico
let gse = [];     // casa_gse_bonifici
let fvDisponibile = false; // false finché le tabelle del fotovoltaico non esistono
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
  const [b, f, g] = await Promise.all([
    sb.from('casa_bollette').select('*').order('periodo_al', { ascending: true }),
    sb.from('casa_fotovoltaico').select('*').order('periodo_al', { ascending: true }),
    sb.from('casa_gse_bonifici').select('*').order('data_accredito', { ascending: true }),
  ]);
  if (b.error) { alert('Non riesco a leggere le bollette: ' + b.error.message); return; }
  bollette = b.data.map(r => ({
    ...r,
    importo: Number(r.importo), consumo: Number(r.consumo),
    oneri_extra: Number(r.oneri_extra), bonus: Number(r.bonus),
  }));
  fvDisponibile = !f.error && !g.error;
  fv = (f.data || []).map(r => ({ ...r, kwh_prodotti: Number(r.kwh_prodotti), kwh_immessi: r.kwh_immessi == null ? null : Number(r.kwh_immessi) }));
  gse = (g.data || []).map(r => ({ ...r, importo: Number(r.importo) }));
  render();
}

// Bimestri del fotovoltaico arricchiti con il prelievo dalla bolletta luce dello stesso nome
function fvBimestri() {
  return fv.map(r => {
    const bol = bollette.find(b => b.tipo === 'luce' && b.categoria === 'bolletta' && b.codice === r.codice);
    const prelievo = bol ? bol.consumo : null;
    const venduti = r.kwh_immessi ?? 0;
    const autoconsumo = Math.max(0, r.kwh_prodotti - venduti);
    return { ...r, prelievo, autoconsumo, venduti, consumoTotale: (prelievo ?? 0) + autoconsumo };
  });
}
const NOMI_BIM = ['Gen-Feb', 'Mar-Apr', 'Mag-Giu', 'Lug-Ago', 'Set-Ott', 'Nov-Dic'];
const etichettaBimestre = codice => { const m = Number(codice.slice(4, 6)); return `${NOMI_BIM[Math.ceil(m / 2) - 1] || codice.slice(4)} ${codice.slice(2, 4)}`; };

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
  renderFotovoltaico();
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

function renderFotovoltaico() {
  const card = $('#fv-card');
  card.hidden = !fvDisponibile || !(state.tipo === 'tutte' || state.tipo === 'luce');
  if (card.hidden) return;
  const bim = fvBimestri();
  const prod = bim.reduce((s, r) => s + r.kwh_prodotti, 0);
  const auto = bim.reduce((s, r) => s + r.autoconsumo, 0);
  const vend = bim.reduce((s, r) => s + r.venduti, 0);
  const tot = bim.reduce((s, r) => s + r.consumoTotale, 0);
  const bonifici = gse.reduce((s, r) => s + r.importo, 0);
  const primo = bim[0]?.periodo_dal;
  const speseLuce = bollette.filter(b => b.tipo === 'luce' && primo && b.periodo_al >= primo).reduce((s, b) => s + b.importo, 0);
  const kwh = v => `${num0.format(v)} kWh`;
  $('#fv-kpis').innerHTML = bim.length ? `
    <div class="kpi"><div class="label">Prodotti</div><div class="value">${kwh(prod)}</div><div class="sub">dal ${primo ? meseAnno(primo) : ''}</div></div>
    <div class="kpi"><div class="label">Autoconsumati</div><div class="value">${kwh(auto)}</div><div class="sub">${num0.format(auto / prod * 100)}% della produzione</div></div>
    <div class="kpi"><div class="label">Venduti alla rete</div><div class="value">${kwh(vend)}</div><div class="sub">${num0.format(vend / prod * 100)}% della produzione</div></div>
    <div class="kpi"><div class="label">Coperto dal fotovoltaico</div><div class="value">${num0.format(auto / tot * 100)}%</div><div class="sub">del consumo totale (${kwh(tot)})</div></div>
    <div class="kpi"><div class="label">Bonifici GSE</div><div class="value">${eur0.format(bonifici)}</div><div class="sub">${gse.length} accrediti</div></div>
    <div class="kpi"><div class="label">Spesa luce netta</div><div class="value">${eur0.format(speseLuce - bonifici)}</div><div class="sub">bollette ${eur0.format(speseLuce)} − GSE</div></div>`
    : '<p class="muted">Nessun dato del fotovoltaico. Aggiungi un bimestre.</p>';

  const labels = bim.map(r => etichettaBimestre(r.codice));
  const opts = baseOptions();
  opts.scales.x.stacked = true; opts.scales.y.stacked = true;
  opts.scales.x.ticks.maxRotation = 0; opts.scales.x.ticks.autoSkip = true; opts.scales.x.ticks.maxTicksLimit = 12;
  opts.scales.y.ticks.callback = v => num0.format(v);
  opts.plugins.tooltip.callbacks = {
    label: c => ` ${c.dataset.label}: ${kwh(c.parsed.y)}`,
    footer: items => {
      const r = bim[items[0].dataIndex];
      return [`Consumo totale: ${kwh(r.consumoTotale)}`, r.kwh_immessi == null ? 'Venduti non disponibili' : `Venduti: ${kwh(r.venduti)}`, r.prelievo == null ? 'Bolletta luce non ancora inserita' : ''].filter(Boolean);
    },
  };
  disegna('chart-fv', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { type: 'line', label: 'Prodotti', data: bim.map(r => r.kwh_prodotti), borderColor: css('--text-2'), backgroundColor: css('--text-2'), borderDash: [5, 4], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.3, stack: 'prod', order: 0 },
        { label: 'Dal fotovoltaico', data: bim.map(r => +r.autoconsumo.toFixed(1)), backgroundColor: css('--fv'), borderColor: css('--surface'), borderWidth: { top: 2 }, borderRadius: 4, borderSkipped: 'bottom', stack: 'cons', order: 2 },
        { label: 'Dalla rete', data: bim.map(r => r.prelievo ?? 0), backgroundColor: css('--rete'), borderRadius: 4, borderSkipped: 'bottom', stack: 'cons', order: 1 },
      ],
    },
    options: opts,
  });
  $('#legend-fv').innerHTML = `<span><i style="background:var(--rete)"></i>Dalla rete</span><span><i style="background:var(--fv)"></i>Dal fotovoltaico</span><span><i class="line" style="background:var(--text-2)"></i>Prodotti</span>`;

  // Riepilogo per anno (anno del bimestre)
  const perY = {};
  for (const r of bim) {
    const y = r.codice.slice(0, 4); const a = perY[y] ??= { prod: 0, auto: 0, vend: 0, tot: 0, gse: 0 };
    a.prod += r.kwh_prodotti; a.auto += r.autoconsumo; a.vend += r.venduti; a.tot += r.consumoTotale;
  }
  for (const g of gse) { const y = g.data_accredito.slice(0, 4); (perY[y] ??= { prod: 0, auto: 0, vend: 0, tot: 0, gse: 0 }).gse += g.importo; }
  $('#fv-anni').innerHTML = `<thead><tr><th>Anno</th><th>Prodotti</th><th>Autocons.</th><th>Venduti</th><th>Coperto</th><th>GSE</th></tr></thead><tbody>` +
    Object.keys(perY).sort().map(y => { const a = perY[y]; return `<tr><td>${y}</td><td>${num0.format(a.prod)}</td><td>${num0.format(a.auto)}</td><td>${num0.format(a.vend)}</td><td>${a.tot ? num0.format(a.auto / a.tot * 100) + '%' : '–'}</td><td>${a.gse ? eur.format(a.gse) : '–'}</td></tr>`; }).join('') + '</tbody>';

  $('#fv-lista').innerHTML = (bim.length ? '<div class="mini-riga mini-head"><span>Bimestre</span><span>kWh prodotti / venduti</span><span></span></div>' : '') + [...bim].reverse().map(r => `<div class="mini-riga"><div><span class="codice">${esc(r.codice)}</span> <small>${etichettaBimestre(r.codice)}${r.note ? ' · ' + esc(r.note) : ''}</small></div><div>${num0.format(r.kwh_prodotti)} / ${r.kwh_immessi == null ? '–' : num0.format(r.kwh_immessi)}</div><button class="icon-btn" data-fv="${r.id}">Modifica</button></div>`).join('') || '<p class="muted">Nessun bimestre.</p>';
  $('#gse-lista').innerHTML = (gse.length ? '<div class="mini-riga mini-head"><span>Data</span><span>Importo</span><span></span></div>' : '') + [...gse].reverse().map(g => `<div class="mini-riga"><div>${fmtData(g.data_accredito)}${g.note ? `<small>${esc(g.note)}</small>` : ''}</div><div>${eur.format(g.importo)}</div><button class="icon-btn" data-gse="${g.id}">Modifica</button></div>`).join('') || '<p class="muted">Nessun bonifico.</p>';
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
      ${fvRiga(b)}
    </div>`).join('');
}

function fvRiga(b) {
  if (b.tipo !== 'luce' || b.categoria !== 'bolletta') return '';
  const r = fv.find(x => x.codice === b.codice);
  if (!r) return '';
  return `<div class="fv-riga"><i class="dot fv"></i>FV: prodotti ${num0.format(r.kwh_prodotti)} kWh · venduti ${r.kwh_immessi == null ? 'n.d.' : num0.format(r.kwh_immessi) + ' kWh'}</div>`;
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

/* ---------- Finestre fotovoltaico e GSE ---------- */

function setupDialog({ dlgSel, formSel, table, campi, numerici, titolo, getRow, defaults, delSel, msgSel, descr }) {
  const d = $(dlgSel), f = $(formSel);
  let id = null;
  const apri = row => {
    id = row?.id || null; f.reset();
    $(msgSel).textContent = '';
    $(delSel).hidden = !row;
    d.querySelector('h2').textContent = row ? `Modifica ${titolo}` : `Nuovo ${titolo}`;
    const v = row || defaults();
    for (const c of campi) if (v[c] != null) f.elements[c].value = v[c];
    d.showModal();
  };
  d.querySelector('[data-close]').addEventListener('click', () => d.close());
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const r = {};
    for (const c of campi) { const v = f.elements[c].value.trim(); r[c] = v === '' ? null : (numerici.includes(c) ? Number(v) : v); }
    if (r.periodo_dal && r.periodo_al && r.periodo_al < r.periodo_dal) { $(msgSel).textContent = 'La fine del periodo è prima dell’inizio.'; return; }
    $(msgSel).textContent = 'Salvataggio…';
    const { error } = id ? await sb.from(table).update(r).eq('id', id) : await sb.from(table).insert(r);
    if (error) { $(msgSel).textContent = error.code === '23505' ? 'Esiste già un dato per questo bimestre.' : 'Errore: ' + error.message; return; }
    d.close(); await caricaDati();
  });
  $(delSel).addEventListener('click', async () => {
    const row = getRow(id);
    if (!row || !confirm(`Eliminare ${descr(row)}?`)) return;
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) { $(msgSel).textContent = 'Errore: ' + error.message; return; }
    d.close(); await caricaDati();
  });
  return apri;
}

const apriFv = setupDialog({
  dlgSel: '#fv-dialog', formSel: '#fv-form', table: 'casa_fotovoltaico', titolo: 'bimestre fotovoltaico',
  campi: ['codice', 'periodo_dal', 'periodo_al', 'kwh_prodotti', 'kwh_immessi', 'note'], numerici: ['kwh_prodotti', 'kwh_immessi'],
  getRow: id => fv.find(r => r.id === id), msgSel: '#fv-message', delSel: '#fv-delete-btn',
  descr: r => `i dati del fotovoltaico ${r.codice}`,
  defaults: () => {
    // propone la prima bolletta luce senza dati del fotovoltaico
    const b = [...bollette].reverse().find(x => x.tipo === 'luce' && x.categoria === 'bolletta' && !fv.some(r => r.codice === x.codice));
    return b ? { codice: b.codice, periodo_dal: b.periodo_dal, periodo_al: b.periodo_al } : {};
  },
});
const apriGse = setupDialog({
  dlgSel: '#gse-dialog', formSel: '#gse-form', table: 'casa_gse_bonifici', titolo: 'bonifico GSE',
  campi: ['data_accredito', 'importo', 'note'], numerici: ['importo'],
  getRow: id => gse.find(r => r.id === id), msgSel: '#gse-message', delSel: '#gse-delete-btn',
  descr: r => `il bonifico GSE del ${fmtData(r.data_accredito)}`,
  defaults: () => ({ data_accredito: new Date().toISOString().slice(0, 10) }),
});
// Il codice del bimestre compila da solo le date, se c'è la bolletta luce corrispondente
$('#fv-form').elements.codice.addEventListener('change', e => {
  const b = bollette.find(x => x.tipo === 'luce' && x.categoria === 'bolletta' && x.codice === e.target.value.trim());
  if (b) { e.target.form.elements.periodo_dal.value = b.periodo_dal; e.target.form.elements.periodo_al.value = b.periodo_al; }
});
$('#fv-add-btn').addEventListener('click', () => apriFv());
$('#gse-add-btn').addEventListener('click', () => apriGse());
$('#fv-card').addEventListener('click', e => {
  const f = e.target.closest('[data-fv]')?.dataset.fv; if (f) apriFv(fv.find(r => r.id === f));
  const g = e.target.closest('[data-gse]')?.dataset.gse; if (g) apriGse(gse.find(r => r.id === g));
});

init();

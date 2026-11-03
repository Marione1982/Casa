// Casa – riquadro "Prossime bollette" della sezione Forniture.
// Stima importo, data di arrivo e data di pagamento delle bollette non ancora arrivate,
// partendo dallo storico in casa_bollette e dagli addebiti trovati in casa_movimenti.
// Usa le funzioni e i dati globali di app.js (e movimenti.js, se caricato).
'use strict';

// Parole da cercare nella descrizione del movimento bancario per riconoscere il pagamento
const CHIAVI_PAGAMENTO = { luce: ['EDISON'], gas: ['AMGAS'], acqua: ['ACQUEDOTTO', 'AQP'] };
// Giorni tra arrivo e pagamento quando i movimenti non bastano a ricavarli
const RITARDO_DEFAULT = { luce: 30, gas: 32, acqua: 20 };
const AUTOMATICO = { luce: true, gas: true, acqua: false };   // addebito diretto sul conto

const isoData = d => d.toISOString().slice(0, 10);
const piuGiorni = (s, n) => isoData(new Date(toDate(s).getTime() + n * giorno));
const giorniTra = (a, b) => Math.round((toDate(b) - toDate(a)) / giorno);
const mediana = l => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const media = l => l.length ? l.reduce((a, b) => a + b, 0) / l.length : null;
const oggiIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const fmtGiorno = s => {
  const d = toDate(s);
  const anno = d.getUTCFullYear() !== Number(oggiIso().slice(0, 4)) ? ` ${d.getUTCFullYear()}` : '';
  return `${d.getUTCDate()} ${MESI_LUNGHI[d.getUTCMonth()].slice(0, 3)}${anno}`;
};
const nettoBolletta = b => b.importo - b.oneri_extra + b.bonus;

const storico = t => bollette.filter(b => b.tipo === t && b.categoria === 'bolletta').sort((a, b) => a.periodo_al.localeCompare(b.periodo_al));

// Periodi già trascorsi o in corso che non hanno ancora la bolletta
function periodiMancanti(t, lista) {
  const ultima = lista.at(-1);
  if (!ultima) return [];
  const oggi = oggiIso();
  const out = [];
  let dal = piuGiorni(ultima.periodo_al, 1);
  if (t === 'acqua') {
    let q = Number(ultima.codice.slice(4)), y = Number(ultima.codice.slice(0, 4));
    while (dal <= oggi && out.length < 4) {
      q = q === 4 ? 1 : q + 1; if (q === 1) y++;
      // il trimestre finisce più o meno quando finiva lo stesso trimestre dell'anno prima
      const prec = lista.find(b => b.codice === `${y - 1}${q}`);
      const al = prec ? isoData(new Date(Date.UTC(toDate(prec.periodo_al).getUTCFullYear() + 1, toDate(prec.periodo_al).getUTCMonth(), toDate(prec.periodo_al).getUTCDate()))) : piuGiorni(dal, 90);
      out.push({ codice: `${y}${q}`, dal, al });
      dal = piuGiorni(al, 1);
    }
  } else {
    while (dal <= oggi && out.length < 6) {
      const d = toDate(dal);
      const m = d.getUTCMonth() + 1;
      const mFine = m % 2 === 0 ? m : m + 1;           // bimestri gen-feb, mar-apr, …
      const fine = new Date(Date.UTC(d.getUTCFullYear(), mFine, 0));
      out.push({ codice: `${fine.getUTCFullYear()}${String(mFine).padStart(2, '0')}`, dal, al: isoData(fine) });
      dal = piuGiorni(isoData(fine), 1);
    }
  }
  return out.map(p => ({ ...p, inCorso: p.al >= oggi }));
}

// Giorni tra arrivo e pagamento, ricavati dagli addebiti trovati nei movimenti
function ritardoPagamento(t, lista) {
  const movs = typeof movimenti !== 'undefined' ? movimenti : [];
  const chiavi = CHIAVI_PAGAMENTO[t];
  const ritardi = [];
  for (const b of lista.slice(-8)) {
    if (!b.data_emissione || b.importo <= 0) continue;
    const m = movs.find(x => x.importo < 0 && Math.abs(-x.importo - b.importo) < 0.01 && x.data >= b.data_emissione
      && giorniTra(b.data_emissione, x.data) <= 75 && chiavi.some(k => String(x.descrizione).toUpperCase().includes(k)));
    if (m) ritardi.push(giorniTra(b.data_emissione, m.data));
  }
  return { giorni: Math.round(mediana(ritardi) ?? RITARDO_DEFAULT[t]), daMovimenti: ritardi.length };
}

// Costo = quota fissa + prezzo × consumo, ricavati dalle ultime bollette dello stesso fornitore
function modelloPrezzo(lista) {
  const forn = lista.at(-1).fornitore;
  const punti = lista.filter(b => b.fornitore === forn).slice(-6).map(b => [b.consumo, nettoBolletta(b)]);
  const n = punti.length;
  const mx = media(punti.map(p => p[0])), my = media(punti.map(p => p[1]));
  const sxx = punti.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  const sxy = punti.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
  let prezzo = sxx > 0 ? sxy / sxx : 0;
  let fisso = my - prezzo * mx;
  if (n < 3 || prezzo <= 0 || fisso < 0) { prezzo = mx > 0 ? my / mx : 0; fisso = 0; }
  return c => fisso + prezzo * c;
}

// Luce: rapporto tra consumo in bolletta e prelievo misurato dall'inverter negli stessi bimestri
// (corregge eventuali differenze tra contatore e inverter)
function taraturaInverter(lista) {
  const coppie = (typeof fv !== 'undefined' ? fv : [])
    .filter(r => r.kwh_prelevati > 0)
    .map(r => [lista.find(b => b.codice === r.codice)?.consumo, r.kwh_prelevati])
    .filter(([b]) => b > 0);
  if (!coppie.length) return { fattore: 1, n: 0 };
  const f = coppie.reduce((s, [b]) => s + b, 0) / coppie.reduce((s, [, i]) => s + i, 0);
  return { fattore: f > 0.7 && f < 1.3 ? f : 1, n: coppie.length };
}

function stimaPeriodo(t, lista, p, costo, taratura) {
  const anno = Number(p.codice.slice(0, 4)), resto = p.codice.slice(4);
  const passati = [1, 2, 3].map(k => lista.find(b => b.codice === `${anno - k}${resto}`)).filter(Boolean);
  // Luce con il prelievo dall'inverter: consumo reale (fino a oggi, se il bimestre è in corso)
  const inv = t === 'luce' && typeof fv !== 'undefined' ? fv.find(r => r.codice === p.codice && r.kwh_prelevati != null) : null;
  if (inv) {
    const misurato = inv.kwh_prelevati * taratura.fattore;
    if (!p.inCorso) return { stima: costo(misurato), min: costo(misurato * 0.92), max: costo(misurato * 1.08), consumo: misurato, misurato };
    // bimestre in corso: misurato finora + la parte che manca, come negli anni scorsi
    const tot = giorniTra(p.dal, p.al) + 1, passatiGg = Math.min(tot, giorniTra(p.dal, oggiIso()) + 1);
    const mancante = 1 - passatiGg / tot;
    const storici = passati.map(b => b.consumo);
    const medio = storici.length ? media(storici.slice(0, 2)) : misurato / Math.max(0.05, 1 - mancante);
    const lo = storici.length ? Math.min(...storici) : medio, hi = storici.length ? Math.max(...storici) : medio;
    return { stima: costo(misurato + medio * mancante), min: costo(misurato + lo * mancante), max: costo(misurato + hi * mancante), consumo: misurato + medio * mancante, misurato, finora: true };
  }
  if (!passati.length) return null;
  if (t === 'acqua') {
    // acconti e conguagli rendono poco affidabile il legame consumo-prezzo: si guarda lo stesso trimestre degli anni prima
    const importi = passati.map(nettoBolletta);
    return { stima: media(importi.slice(0, 2)), min: Math.min(...importi), max: Math.max(...importi) };
  }
  const consumi = passati.map(b => b.consumo);
  const valori = consumi.map(costo);
  return { stima: costo(media(consumi.slice(0, 2))), min: Math.min(...valori), max: Math.max(...valori), consumo: media(consumi.slice(0, 2)) };
}

function prossimeBollette() {
  const righe = [];
  for (const t of TIPI) {
    const lista = storico(t);
    if (lista.length < 3) continue;
    const costo = modelloPrezzo(lista);
    const taratura = t === 'luce' ? taraturaInverter(lista) : { fattore: 1, n: 0 };
    const arrivo = Math.round(mediana(lista.slice(-6).filter(b => b.data_emissione).map(b => giorniTra(b.periodo_al, b.data_emissione))) ?? 20);
    // per chi paga a mano conta la scadenza, non quando è stata pagata in passato
    const pag = AUTOMATICO[t] ? ritardoPagamento(t, lista) : { giorni: RITARDO_DEFAULT[t] };
    for (const p of periodiMancanti(t, lista)) {
      const s = stimaPeriodo(t, lista, p, costo, taratura);
      if (!s) continue;
      const dataArrivo = piuGiorni(p.al, arrivo);
      righe.push({ tipo: t, ...p, ...s, dataArrivo, dataPagamento: piuGiorni(dataArrivo, pag.giorni), automatico: AUTOMATICO[t] });
    }
  }
  return righe.sort((a, b) => a.dataPagamento.localeCompare(b.dataPagamento));
}

const tondo = v => Math.max(0, Math.round(v));
const nomePeriodo = r => r.tipo === 'acqua'
  ? `${['1°', '2°', '3°', '4°'][Number(r.codice.slice(4)) - 1]} trimestre ${r.codice.slice(0, 4)}`
  : nomeBimestre(r.codice);

function renderProssime() {
  const box = $('#prossime');
  if (!box) return;
  const righe = prossimeBollette().filter(r => tipiAttivi().includes(r.tipo));
  $('#prossime-card').hidden = !righe.length;
  if (!righe.length) return;
  const oggi = oggiIso();
  const totale = righe.reduce((s, r) => s + tondo(r.stima), 0);
  $('#prossime-tot').textContent = `~${eur0.format(totale)}`;
  const prima = righe[0];   // ordinate per data di pagamento
  $('#prossime-prossima').textContent = `Prossimo pagamento: ${NOMI[prima.tipo].toLowerCase()} ~${eur0.format(tondo(prima.stima))}, ${fmtGiorno(prima.dataPagamento)}`;
  box.innerHTML = righe.map(r => {
    const arrivo = r.dataArrivo < oggi ? 'in arrivo a giorni' : `arriva verso il ${fmtGiorno(r.dataArrivo)}`;
    const pagamento = r.automatico
      ? `addebito verso il ${fmtGiorno(r.dataPagamento)}`
      : `da pagare a mano, entro il ${fmtGiorno(r.dataPagamento)} circa`;
    const forchetta = tondo(r.max) - tondo(r.min) >= 3 ? `<small>tra ${eur0.format(tondo(r.min))} e ${eur0.format(tondo(r.max))}</small>` : '';
    return `<div class="pross-riga">
      <i class="dot ${r.tipo}"></i>
      <div class="pross-desc">
        <div><strong>${NOMI[r.tipo]}</strong> · ${nomePeriodo(r)}${r.inCorso ? ' <span class="badge">in corso</span>' : ''}</div>
        <div class="pross-date">${arrivo} · <span class="${r.automatico ? '' : 'a-mano'}">${pagamento}</span></div>
        ${r.misurato != null ? `<div class="pross-inv">⚡ consumo dall’inverter${r.finora ? ' finora' : ''}: ${num0.format(r.misurato)} kWh</div>` : ''}
      </div>
      <div class="pross-importo"><span>~${eur0.format(tondo(r.stima))}</span>${forchetta}</div>
    </div>`;
  }).join('');
}

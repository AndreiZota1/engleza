/* English: lecții de engleză vorbită (23.11.2026).
   Sunetul merge direct între telefon și OpenAI (WebRTC). Mac-ul dă doar o cheie temporară de 2 minute,
   instrucțiunile profesorului și memoria lecțiilor; cheia OpenAI adevărată nu ajunge niciodată aici. */
'use strict';

const CHEIE_CFG = 'panou.cfg.v1'; // aceeași legătură cu Mac-ul ca Panoul Safe Ads (același domeniu)
const CHEIE_SETARI = 'engleza.setari.v1';
const CHEIE_LECTIE = 'engleza.lectie.curenta';
const API_PERMIS = /^(https:\/\/[a-z0-9-]+\.ngrok-free\.(app|dev)|https:\/\/[a-z0-9-]+\.ngrok\.(app|dev)|http:\/\/127\.0\.0\.1:8095)$/;

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let cfg = null;
try { cfg = JSON.parse(localStorage.getItem(CHEIE_CFG) || 'null'); } catch (e) { cfg = null; }
let setari = { mod: 'lectie', viteza: 0.95, rabdare: 'low', zgomot: 'far_field', ecran: true, subtitrari: false };
try { Object.assign(setari, JSON.parse(localStorage.getItem(CHEIE_SETARI) || '{}')); } catch (e) { /* implicite */ }
function salveazaSetari() { try { localStorage.setItem(CHEIE_SETARI, JSON.stringify(setari)); } catch (e) { /* ignor */ } }

let PRET = { audio_in: 10, audio_in_cache: 0.3, audio_out: 20, text_in: 0.6, text_in_cache: 0.06, text_out: 2.4 };
const L = {
  faza: 'oprit', pc: null, dc: null, flux: null, transcript: [], inceput: 0, cost: 0, drum: '', mut: false,
  oprireCeruta: false, reconectari: 0, stare: '', ceas: null, wake: null, salvareCeas: null,
};
let STARE = null; // ce stie Mac-ul: saptamana, lectiile, greselile

class EroareAuth extends Error {}

async function api(cale, opt = {}) {
  if (!cfg) throw new EroareAuth('neimperecheat');
  let r;
  try {
    r = await fetch(cfg.api + cale, {
      method: opt.method || 'GET', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: Object.assign({ Authorization: 'Bearer ' + cfg.cheie, 'ngrok-skip-browser-warning': '1' }, opt.body ? { 'Content-Type': 'application/json' } : {}),
      body: opt.body ? JSON.stringify(opt.body) : undefined,
    });
  } catch (e) { throw new Error('Nu ajung la Mac. Verifică internetul; dacă merge, Mac-ul sau tunelul e oprit.'); }
  if (r.status === 401) throw new EroareAuth('neautorizat');
  const j = await r.json().catch(() => null);
  if (!j) throw new Error('Răspuns neașteptat de la Mac (' + r.status + ').');
  if (!r.ok) throw new Error(j.eroare || ('Eroare ' + r.status));
  return j;
}

function toast(text, rau) {
  const el = $('#toast');
  el.textContent = text; el.className = 'toast' + (rau ? ' rau' : ''); el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, rau ? 6000 : 3500);
}
function strat(html, laMontare) {
  const s = $('#strat');
  s.innerHTML = '<div class="foaie-jos" role="dialog" aria-modal="true">' + html + '</div>';
  s.hidden = false;
  s.onclick = (e) => { if (e.target === s) inchideStrat(); };
  if (laMontare) laMontare(s);
}
function inchideStrat() { const s = $('#strat'); s.hidden = true; s.innerHTML = ''; }
function durata(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function dolari(x) { return '$' + (x || 0).toFixed(2); }
function drumImplicit() {
  const d = new Date();
  const weekend = d.getDay() === 0 || d.getDay() === 6;
  if (weekend) return 'acasa';
  return d.getHours() < 14 ? 'birou' : 'casa';
}

/* ------------------------------------------------------------ imperechere (aceeasi ca la Panou) */
function citestePerechea() {
  const m = location.hash.match(/[#&]p=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    let b = m[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    const j = JSON.parse(atob(b));
    return (j && typeof j.u === 'string' && typeof j.c === 'string') ? { u: j.u.replace(/\/+$/, ''), c: j.c } : null;
  } catch (e) { return null; }
}
async function imperecheaza(p) {
  history.replaceState(null, '', location.pathname);
  if (!API_PERMIS.test(p.u)) { toast('Link greșit.', true); return false; }
  try {
    const r = await fetch(p.u + '/api/imperechere', {
      method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
      body: JSON.stringify({ cod: p.c, nume: (navigator.userAgentData && navigator.userAgentData.platform) || 'telefon' }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.cheie) throw new Error(j.eroare || ('Eroare ' + r.status));
    cfg = { api: p.u, cheie: j.cheie, dispozitiv: j.dispozitiv, din: new Date().toISOString() };
    localStorage.setItem(CHEIE_CFG, JSON.stringify(cfg));
    toast('Gata, telefonul e legat de Mac.');
    return true;
  } catch (e) { toast(e.message, true); return false; }
}

/* ------------------------------------------------------------ ecranul de start */
async function incarcaStare() {
  STARE = await api('/api/engleza/stare');
  $('#chip-sapt').textContent = STARE.saptamana >= 1 && STARE.saptamana <= 20 ? 'Săptămâna ' + STARE.saptamana + ' din 20' : '';
  return STARE;
}

function ecranStart() {
  if (!cfg) {
    $('#main').innerHTML = '<div class="gol-mare"><h2>Aplicația nu e legată de Mac</h2><p class="text-2">Deschide pe telefonul ăsta linkul de împerechere primit de la Claude sau, dacă ai Panoul Safe Ads în același Chrome, deschide-l o dată pe el: legătura e comună.</p></div>';
    return;
  }
  const s = STARE || {};
  const drum = L.drum || drumImplicit();
  L.drum = drum;
  const ultima = (s.lectii || [])[0];
  let h = '<section class="card tema"><span class="eticheta">' + (s.saptamana >= 1 && s.saptamana <= 20 ? 'Tema săptămânii ' + s.saptamana : 'Tema') + '</span><p class="tema-text">' + esc(s.tema || 'Free conversation') + '</p>' +
    (s.nivel ? '<span class="chip">nivel estimat ' + esc(s.nivel) + '</span>' : '<span class="chip">nivelul se stabilește în prima lecție</span>') + '</section>';
  h += '<div class="segment" role="radiogroup" aria-label="Tipul lecției">' +
    [['lectie', 'Lecția săptămânii'], ['liber', 'Free talk']].map(([v, t]) => '<button role="radio" aria-checked="' + (setari.mod === v) + '" class="' + (setari.mod === v ? 'activ' : '') + '" data-mod="' + v + '">' + t + '</button>').join('') + '</div>';
  h += '<div class="segment" role="radiogroup" aria-label="Unde ești">' +
    [['birou', 'Spre birou'], ['casa', 'Spre casă'], ['acasa', 'Acasă']].map(([v, t]) => '<button role="radio" aria-checked="' + (drum === v) + '" class="' + (drum === v ? 'activ' : '') + '" data-drum="' + v + '">' + t + '</button>').join('') + '</div>';
  h += '<div class="start-cutie"><button class="start" id="start" aria-label="Începe lecția"><span class="start-cerc"></span><span class="start-text">Începe<br>lecția</span></button>' +
    '<p class="mic centru">Profesorul începe el. Vorbești liber, în engleză; îl poți opri oricând cu „stop”, „slower” sau „recap”.</p></div>';
  h += '<details class="card"><summary>Setări</summary>' +
    '<label class="setare"><span>Viteza profesorului <b id="viteza-val">' + setari.viteza.toFixed(2) + '×</b></span><input type="range" id="viteza" min="0.8" max="1.2" step="0.05" value="' + setari.viteza + '"></label>' +
    '<label class="setare"><span>Te așteaptă când faci pauze</span><select id="rabdare"><option value="low"' + (setari.rabdare === 'low' ? ' selected' : '') + '>mult (recomandat)</option><option value="medium"' + (setari.rabdare === 'medium' ? ' selected' : '') + '>normal</option></select></label>' +
    '<label class="setare"><span>Microfonul</span><select id="zgomot"><option value="far_field"' + (setari.zgomot === 'far_field' ? ' selected' : '') + '>telefonul în suport sau pe masă</option><option value="near_field"' + (setari.zgomot === 'near_field' ? ' selected' : '') + '>căști cu microfon</option></select></label>' +
    '<label class="setare comutator"><input type="checkbox" id="ecran"' + (setari.ecran ? ' checked' : '') + '><span>Ține ecranul aprins în timpul lecției</span></label>' +
    '<label class="setare comutator"><input type="checkbox" id="subtitrari"' + (setari.subtitrari ? ' checked' : '') + '><span>Arată textul conversației pe ecran</span></label>' +
    '</details>';
  if (ultima) h += cardLectie(ultima, true);
  h += '<div class="rand-jos"><button class="buton" id="istoric">Istoric și greșeli</button><span class="mic">Luna asta: ' + dolari(s.cost_luna_usd || 0) + '</span></div>';
  $('#main').innerHTML = h;
  $$('[data-mod]').forEach((b) => { b.onclick = () => { setari.mod = b.dataset.mod; salveazaSetari(); ecranStart(); }; });
  $$('[data-drum]').forEach((b) => { b.onclick = () => { L.drum = b.dataset.drum; ecranStart(); }; });
  $('#start').onclick = pornesteLectia;
  $('#viteza').oninput = (e) => { setari.viteza = Number(e.target.value); $('#viteza-val').textContent = setari.viteza.toFixed(2) + '×'; salveazaSetari(); };
  $('#rabdare').onchange = (e) => { setari.rabdare = e.target.value; salveazaSetari(); };
  $('#zgomot').onchange = (e) => { setari.zgomot = e.target.value; salveazaSetari(); };
  $('#ecran').onchange = (e) => { setari.ecran = e.target.checked; salveazaSetari(); };
  $('#subtitrari').onchange = (e) => { setari.subtitrari = e.target.checked; salveazaSetari(); };
  $('#istoric').onclick = ecranIstoric;
}

function cardLectie(l, eUltima) {
  let h = '<section class="card"><div class="rand"><b>' + (eUltima ? 'Ultima lecție' : esc(l.data)) + '</b><span class="mic">' + (eUltima ? esc(l.data) + ' · ' : '') + durata(l.durata_s || 0) + (l.cost_usd ? ' · ' + dolari(l.cost_usd) : '') + '</span></div>';
  if (!l.gata && !l.eroare) return h + '<p class="text-2">Rezumatul se pregătește…</p></section>';
  if (l.eroare) return h + '<p class="text-2">Rezumatul n-a mers pentru lecția asta.</p></section>';
  if (l.rezumat_ro) h += '<p>' + esc(l.rezumat_ro) + '</p>';
  if (l.progres_ro) h += '<p class="bine">' + esc(l.progres_ro) + '</p>';
  if ((l.greseli || []).length) h += '<div class="eticheta">Greșelile de reținut</div><ul class="greseli">' + l.greseli.map((g) => '<li><s>' + esc(g.gresit) + '</s> → <b>' + esc(g.corect) + '</b>' + (g.nota_ro ? '<div class="mic">' + esc(g.nota_ro) + '</div>' : '') + '</li>').join('') + '</ul>';
  if ((l.cuvinte_noi || []).length) h += '<div class="eticheta">Cuvinte noi</div><ul class="cuvinte">' + l.cuvinte_noi.map((c) => '<li><b>' + esc(c.en) + '</b> — ' + esc(c.ro) + '</li>').join('') + '</ul>';
  if (l.data_viitoare_en) h += '<p class="mic">' + esc(l.data_viitoare_en) + '</p>';
  return h + '</section>';
}

function ecranIstoric() {
  const s = STARE || {};
  let h = '<button class="buton" id="inapoi">← Înapoi</button>';
  h += '<h2 class="titlu">Greșelile frecvente</h2>';
  h += (s.greseli || []).length ? '<section class="card"><ul class="greseli">' + s.greseli.slice(0, 20).map((g) => '<li><s>' + esc(g.gresit) + '</s> → <b>' + esc(g.corect) + '</b></li>').join('') + '</ul></section>' : '<p class="text-2">Încă nimic: apar după prima lecție.</p>';
  h += '<h2 class="titlu">Cuvinte învățate</h2>';
  h += (s.cuvinte || []).length ? '<section class="card"><ul class="cuvinte">' + s.cuvinte.slice(0, 40).map((c) => '<li><b>' + esc(c.en) + '</b> — ' + esc(c.ro) + '</li>').join('') + '</ul></section>' : '<p class="text-2">Încă nimic.</p>';
  h += '<h2 class="titlu">Lecțiile</h2>' + ((s.lectii || []).map((l) => cardLectie(l, false)).join('') || '<p class="text-2">Nicio lecție încă.</p>');
  $('#main').innerHTML = h;
  $('#inapoi').onclick = ecranStart;
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------------ lectia live */
function ecranLive() {
  $('#main').innerHTML = '<div class="live">' +
    '<div class="orb" id="orb"><span></span></div>' +
    '<p class="stare" id="stare">Mă conectez…</p>' +
    '<p class="mic centru"><span id="ceas">0:00</span> · <span id="cost">$0.00</span></p>' +
    '<div class="comenzi">' +
    '<button class="buton" id="mut">Microfon pornit</button>' +
    '<button class="buton" id="rar">Mai rar</button>' +
    '<button class="buton" id="repede">Mai repede</button>' +
    '<button class="buton" id="recap">Recap</button>' +
    '</div>' +
    '<div class="subtitrari" id="subtitrari"' + (setari.subtitrari ? '' : ' hidden') + '></div>' +
    '<button class="buton pericol lat" id="termina">Termină lecția</button>' +
    '<button class="buton-text" id="arata-text">' + (setari.subtitrari ? 'Ascunde textul' : 'Arată textul') + '</button>' +
    '</div>';
  $('#mut').onclick = comutaMut;
  $('#rar').onclick = () => schimbaViteza(-0.1);
  $('#repede').onclick = () => schimbaViteza(0.1);
  $('#recap').onclick = () => trimiteText('recap');
  $('#termina').onclick = () => terminaLectia(false);
  $('#arata-text').onclick = () => {
    setari.subtitrari = !setari.subtitrari; salveazaSetari();
    $('#subtitrari').hidden = !setari.subtitrari;
    $('#arata-text').textContent = setari.subtitrari ? 'Ascunde textul' : 'Arată textul';
    deseneazaSubtitrari();
  };
}
function seteazaStare(text, clasa) {
  L.stare = clasa || '';
  const el = $('#stare'); if (el) el.textContent = text;
  const o = $('#orb'); if (o) o.className = 'orb ' + (clasa || '');
}
function deseneazaSubtitrari() {
  const el = $('#subtitrari');
  if (!el || el.hidden) return;
  el.innerHTML = L.transcript.slice(-8).map((t) => '<p class="' + (t.de === 'eu' ? 'eu' : 'prof') + '">' + esc(t.text) + '</p>').join('');
  el.scrollTop = el.scrollHeight;
}
function adaugaReplica(de, text) {
  text = String(text || '').trim();
  if (!text) return;
  L.transcript.push({ de, text, ts: new Date().toISOString() });
  deseneazaSubtitrari();
}

function costDin(u) {
  if (!u) return 0;
  const it = u.input_token_details || {}, ot = u.output_token_details || {};
  const cd = it.cached_tokens_details || {};
  const ain = it.audio_tokens || 0, tin = it.text_tokens || 0;
  let cAudio = cd.audio_tokens, cText = cd.text_tokens;
  if (cAudio === undefined && cText === undefined) { const c = it.cached_tokens || 0; cText = Math.min(tin, c); cAudio = Math.min(ain, c - cText); }
  cAudio = cAudio || 0; cText = cText || 0;
  return ((ain - cAudio) * PRET.audio_in + cAudio * PRET.audio_in_cache + (tin - cText) * PRET.text_in + cText * PRET.text_in_cache +
    (ot.audio_tokens || 0) * PRET.audio_out + (ot.text_tokens || 0) * PRET.text_out) / 1e6;
}

function laEveniment(ev) {
  switch (ev.type) {
    case 'input_audio_buffer.speech_started': seteazaStare('Te ascult…', 'asculta'); break;
    case 'input_audio_buffer.speech_stopped': seteazaStare('Se gândește…', 'gandeste'); break;
    case 'response.created': seteazaStare('Profesorul vorbește', 'vorbeste'); break;
    case 'response.done':
      L.cost += costDin(ev.response && ev.response.usage);
      seteazaStare(L.mut ? 'Microfonul e oprit' : 'Rândul tău', L.mut ? 'mut' : 'asteapta');
      break;
    case 'conversation.item.input_audio_transcription.completed': adaugaReplica('eu', ev.transcript); break;
    case 'response.output_audio_transcript.done': adaugaReplica('profesor', ev.transcript); break;
    case 'error': {
      const m = (ev.error && ev.error.message) || 'eroare';
      if (!/cancel|no active response|already/i.test(m)) toast('OpenAI: ' + m, true);
      break;
    }
    default: break;
  }
}

async function conecteaza(reluare) {
  const s = await api('/api/engleza/sesiune', {
    method: 'POST',
    body: { mod: setari.mod, drum: L.drum, viteza: setari.viteza, rabdare: setari.rabdare, zgomot: setari.zgomot, reluare: reluare || [] },
  });
  if (s.preturi) PRET = s.preturi;
  const pc = new RTCPeerConnection();
  const sunet = $('#sunet');
  pc.ontrack = (e) => { sunet.srcObject = e.streams[0]; sunet.play().catch(() => {}); };
  if (!L.flux) {
    L.flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  }
  L.flux.getAudioTracks().forEach((t) => { t.enabled = !L.mut; pc.addTrack(t, L.flux); });
  const dc = pc.createDataChannel('oai-events');
  dc.onmessage = (e) => { try { laEveniment(JSON.parse(e.data)); } catch (x) { /* ignor */ } };
  dc.onopen = () => { dc.send(JSON.stringify({ type: 'response.create' })); };
  const oferta = await pc.createOffer();
  await pc.setLocalDescription(oferta);
  const r = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST', body: oferta.sdp, referrerPolicy: 'no-referrer',
    headers: { Authorization: 'Bearer ' + s.cheie, 'Content-Type': 'application/sdp' },
  });
  if (!r.ok) throw new Error('OpenAI a refuzat legătura (' + r.status + '): ' + (await r.text()).slice(0, 160));
  await pc.setRemoteDescription({ type: 'answer', sdp: await r.text() });
  pc.onconnectionstatechange = () => {
    if (pc !== L.pc) return;
    if (['failed', 'disconnected', 'closed'].includes(pc.connectionState) && L.faza === 'live' && !L.oprireCeruta) reconecteaza();
  };
  dc.onclose = () => { if (pc === L.pc && L.faza === 'live' && !L.oprireCeruta) reconecteaza(); };
  L.pc = pc; L.dc = dc;
}

let reconectareInCurs = false;
async function reconecteaza() {
  if (reconectareInCurs) return;
  reconectareInCurs = true;
  try {
    if (L.reconectari >= 4) { toast('Legătura cu profesorul a căzut de prea multe ori. Salvez lecția.', true); await terminaLectia(true); return; }
    L.reconectari += 1;
    seteazaStare('Reconectez…', 'gandeste');
    try { if (L.pc) L.pc.close(); } catch (e) { /* ignor */ }
    L.pc = null; L.dc = null;
    await new Promise((r) => setTimeout(r, 1500));
    await conecteaza(L.transcript.slice(-12));
  } catch (e) {
    toast(e.message || 'Nu mă pot reconecta.', true);
    setTimeout(() => { reconectareInCurs = false; if (L.faza === 'live' && !L.oprireCeruta) reconecteaza(); }, 4000);
    return;
  }
  reconectareInCurs = false;
}

function trimiteEveniment(ev) { if (L.dc && L.dc.readyState === 'open') L.dc.send(JSON.stringify(ev)); }
function trimiteText(text) {
  trimiteEveniment({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });
  trimiteEveniment({ type: 'response.create' });
  adaugaReplica('eu', text);
}
function schimbaViteza(d) {
  setari.viteza = Math.round(Math.min(1.3, Math.max(0.7, setari.viteza + d)) * 100) / 100;
  salveazaSetari();
  trimiteEveniment({ type: 'session.update', session: { type: 'realtime', audio: { output: { speed: setari.viteza } } } });
  toast('Viteza: ' + setari.viteza.toFixed(2) + '× (de la replica următoare)');
}
function comutaMut() {
  L.mut = !L.mut;
  if (L.flux) L.flux.getAudioTracks().forEach((t) => { t.enabled = !L.mut; });
  $('#mut').textContent = L.mut ? 'Microfon oprit' : 'Microfon pornit';
  $('#mut').classList.toggle('pericol', L.mut);
  seteazaStare(L.mut ? 'Microfonul e oprit' : 'Rândul tău', L.mut ? 'mut' : 'asteapta');
}

async function tineEcranul() {
  if (!setari.ecran || !('wakeLock' in navigator)) return;
  try { L.wake = await navigator.wakeLock.request('screen'); } catch (e) { L.wake = null; }
}

function salveazaLocal() {
  try {
    localStorage.setItem(CHEIE_LECTIE, JSON.stringify({ transcript: L.transcript, durata_s: Math.round((Date.now() - L.inceput) / 1000),
      cost_usd: Math.round(L.cost * 10000) / 10000, mod: setari.mod, drum: L.drum }));
  } catch (e) { /* ignor */ }
}

async function pornesteLectia() {
  if (L.faza !== 'oprit') return;
  if (!window.RTCPeerConnection || !navigator.mediaDevices) { toast('Browserul ăsta nu poate face convorbiri.', true); return; }
  L.faza = 'conectare'; L.transcript = []; L.cost = 0; L.mut = false; L.oprireCeruta = false; L.reconectari = 0;
  ecranLive();
  try {
    L.flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    L.faza = 'oprit';
    toast(e.name === 'NotAllowedError' ? 'Microfonul e blocat: dă voie din setările browserului.' : 'Microfonul nu pornește.', true);
    ecranStart();
    return;
  }
  try {
    await conecteaza([]);
  } catch (e) {
    oprireTehnica();
    L.faza = 'oprit';
    if (e instanceof EroareAuth) { toast('Telefonul nu mai e autorizat. Cere un link nou de împerechere.', true); return ecranStart(); }
    toast(e.message || 'Nu m-am putut conecta.', true);
    return ecranStart();
  }
  L.faza = 'live';
  L.inceput = Date.now();
  seteazaStare('Profesorul începe…', 'vorbeste');
  tineEcranul();
  if ('mediaSession' in navigator && window.MediaMetadata) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: 'English lesson', artist: STARE && STARE.tema ? STARE.tema.slice(0, 60) : 'English' });
  }
  L.ceas = setInterval(() => {
    const c = $('#ceas'); if (c) c.textContent = durata((Date.now() - L.inceput) / 1000);
    const k = $('#cost'); if (k) k.textContent = dolari(L.cost);
  }, 1000);
  L.salvareCeas = setInterval(salveazaLocal, 20000);
}

function oprireTehnica() {
  try { if (L.pc) L.pc.close(); } catch (e) { /* ignor */ }
  if (L.flux) L.flux.getTracks().forEach((t) => t.stop());
  L.pc = null; L.dc = null; L.flux = null;
  clearInterval(L.ceas); clearInterval(L.salvareCeas);
  if (L.wake) { L.wake.release().catch(() => {}); L.wake = null; }
  const s = $('#sunet'); if (s) s.srcObject = null;
}

async function terminaLectia(fortat) {
  if (L.faza !== 'live') return;
  if (!fortat && L.transcript.length && !confirm('Termini lecția?')) return;
  L.oprireCeruta = true;
  L.faza = 'final';
  const durataS = Math.round((Date.now() - L.inceput) / 1000);
  oprireTehnica();
  const lectie = { transcript: L.transcript, durata_s: durataS, cost_usd: Math.round(L.cost * 10000) / 10000, mod: setari.mod, drum: L.drum };
  $('#main').innerHTML = '<div class="gol-mare"><h2>Lecția s-a terminat</h2><p class="text-2">' + durata(durataS) + ' · ' + dolari(L.cost) + '</p><p class="text-2" id="mesaj-final">Salvez lecția și pregătesc rezumatul…</p></div>';
  L.faza = 'oprit';
  if (L.transcript.filter((t) => t.de === 'eu').length < 1) {
    localStorage.removeItem(CHEIE_LECTIE);
    $('#mesaj-final').textContent = 'Lecția a fost prea scurtă ca s-o salvez.';
    setTimeout(() => { incarcaStare().then(ecranStart).catch(ecranStart); }, 2500);
    return;
  }
  try {
    const r = await api('/api/engleza/lectie', { method: 'POST', body: lectie });
    localStorage.removeItem(CHEIE_LECTIE);
    asteaptaRezumatul(r.id, 0);
  } catch (e) {
    salveazaLocal();
    $('#mesaj-final').textContent = 'N-am putut salva acum (' + e.message + '). O salvez singur la următoarea deschidere.';
  }
}

async function asteaptaRezumatul(id, incercari) {
  try {
    await incarcaStare();
    const l = (STARE.lectii || []).find((x) => x.id === id);
    if ((l && (l.gata || l.eroare)) || incercari >= 30) { ecranStart(); return; }
  } catch (e) { /* reincerc */ }
  setTimeout(() => asteaptaRezumatul(id, incercari + 1), 4000);
}

async function trimiteLectiaRamasa() {
  let l = null;
  try { l = JSON.parse(localStorage.getItem(CHEIE_LECTIE) || 'null'); } catch (e) { l = null; }
  if (!l || !(l.transcript || []).some((t) => t.de === 'eu')) { localStorage.removeItem(CHEIE_LECTIE); return; }
  try { await api('/api/engleza/lectie', { method: 'POST', body: l }); localStorage.removeItem(CHEIE_LECTIE); toast('Am salvat lecția întreruptă de data trecută.'); } catch (e) { /* data viitoare */ }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && L.faza === 'live') tineEcranul();
});
window.addEventListener('pagehide', () => { if (L.faza === 'live') salveazaLocal(); });

async function porneste() {
  const p = citestePerechea();
  if (p) await imperecheaza(p);
  if (!cfg) return ecranStart();
  $('#main').innerHTML = '<div class="gol-mare"><p class="text-2">Se încarcă…</p></div>';
  try {
    await incarcaStare();
    trimiteLectiaRamasa();
  } catch (e) {
    if (e instanceof EroareAuth) { cfg = null; toast('Telefonul nu mai e autorizat de Mac. Cere un link nou de împerechere.', true); }
    else toast(e.message, true);
  }
  ecranStart();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

porneste();

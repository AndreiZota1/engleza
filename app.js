/* English v2 (23.11.2026): lecții vorbite, conversație scrisă, parcurs pe 20 de săptămâni, teste, cartonașe, progres.
   Sunetul lecțiilor merge direct între telefon și OpenAI (WebRTC). Mac-ul dă cheia temporară, instrucțiunile,
   memoria, testele și statisticile; cheia OpenAI adevărată nu ajunge niciodată aici. */
'use strict';

const CHEIE_CFG = 'panou.cfg.v1'; // aceeași legătură cu Mac-ul ca Panoul Safe Ads (același domeniu)
const CHEIE_SETARI = 'engleza.setari.v1';
const CHEIE_LECTIE = 'engleza.lectie.curenta';
const CHEIE_SCRIS = 'engleza.scris.v1';
const API_PERMIS = /^(https:\/\/[a-z0-9-]+\.ngrok-free\.(app|dev)|https:\/\/[a-z0-9-]+\.ngrok\.(app|dev)|http:\/\/127\.0\.0\.1:8095)$/;

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gol = (x) => x === null || x === undefined || (typeof x === 'number' && isNaN(x));

let cfg = null;
try { cfg = JSON.parse(localStorage.getItem(CHEIE_CFG) || 'null'); } catch (e) { cfg = null; }
let setari = { mod: 'lectie', viteza: 0.95, rabdare: 'low', zgomot: 'far_field', ecran: true, subtitrari: false, obiectiv: 30 };
try { Object.assign(setari, JSON.parse(localStorage.getItem(CHEIE_SETARI) || '{}')); } catch (e) { /* implicite */ }
function salveazaSetari() { try { localStorage.setItem(CHEIE_SETARI, JSON.stringify(setari)); } catch (e) { /* ignor */ } }

const S = { stare: null, progres: null, parcurs: null, lectii: {}, randare: 0, drum: '' };
let PRET = { audio_in: 10, audio_in_cache: 0.3, audio_out: 20, text_in: 0.6, text_in_cache: 0.06, text_out: 2.4 };

class EroareAuth extends Error {}

/* ------------------------------------------------------------ rețea */
function antete(extra) { return Object.assign({ Authorization: 'Bearer ' + cfg.cheie, 'ngrok-skip-browser-warning': '1' }, extra || {}); }
async function api(cale, opt = {}) {
  if (!cfg) throw new EroareAuth('neimperecheat');
  let r;
  try {
    r = await fetch(cfg.api + cale, {
      method: opt.method || 'GET', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: antete(opt.body ? { 'Content-Type': 'application/json' } : null),
      body: opt.body ? JSON.stringify(opt.body) : undefined,
    });
  } catch (e) { throw new Error('Nu ajung la Mac. Verifică internetul; dacă merge, Mac-ul sau tunelul e oprit.'); }
  if (r.status === 401) throw new EroareAuth('neautorizat');
  const j = await r.json().catch(() => null);
  if (!j) throw new Error('Răspuns neașteptat de la Mac (' + r.status + ').');
  if (!r.ok) throw new Error(j.eroare || ('Eroare ' + r.status));
  return j;
}
async function apiAudioEngleza(text) {
  const r = await fetch(cfg.api + '/api/engleza/citeste', { method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer', headers: antete({ 'Content-Type': 'application/json' }), body: JSON.stringify({ text }) });
  if (r.status === 401) throw new EroareAuth('neautorizat');
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.eroare || ('Eroare ' + r.status)); }
  return r.blob();
}
async function apiTranscrieEngleza(blob) {
  const r = await fetch(cfg.api + '/api/engleza/transcrie', { method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer', headers: antete({ 'Content-Type': blob.type || 'audio/webm' }), body: blob });
  if (r.status === 401) throw new EroareAuth('neautorizat');
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.eroare || ('Eroare ' + r.status));
  return j.text || '';
}

/* ------------------------------------------------------------ mărunțișuri */
function toast(text, rau) {
  const el = $('#toast');
  el.textContent = text; el.className = 'toast' + (rau ? ' rau' : ''); el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, rau ? 6000 : 3200);
}
function strat(html, laMontare) {
  const s = $('#strat');
  s.innerHTML = '<div class="foaie-jos" role="dialog" aria-modal="true"><span class="maner" aria-hidden="true"></span>' + html + '</div>';
  s.hidden = false;
  s.onclick = (e) => { if (e.target === s) inchideStrat(); };
  if (laMontare) laMontare(s);
}
function inchideStrat() { const s = $('#strat'); s.hidden = true; s.innerHTML = ''; }
function durata(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function minute(s) { const m = Math.round((s || 0) / 60); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; }
function dolari(x) { return '$' + (x || 0).toFixed(2); }
const nf = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 });
function zi(ts) {
  const d = new Date(String(ts || '').replace(' ', 'T'));
  if (isNaN(d)) return esc(ts);
  const azi = new Date();
  const ieri = new Date(Date.now() - 864e5);
  const ora = d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === azi.toDateString()) return 'azi, ' + ora;
  if (d.toDateString() === ieri.toDateString()) return 'ieri, ' + ora;
  return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }) + ', ' + ora;
}
function salut() {
  const h = new Date().getHours();
  return h < 11 ? 'Bună dimineața' : h < 18 ? 'Bună ziua' : 'Bună seara';
}
function drumImplicit() {
  const d = new Date();
  if (d.getDay() === 0 || d.getDay() === 6) return 'acasa';
  return d.getHours() < 14 ? 'birou' : 'casa';
}
function amesteca(n) { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const CEFR = { A1: 1, 'A1+': 1.5, A2: 2, 'A2+': 2.5, B1: 3, 'B1+': 3.5, B2: 4, 'B2+': 4.5, C1: 5, 'C1+': 5.5, C2: 6 };
function cefrNr(x) { return CEFR[String(x || '').toUpperCase().replace(/\s/g, '')] || null; }
const NUME_MOD = { lectie: 'Lecție', liber: 'Conversație liberă', test: 'Test vorbit', text: 'Conversație scrisă' };

/* ------------------------------------------------------------ efecte: confetti și XP */
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = $('#confetti');
  const ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const culori = ['#97C33E', '#C9E68A', '#5A8CD4', '#FFFFFF', '#F2B45A'];
  const p = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 11, vy: -Math.random() * 12 - 4,
    r: Math.random() * 5 + 3, c: culori[Math.floor(Math.random() * culori.length)], u: Math.random() * 6, vu: (Math.random() - 0.5) * 0.3,
  }));
  c.hidden = false;
  const t0 = performance.now();
  (function cadru(t) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    p.forEach((q) => {
      q.vy += 0.32; q.x += q.vx; q.y += q.vy; q.vx *= 0.99; q.u += q.vu;
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.u); ctx.fillStyle = q.c; ctx.fillRect(-q.r, -q.r / 2, q.r * 2, q.r); ctx.restore();
    });
    if (t - t0 < 2600) requestAnimationFrame(cadru); else { ctx.clearRect(0, 0, innerWidth, innerHeight); c.hidden = true; }
  })(t0);
}
function xpPluteste(el, text) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const s = document.createElement('span');
  s.className = 'xp-pluteste';
  s.textContent = text;
  document.body.appendChild(s);
  s.style.left = (r.left + r.width / 2) + 'px';
  s.style.top = (r.top + window.scrollY) + 'px';
  setTimeout(() => s.remove(), 1300);
}
function inel(procent, eticheta, sub) {
  const r = 34, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, procent));
  return '<div class="inel" role="img" aria-label="' + esc(eticheta + ' ' + (sub || '')) + '"><svg viewBox="0 0 84 84"><circle class="inel-fond" cx="42" cy="42" r="' + r + '"/>' +
    '<circle class="inel-plin" cx="42" cy="42" r="' + r + '" stroke-dasharray="' + (c * f).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 42 42)"/></svg>' +
    '<div class="inel-text"><b>' + esc(eticheta) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div></div>';
}
const ICON = {
  flacara: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 5.5 5 10.5A5 5 0 0 1 7 12.5c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-6 1-9z"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  difuzor: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 10h8M8 13h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  carduri: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  fulger: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  creion: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  carte: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  ureche: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0M10 9a2 2 0 0 1 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  vorbire: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h2M7 8v8M11 5v14M15 8v8M19 10v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  harta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  trofeu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bifa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/* ------------------------------------------------------------ înregistrare (pentru „Spune în engleză” și dictare) */
const Mic = {
  rec: null, flux: null, bucati: [], start: 0,
  async porneste() {
    if (!navigator.mediaDevices || !window.MediaRecorder) throw new Error('Browserul ăsta nu poate înregistra.');
    this.flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const tip = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t));
    this.rec = new MediaRecorder(this.flux, tip ? { mimeType: tip } : undefined);
    this.bucati = [];
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.bucati.push(e.data); };
    this.rec.start(250);
    this.start = Date.now();
  },
  opreste() {
    return new Promise((res) => {
      const rec = this.rec;
      if (!rec) return res(null);
      rec.onstop = () => {
        const b = new Blob(this.bucati, { type: (rec.mimeType || 'audio/webm').split(';')[0] });
        if (this.flux) this.flux.getTracks().forEach((t) => t.stop());
        this.flux = null; this.rec = null; this.bucati = [];
        res(b.size > 800 ? b : null);
      };
      try { rec.stop(); } catch (e) { res(null); }
    });
  },
};
function mesajMicrofon(e) { return e && e.name === 'NotAllowedError' ? 'Microfonul e blocat: dă voie din setările browserului.' : ((e && e.message) || 'Microfonul nu pornește.'); }

/* redare în engleză (pronunția corectă a cuvintelor, ascultare, replicile profesorului din chat) */
const Redare = { audio: null, buton: null, cache: new Map() };
function opresteRedarea() {
  if (Redare.audio) Redare.audio.pause();
  if (Redare.buton) Redare.buton.classList.remove('canta');
  Redare.audio = null; Redare.buton = null;
}
async function reda(text, buton) {
  if (Redare.buton && Redare.buton === buton) { opresteRedarea(); return; }
  opresteRedarea();
  Redare.buton = buton || null;
  if (buton) buton.classList.add('canta');
  try {
    let url = Redare.cache.get(text);
    if (!url) { url = URL.createObjectURL(await apiAudioEngleza(text)); Redare.cache.set(text, url); }
    const a = new Audio(url);
    Redare.audio = a;
    a.onended = opresteRedarea;
    await a.play();
  } catch (e) {
    opresteRedarea();
    if (e instanceof EroareAuth) return ecranNeautorizat();
    toast(e.message || 'Nu pot reda.', true);
  }
}

/* ------------------------------------------------------------ împerechere (aceeași ca la Panou) */
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
  history.replaceState(null, '', location.pathname + '#/acasa');
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
function ecranNelegat() {
  $('#main').innerHTML = '<div class="gol-mare"><div class="gol-icon">' + ICON.chat + '</div><h2>Aplicația nu e legată de Mac</h2><p class="text-2">Deschide pe telefonul ăsta linkul de împerechere primit de la Claude. Dacă ai Panoul Safe Ads în același Chrome, deschide-l o dată pe el: legătura e comună.</p></div>';
}
function ecranNeautorizat() {
  $('#main').innerHTML = '<div class="gol-mare"><h2>Telefonul nu mai e autorizat</h2><p class="text-2">Mac-ul nu mai recunoaște cheia acestui telefon. Cere de la Claude un link nou de împerechere.</p></div>';
}

/* ------------------------------------------------------------ date și antet */
async function incarcaStare() {
  S.stare = await api('/api/engleza/stare');
  antetStare();
  return S.stare;
}
function antetStare() {
  const s = S.stare;
  if (!s) return;
  $('#pastila-serie').hidden = false;
  $('#pastila-serie').classList.toggle('aprinsa', (s.serie || 0) > 0);
  $('#nr-serie').textContent = s.serie || 0;
  $('#pastila-xp').hidden = false;
  $('#nr-xp').textContent = new Intl.NumberFormat('ro-RO').format(s.xp || 0);
  const ins = $('#ins-carduri');
  ins.textContent = s.de_repetat ? String(s.de_repetat) : '';
}

/* ------------------------------------------------------------ router */
function ruta() {
  const h = location.hash.replace(/^#\/?/, '');
  const p = h.split('/');
  return { v: p[0] || 'acasa', arg: decodeURIComponent(p.slice(1).join('/') || '') };
}
function marcheazaTab(v) {
  const tab = ({ saptamana: 'parcurs', test: 'exerseaza', carduri: 'exerseaza', scris: 'exerseaza', lectie: 'istoric', live: '' })[v];
  const t = tab === undefined ? v : tab;
  $$('#tabbar a').forEach((a) => a.classList.toggle('activ', a.dataset.tab === t));
}
async function randeaza() {
  const id = ++S.randare;
  if (!cfg) return ecranNelegat();
  const { v, arg } = ruta();
  if (L.faza !== 'oprit' && v !== 'live') { location.hash = '#/live'; return; }
  document.body.classList.toggle('in-lectie', v === 'live');
  marcheazaTab(v);
  opresteRedarea();
  window.scrollTo(0, 0);
  try {
    if (v === 'acasa') await vedereAcasa(id);
    else if (v === 'parcurs') await vedereParcurs(id);
    else if (v === 'saptamana') { await vedereParcurs(id); foaieSaptamana(Number(arg)); }
    else if (v === 'exerseaza') await vedereExerseaza(id);
    else if (v === 'test') await vedereTest(id, arg);
    else if (v === 'carduri') await vedereCarduri(id);
    else if (v === 'scris') await vedereScris(id);
    else if (v === 'progres') await vedereProgres(id);
    else if (v === 'istoric') await vedereIstoric(id);
    else if (v === 'lectie') await vedereLectie(id, arg);
    else if (v === 'live') { if (L.faza === 'oprit') location.hash = '#/acasa'; }
    else location.hash = '#/acasa';
  } catch (e) {
    if (id !== S.randare) return;
    if (e instanceof EroareAuth) return ecranNeautorizat();
    $('#main').innerHTML = '<div class="eroare">' + esc(e.message || e) + '</div><button class="buton" id="incearca">Încearcă din nou</button>';
    $('#incearca').onclick = randeaza;
  }
}
function titlu(t) { $('#titlu').textContent = t; document.title = t === 'English' ? 'English' : t + ' · English'; }

/* ------------------------------------------------------------ ACASĂ */
async function vedereAcasa(id) {
  titlu('English');
  if (!S.stare) $('#main').innerHTML = '<div class="incarca"><span class="punct-incarca"></span></div>';
  const s = await incarcaStare();
  if (id !== S.randare) return;
  const drum = S.drum || drumImplicit();
  S.drum = drum;
  const ultima = (s.lectii || [])[0];
  const procentAzi = (s.minute_azi || 0) / Math.max(5, setari.obiectiv || 30);
  const prog = s.saptamana >= 1 ? Math.min(1, s.saptamana / 20) : 0;
  let h = '<section class="erou">' +
    '<div class="erou-sus"><div class="erou-text"><p class="salut">' + salut() + ', Andrei</p>' +
    '<h2>' + (s.saptamana >= 1 && s.saptamana <= 20 ? 'Săptămâna ' + s.saptamana + ' · ' + esc(s.faza_nume || '') : 'Englezul tău') + '</h2>' +
    '<p class="tema">' + esc(s.tema || 'Free conversation') + '</p></div>' +
    '<div class="nivel"><b>' + esc(s.nivel || '?') + '</b><span>nivel</span></div></div>' +
    '<div class="erou-jos">' + inel(procentAzi, (s.minute_azi || 0) + ' min', 'din ' + (setari.obiectiv || 30) + ' azi') +
    '<div class="erou-cifre"><div class="cifra-erou' + ((s.serie || 0) > 0 ? ' aprinsa' : '') + '">' + ICON.flacara + '<b>' + (s.serie || 0) + '</b><span>' + ((s.serie || 0) === 1 ? 'zi la rând' : 'zile la rând') + '</span></div>' +
    '<div class="cifra-erou xp"><b>' + new Intl.NumberFormat('ro-RO').format(s.xp || 0) + '</b><span>XP</span></div>' +
    '<div class="bara-program" role="img" aria-label="' + Math.round(prog * 100) + '% din program"><span data-w="' + (prog * 100).toFixed(1) + '"></span></div>' +
    '<span class="mic-erou">' + (s.saptamana >= 1 && s.saptamana <= 20 ? 'săptămâna ' + s.saptamana + ' din 20' : '') + '</span></div></div>' +
    (s.checkpoint ? '<button class="banda-checkpoint" id="checkpoint">' + ICON.trofeu + '<span>Săptămână de checkpoint: fă testul vorbit</span></button>' : '') +
    '</section>';

  h += '<section class="panou-start"><div class="moduri">' +
    [['lectie', 'Lecție', 'tema săptămânii, cu corecturi', ICON.carte], ['liber', 'Conversație', 'liber, despre ce vrei', ICON.chat], ['test', 'Test vorbit', 'examen de 10 min, cu scor', ICON.trofeu]]
      .map(([v, t, d, ic]) => '<button class="mod' + (setari.mod === v ? ' activ' : '') + '" data-mod="' + v + '">' + ic + '<b>' + t + '</b><span>' + d + '</span></button>').join('') + '</div>' +
    '<div class="segment" role="radiogroup" aria-label="Unde ești">' +
    [['birou', 'Spre birou'], ['casa', 'Spre casă'], ['acasa', 'Acasă']].map(([v, t]) => '<button role="radio" aria-checked="' + (drum === v) + '" class="' + (drum === v ? 'activ' : '') + '" data-drum="' + v + '">' + t + '</button>').join('') + '</div>' +
    '<button class="orb-start" id="start"><span class="orb-unda"></span><span class="orb-unda d2"></span><span class="orb-miez">' + ICON.mic + '<b>' + (setari.mod === 'test' ? 'Începe testul' : 'Începe') + '</b></span></button>' +
    '<p class="mic centru">Profesorul începe el. Îl poți opri oricând cu „stop”, „slower” sau „recap”.</p></section>';

  h += '<div class="grila-actiuni">' +
    tile('#/scris', ICON.creion, 'Scrie cu profesorul', 'conversație în scris, cu corecturi') +
    tile('#/carduri', ICON.carduri, 'Cartonașe', s.de_repetat ? s.de_repetat + ' de repetat azi' : (s.cuvinte_nr ? s.cuvinte_nr + ' cuvinte' : 'apar după lecții'), s.de_repetat) +
    tile('#/test/rapid', ICON.fulger, 'Test rapid', '10 întrebări, 3 minute') +
    tile('#/parcurs', ICON.harta, 'Parcursul tău', 'cele 20 de săptămâni') + '</div>';
  if (ultima) h += cardLectie(ultima, true);
  $('#main').innerHTML = h;
  $$('[data-w]').forEach((el) => { el.style.width = el.dataset.w + '%'; });
  $$('[data-mod]').forEach((b) => { b.onclick = () => { setari.mod = b.dataset.mod; salveazaSetari(); vedereAcasa(++S.randare); }; });
  $$('[data-drum]').forEach((b) => { b.onclick = () => { S.drum = b.dataset.drum; vedereAcasa(++S.randare); }; });
  $('#start').onclick = () => pornesteLectia({ mod: setari.mod });
  const cp = $('#checkpoint'); if (cp) cp.onclick = () => pornesteLectia({ mod: 'test' });
  const ul = $('[data-lectie]'); if (ul) ul.onclick = () => { location.hash = '#/lectie/' + ul.dataset.lectie; };
}
function tile(href, icon, t, d, nr) {
  return '<a class="tile" href="' + href + '"><span class="tile-icon">' + icon + '</span><b>' + esc(t) + '</b><span>' + esc(d) + '</span>' + (nr ? '<i class="tile-nr">' + nr + '</i>' : '') + '</a>';
}
function cardLectie(l, eUltima) {
  let h = '<section class="card apasabil" data-lectie="' + esc(l.id) + '"><div class="rand"><b>' + (eUltima ? 'Ultima: ' : '') + esc(NUME_MOD[l.mod] || 'Lecție') + '</b><span class="mic">' + zi(l.data) + ' · ' + (l.mod === 'text' ? (l.replici || 0) + ' mesaje' : durata(l.durata_s)) + (l.cost_usd ? ' · ' + dolari(l.cost_usd) : '') + '</span></div>';
  if (l.raport_test) h += '<div class="raport-mini"><span class="cefr">' + esc(l.raport_test.cefr) + '</span><span>fluență ' + l.raport_test.fluenta + ' · gramatică ' + l.raport_test.gramatica + ' · vocabular ' + l.raport_test.vocabular + ' · pronunție ' + l.raport_test.pronuntie + '</span></div>';
  if (!l.gata && !l.eroare) return h + '<p class="text-2 pulseaza">Rezumatul se pregătește…</p></section>';
  if (l.eroare) return h + '<p class="text-2">Rezumatul n-a mers pentru sesiunea asta.</p></section>';
  if (l.rezumat_ro) h += '<p>' + esc(l.rezumat_ro) + '</p>';
  if (l.progres_ro) h += '<p class="bine">' + esc(l.progres_ro) + '</p>';
  if ((l.greseli || []).length) h += '<ul class="greseli">' + l.greseli.slice(0, eUltima ? 3 : 8).map((g) => '<li><s>' + esc(g.gresit) + '</s><b>' + esc(g.corect) + '</b></li>').join('') + '</ul>';
  return h + '</section>';
}

/* ------------------------------------------------------------ PARCURS */
async function vedereParcurs(id) {
  titlu('Parcurs');
  if (!S.parcurs) $('#main').innerHTML = '<div class="incarca"><span class="punct-incarca"></span></div>';
  S.parcurs = await api('/api/engleza/parcurs');
  if (id !== S.randare) return;
  const p = S.parcurs;
  const cur = p.curenta;
  const prog = Math.min(1, Math.max(0, cur / 20));
  let h = '<section class="card parcurs-cap"><div class="rand"><div><span class="eticheta">Programul de 20 de săptămâni</span><h2>' + (cur >= 1 && cur <= 20 ? 'Săptămâna ' + cur + ' din 20' : cur > 20 ? 'Program terminat' : 'Testul de nivel') + '</h2></div>' + inel(prog, Math.round(prog * 100) + '%', 'parcurs') + '</div>' +
    '<p class="mic">5 oct. 2026 – 21 feb. 2027 · checkpoint-uri în săptămânile 5, 10, 15 și 20</p></section>';
  h += '<div class="harta" id="harta"></div>';
  $('#main').innerHTML = h;
  deseneazaHarta(p);
}
function deseneazaHarta(p) {
  const cutie = $('#harta');
  if (!cutie) return;
  const W = Math.min(560, cutie.clientWidth || 360);
  const pas = 104, sus = 70;
  const n = p.saptamani.length;
  const H = sus + (n - 1) * pas + 90;
  const amp = W * 0.27;
  const pts = p.saptamani.map((w, i) => ({ x: W / 2 + Math.sin(i * 0.92) * amp, y: sus + i * pas, w }));
  const cale = (a) => {
    if (a.length < 2) return '';
    let d = 'M' + a[0].x.toFixed(1) + ',' + a[0].y.toFixed(1);
    for (let i = 0; i < a.length - 1; i++) {
      const p0 = a[i - 1] || a[i], p1 = a[i], p2 = a[i + 1], p3 = a[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6, c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += 'C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1);
    }
    return d;
  };
  const idxCur = Math.min(n - 1, Math.max(0, p.curenta));
  let s = '<svg class="harta-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Parcursul pe săptămâni">';
  s += '<path class="drum-viitor" d="' + cale(pts) + '"/>';
  s += '<path class="drum-trecut" d="' + cale(pts.slice(0, idxCur + 1)) + '"/>';
  const faze = { 0: 'Testul de nivel', 1: 'Faza 1 · ' + p.faze['1'], 6: 'Faza 2 · ' + p.faze['2'], 11: 'Faza 3 · ' + p.faze['3'], 16: 'Faza 4 · ' + p.faze['4'] };
  pts.forEach((q, i) => {
    const w = q.w;
    if (faze[i] !== undefined) {
      const st = q.x > W / 2;
      s += '<text class="harta-faza" x="' + (st ? 12 : W - 12) + '" y="' + (q.y - 38) + '" text-anchor="' + (st ? 'start' : 'end') + '">' + esc(faze[i]) + '</text>';
    }
    const cls = ['nod', w.stare, w.checkpoint ? 'cp' : '', w.lectii ? 'cu-lectii' : ''].join(' ');
    const r = w.checkpoint ? 30 : 25;
    s += '<g class="' + cls + '" data-sapt="' + w.n + '" tabindex="0" role="button" aria-label="Săptămâna ' + w.n + ': ' + esc(w.tema || '') + '">';
    if (w.stare === 'curenta') s += '<circle class="nod-puls" cx="' + q.x.toFixed(1) + '" cy="' + q.y + '" r="' + (r + 6) + '"/>';
    s += '<circle class="nod-cerc" cx="' + q.x.toFixed(1) + '" cy="' + q.y + '" r="' + r + '"/>';
    s += '<text class="nod-nr" x="' + q.x.toFixed(1) + '" y="' + (q.y + 6) + '" text-anchor="middle">' + (w.checkpoint ? '★' : w.n) + '</text>';
    const lat = q.x > W / 2 ? -1 : 1;
    const tx = q.x + lat * (r + 12);
    s += '<text class="nod-et" x="' + tx.toFixed(1) + '" y="' + (q.y - 2) + '" text-anchor="' + (lat > 0 ? 'start' : 'end') + '">' + (w.checkpoint ? 'Checkpoint · ' : '') + 'Săpt. ' + w.n + '</text>';
    s += '<text class="nod-sub" x="' + tx.toFixed(1) + '" y="' + (q.y + 15) + '" text-anchor="' + (lat > 0 ? 'start' : 'end') + '">' + (w.lectii ? w.lectii + (w.lectii === 1 ? ' lecție' : ' lecții') + (w.minute ? ' · ' + w.minute + ' min' : '') : (w.stare === 'curenta' ? 'acum' : w.stare === 'viitoare' ? new Date(w.de_la).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }) : '')) + '</text>';
    s += '</g>';
  });
  s += '</svg>';
  cutie.innerHTML = s;
  $$('.nod', cutie).forEach((g) => {
    const deschide = () => { location.hash = '#/saptamana/' + g.dataset.sapt; };
    g.addEventListener('click', deschide);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); deschide(); } });
  });
  const cur = $('.nod.curenta', cutie);
  if (cur && ruta().v === 'parcurs') setTimeout(() => cur.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150);
}
function foaieSaptamana(n) {
  const w = S.parcurs && S.parcurs.saptamani.find((x) => x.n === n);
  if (!w) return;
  const ex = w.examen;
  strat('<span class="eticheta">' + esc(w.faza_nume || '') + ' · ' + new Date(w.de_la).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }) + ' – ' + new Date(w.pana_la).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }) + '</span>' +
    '<h2>' + (w.checkpoint ? 'Checkpoint · ' : '') + 'Săptămâna ' + w.n + '</h2><p class="tema-foaie">' + esc(w.tema || '') + '</p>' +
    '<div class="cifre-mici"><span><b>' + w.lectii + '</b> lecții</span><span><b>' + w.minute + '</b> minute</span><span><b>' + w.teste + '</b> teste</span></div>' +
    (ex ? '<div class="raport-mini"><span class="cefr">' + esc(ex.cefr) + '</span><span>fluență ' + ex.fluenta + ' · gramatică ' + ex.gramatica + ' · vocabular ' + ex.vocabular + ' · pronunție ' + ex.pronuntie + '</span></div>' : '') +
    '<div class="butoane-col"><button class="buton principal" id="f-lectie">' + ICON.mic + ' Lecție vorbită pe tema asta</button>' +
    '<button class="buton" id="f-scris">' + ICON.creion + ' Scrie pe tema asta</button>' +
    '<button class="buton" id="f-test">' + ICON.fulger + ' Test pe tema asta</button>' +
    (w.checkpoint ? '<button class="buton" id="f-examen">' + ICON.trofeu + ' Testul vorbit de checkpoint</button>' : '') + '</div>',
  () => {
    $('#f-lectie').onclick = () => { inchideStrat(); pornesteLectia({ mod: 'lectie', saptamana: n }); };
    $('#f-scris').onclick = () => { inchideStrat(); sessionStorage.setItem('engleza.scris.sapt', String(n)); location.hash = '#/scris'; };
    $('#f-test').onclick = () => { inchideStrat(); location.hash = '#/test/tema-' + n; };
    const fe = $('#f-examen'); if (fe) fe.onclick = () => { inchideStrat(); pornesteLectia({ mod: 'test', saptamana: n }); };
  });
  const s = $('#strat');
  const vechi = s.onclick;
  s.onclick = (e) => { if (e.target === s) { vechi(e); if (ruta().v === 'saptamana') history.replaceState(null, '', '#/parcurs'); } };
}

/* ------------------------------------------------------------ EXERSEAZĂ */
async function vedereExerseaza(id) {
  titlu('Exersează');
  if (!S.stare) await incarcaStare();
  let progres = null;
  try { progres = await api('/api/engleza/progres'); S.progres = progres; } catch (e) { /* lista de teste lipsește, restul merge */ }
  if (id !== S.randare) return;
  const s = S.stare || {};
  let h = '<div class="grila-actiuni mare">' +
    tile('#/carduri', ICON.carduri, 'Cartonașe', s.de_repetat ? s.de_repetat + ' de repetat azi' : 'cuvintele și greșelile tale', s.de_repetat) +
    tile('#/scris', ICON.creion, 'Scrie cu profesorul', 'conversație în scris, cu corecturi') +
    tile('#/test/rapid', ICON.fulger, 'Test rapid', 'un pic din toate') +
    tile('#/test/greseli', ICON.bifa, 'Greșelile mele', 'din lecțiile tale') +
    tile('#/test/cuvinte', ICON.carte, 'Cuvintele mele', 'vocabularul tău') +
    tile('#/test/ascultare', ICON.ureche, 'Ascultare', 'mesaje vocale de la „clienți”') +
    tile('#/test/vorbit', ICON.vorbire, 'Spune în engleză', 'răspunzi cu vocea') +
    tile('#/test/tema', ICON.harta, 'Tema săptămânii', s.tema ? s.tema.split(':')[0] : '') +
    '</div>';
  h += '<button class="banda-checkpoint lat" id="examen">' + ICON.trofeu + '<span>Test vorbit de 10 minute, cu nivel și scor</span></button>';
  const ist = (progres && progres.teste_istoric) || [];
  if (ist.length) h += '<h2 class="titlu">Testele tale</h2><section class="card"><ul class="lista-teste">' + ist.slice(-8).reverse().map((t) => '<li><span>' + esc(t.titlu || t.tip) + '<small>' + zi(t.data) + '</small></span><b class="' + (t.scor >= 80 ? 'bine' : t.scor < 50 ? 'rau' : '') + '">' + t.scor + '%</b></li>').join('') + '</ul></section>';
  $('#main').innerHTML = h;
  $('#examen').onclick = () => pornesteLectia({ mod: 'test' });
}

/* ------------------------------------------------------------ TEST (scris, ascultare, vorbit) */
const T = { test: null, i: 0, rasp: [], ordine: [], start: 0, raspuns: false };
const MESAJE_INCARCARE = ['Îți aleg greșelile de verificat…', 'Scriu mesajele „clienților”…', 'Amestec variantele…', 'Încă puțin…'];
async function vedereTest(id, arg) {
  titlu('Test');
  const m = String(arg || 'rapid').split('?')[0].match(/^(rapid|greseli|cuvinte|ascultare|tema|vorbit)(?:-(\d{1,2}))?$/);
  const tip = m ? m[1] : 'rapid';
  const sapt = m && m[2] ? Number(m[2]) : null;
  let k = 0;
  $('#main').innerHTML = '<div class="gol-mare"><div class="incarca-test"><span></span><span></span><span></span></div><h2>Îți pregătesc testul</h2><p class="text-2" id="msg-inc">' + MESAJE_INCARCARE[0] + '</p></div>';
  const ceas = setInterval(() => { const el = $('#msg-inc'); if (el) el.textContent = MESAJE_INCARCARE[++k % MESAJE_INCARCARE.length]; }, 3500);
  let r;
  try { r = await api('/api/engleza/test/nou', { method: 'POST', body: sapt !== null ? { tip, saptamana: sapt } : { tip } }); } finally { clearInterval(ceas); }
  if (id !== S.randare) return;
  T.test = r.test; T.i = 0; T.rasp = []; T.start = Date.now();
  T.ordine = T.test.intrebari.map((q) => (q.variante ? amesteca(q.variante.length) : null));
  intrebare();
}
function intrebare() {
  const t = T.test, i = T.i, q = t.intrebari[i];
  T.raspuns = false;
  titlu(t.titlu || 'Test');
  const puncte = t.intrebari.map((_, j) => '<span class="' + (j < i ? (T.rasp[j] && T.rasp[j].corect ? 'ok' : 'gresit') : j === i ? 'acum' : '') + '"></span>').join('');
  const enunt = {
    alege: 'Alege varianta potrivită', corecteaza: 'Care variantă e corectă?', traducere: 'Cum spui în engleză?',
    cuvant: 'Ce înseamnă?', ascultare: 'Ascultă și răspunde', spune: 'Spune în engleză',
  }[q.tip];
  let corp = '';
  if (q.tip === 'alege') corp = '<p class="propozitie">' + esc(q.text).replace(/_{2,}/g, '<span class="gol">&nbsp;?&nbsp;</span>') + '</p>';
  if (q.tip === 'corecteaza') corp = '<p class="propozitie gresita">' + esc(q.text) + '</p>';
  if (q.tip === 'traducere') corp = '<p class="propozitie ro">„' + esc(q.ro) + '”</p>';
  if (q.tip === 'cuvant') corp = '<div class="cuvant-mare"><b>' + esc(q.text) + '</b><button class="buton-rotund" id="pronunta" aria-label="Ascultă pronunția">' + ICON.difuzor + '</button></div>';
  if (q.tip === 'ascultare') corp = '<button class="play-mare" id="asculta" aria-label="Ascultă mesajul">' + ICON.difuzor + '<span>Ascultă</span></button><p class="propozitie">' + esc(q.intrebare) + '</p><p class="transcriere-ascunsa" id="text-ascultare" hidden>„' + esc(q.audio_text) + '”</p>';
  if (q.tip === 'spune') corp = '<p class="propozitie ro">„' + esc(q.ro) + '”</p><button class="mic-mare" id="spune">' + ICON.mic + '<span>Apasă și spune</span></button><div class="sau"><input id="scrie-raspuns" type="text" placeholder="…sau scrie răspunsul" autocomplete="off" autocapitalize="sentences"><button class="buton" id="verifica-scris">Verifică</button></div><div id="rezultat-spune"></div>';
  let variante = '';
  if (q.variante) variante = '<div class="variante">' + T.ordine[i].map((orig, k) => '<button class="varianta" data-v="' + orig + '"><i>' + 'ABCD'[k] + '</i><span>' + esc(q.variante[orig]) + '</span></button>').join('') + '</div>';
  $('#main').innerHTML = '<div class="test"><div class="test-sus"><button class="buton-icon mic-x" id="iesi" aria-label="Ieși din test">✕</button><div class="puncte">' + puncte + '</div><span class="mic">' + (i + 1) + '/' + t.intrebari.length + '</span></div>' +
    '<section class="intrebare-card"><span class="eticheta">' + enunt + '</span>' + corp + variante + '<div id="feedback"></div></section></div>';
  $('#iesi').onclick = () => { if (confirm('Ieși din test? Răspunsurile de până acum nu se salvează.')) location.hash = '#/exerseaza'; };
  $$('.varianta').forEach((b) => { b.onclick = () => raspundeVarianta(Number(b.dataset.v), b); });
  const pr = $('#pronunta'); if (pr) { pr.onclick = () => reda(q.text, pr); }
  const as = $('#asculta'); if (as) { as.onclick = () => reda(q.audio_text, as); setTimeout(() => reda(q.audio_text, as), 350); }
  const sp = $('#spune'); if (sp) legaSpune(q, sp);
  const vs = $('#verifica-scris'); if (vs) vs.onclick = () => { const v = $('#scrie-raspuns').value.trim(); if (v) verificaSpune(q, v); };
}
function raspundeVarianta(v, buton) {
  if (T.raspuns) return;
  T.raspuns = true;
  const q = T.test.intrebari[T.i];
  const ok = v === q.corect;
  $$('.varianta').forEach((b) => {
    b.disabled = true;
    const x = Number(b.dataset.v);
    if (x === q.corect) b.classList.add('corecta');
    else if (x === v) b.classList.add('gresita');
  });
  T.rasp[T.i] = { corect: ok, raspuns: q.variante[v] };
  if (ok) xpPluteste(buton, '+10 XP');
  if (q.tip === 'ascultare') { const ta = $('#text-ascultare'); if (ta) ta.hidden = false; }
  feedback(ok, q.explicatie_ro);
}
function feedback(ok, explicatie, extra) {
  $('#feedback').innerHTML = '<div class="feedback ' + (ok ? 'ok' : 'gresit') + '"><b>' + (ok ? ['Corect!', 'Exact!', 'Bravo!', 'Perfect!'][Math.floor(Math.random() * 4)] : 'Nu chiar.') + '</b>' +
    (extra || '') + (explicatie ? '<p>' + esc(explicatie) + '</p>' : '') + '<button class="buton principal" id="continua">' + (T.i + 1 < T.test.intrebari.length ? 'Continuă' : 'Vezi rezultatul') + '</button></div>';
  const c = $('#continua');
  c.focus({ preventScroll: true });
  $('#feedback').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  c.onclick = () => { T.i += 1; if (T.i < T.test.intrebari.length) intrebare(); else finalTest(); };
}
function legaSpune(q, buton) {
  let inregistreaza = false;
  buton.onclick = async () => {
    if (T.raspuns) return;
    if (!inregistreaza) {
      try { await Mic.porneste(); } catch (e) { toast(mesajMicrofon(e), true); return; }
      inregistreaza = true;
      buton.classList.add('inregistreaza');
      buton.querySelector('span').textContent = 'Te ascult… apasă când termini';
      return;
    }
    inregistreaza = false;
    buton.classList.remove('inregistreaza');
    buton.disabled = true;
    buton.querySelector('span').textContent = 'Transcriu…';
    try {
      const blob = await Mic.opreste();
      if (!blob) { toast('N-am prins nimic. Mai încearcă.', true); buton.disabled = false; buton.querySelector('span').textContent = 'Apasă și spune'; return; }
      const text = await apiTranscrieEngleza(blob);
      await verificaSpune(q, text || '');
    } catch (e) {
      buton.disabled = false;
      buton.querySelector('span').textContent = 'Apasă și spune';
      if (e instanceof EroareAuth) return ecranNeautorizat();
      toast(e.message, true);
    }
  };
}
async function verificaSpune(q, text) {
  if (T.raspuns) return;
  const sp = $('#spune'); if (sp) { sp.disabled = true; sp.querySelector('span').textContent = 'Verific…'; }
  try {
    const r = await api('/api/engleza/verifica', { method: 'POST', body: { id: T.test.id, i: T.i, raspuns: text } });
    T.raspuns = true;
    const ok = !!r.corect;
    T.rasp[T.i] = { corect: ok, raspuns: text };
    if (ok) xpPluteste(sp || $('#feedback'), '+10 XP');
    const extra = '<p class="ce-ai-spus">Ai spus: „' + esc(text || '…') + '”</p>' + (!ok || r.aproape ? '<p class="varianta-buna"><button class="buton-rotund mic" id="reda-buna" aria-label="Ascultă varianta bună">' + ICON.difuzor + '</button>' + esc(r.varianta_buna || q.asteptat) + '</p>' : '');
    feedback(ok, r.nota_ro || q.explicatie_ro, extra);
    const rb = $('#reda-buna'); if (rb) rb.onclick = () => reda(r.varianta_buna || q.asteptat, rb);
    if (sp) sp.querySelector('span').textContent = ok ? 'Corect' : 'Gata';
  } catch (e) {
    if (sp) { sp.disabled = false; sp.querySelector('span').textContent = 'Apasă și spune'; }
    if (e instanceof EroareAuth) return ecranNeautorizat();
    toast(e.message, true);
  }
}
async function finalTest() {
  const t = T.test;
  const corecte = T.rasp.filter((r) => r && r.corect).length;
  const procent = corecte / t.intrebari.length;
  titlu('Rezultat');
  $('#main').innerHTML = '<div class="final-test">' + inel(procent, Math.round(procent * 100) + '%', corecte + ' din ' + t.intrebari.length) +
    '<h2>' + (procent === 1 ? 'Impecabil!' : procent >= 0.8 ? 'Foarte bine!' : procent >= 0.5 ? 'Bun început' : 'Mai exersăm') + '</h2><p class="text-2" id="xp-final">Salvez rezultatul…</p>' +
    '<div class="recapitulare">' + t.intrebari.map((q, i) => (T.rasp[i] && T.rasp[i].corect) ? '' :
      '<div class="rec-item"><span class="rec-q">' + esc(q.tip === 'spune' ? q.ro : (q.text || q.ro || q.intrebare || '')) + '</span><b>' + esc(q.variante ? q.variante[q.corect] : q.asteptat) + '</b>' + (q.explicatie_ro ? '<small>' + esc(q.explicatie_ro) + '</small>' : '') + '</div>').join('') + '</div>' +
    '<div class="butoane-col"><button class="buton principal" id="inca">Încă un test</button><button class="buton" id="gata">Gata</button></div></div>';
  if (procent >= 0.8) confetti();
  $('#inca').onclick = () => { location.hash = '#/test/' + (t.tip || 'rapid') + '?' + Date.now(); };
  $('#gata').onclick = () => { location.hash = '#/exerseaza'; };
  try {
    const r = await api('/api/engleza/test/rezultat', { method: 'POST', body: { id: t.id, raspunsuri: T.rasp, durata_s: Math.round((Date.now() - T.start) / 1000) } });
    $('#xp-final').textContent = '+' + r.xp + ' XP';
    incarcaStare().catch(() => {});
  } catch (e) { $('#xp-final').textContent = 'Rezultatul nu s-a salvat (' + e.message + ').'; }
}

/* ------------------------------------------------------------ CARTONAȘE */
const K = { lista: [], i: 0, intors: false, stiute: 0 };
async function vedereCarduri(id) {
  titlu('Cartonașe');
  const r = await api('/api/engleza/carduri');
  if (id !== S.randare) return;
  K.lista = r.carduri || []; K.i = 0; K.stiute = 0;
  if (!K.lista.length) {
    $('#main').innerHTML = '<div class="gol-mare"><div class="gol-icon">' + ICON.carduri + '</div><h2>' + (r.total ? 'Nimic de repetat azi' : 'Încă n-ai cartonașe') + '</h2><p class="text-2">' +
      (r.total ? 'Ai ' + r.total + ' cartonașe, ' + r.stapanite + ' deja stăpânite. Revin singure când e momentul să le repeți.' : 'Fiecare cuvânt nou și fiecare greșeală din lecții devin cartonașe, iar aplicația ți le aduce înapoi la 1, 3, 7 și 16 zile.') +
      '</p><a class="buton principal" href="#/test/cuvinte">Fă un test de vocabular</a></div>';
    return;
  }
  card();
}
function card() {
  const c = K.lista[K.i];
  K.intors = false;
  const greseala = c.tip === 'greseala';
  $('#main').innerHTML = '<div class="carduri"><div class="test-sus"><span class="mic">' + (K.i + 1) + ' din ' + K.lista.length + '</span><span class="mic">cutia ' + (c.cutie || 1) + ' din 5</span></div>' +
    '<button class="card-mare" id="card" aria-label="Întoarce cartonașul"><div class="fata">' +
    (greseala ? '<span class="eticheta">Cum se spune corect?</span><p class="propozitie gresita">' + esc(c.gresit) + '</p>' : '<span class="eticheta">Ce înseamnă?</span><b class="cuvant-card">' + esc(c.en) + '</b>') +
    '<span class="mic">atinge ca să vezi răspunsul</span></div>' +
    '<div class="spate"><span class="eticheta">' + (greseala ? 'Corect' : 'În română') + '</span>' + (greseala ? '<b class="propozitie">' + esc(c.en) + '</b><small>' + esc(c.ro || '') + '</small>' : '<b class="cuvant-card">' + esc(c.ro || '—') + '</b><small>' + esc(c.en) + '</small>') + '</div></button>' +
    '<div class="card-butoane"><button class="buton-rotund" id="pron" aria-label="Ascultă în engleză">' + ICON.difuzor + '</button></div>' +
    '<div class="butoane" id="decizie" hidden><button class="buton pericol" id="nu-stiam">Nu știam</button><button class="buton principal" id="stiam">Știam</button></div></div>';
  $('#card').onclick = () => { K.intors = !K.intors; $('#card').classList.toggle('intors', K.intors); $('#decizie').hidden = false; };
  $('#pron').onclick = () => reda(c.en, $('#pron'));
  $('#stiam').onclick = () => raspundeCard(true);
  $('#nu-stiam').onclick = () => raspundeCard(false);
}
async function raspundeCard(stiut) {
  const c = K.lista[K.i];
  if (stiut) { K.stiute += 1; xpPluteste($('#stiam'), '+2 XP'); }
  api('/api/engleza/carduri', { method: 'POST', body: { cheie: c.cheie, stiut } }).catch((e) => toast(e.message, true));
  K.i += 1;
  if (K.i < K.lista.length) { setTimeout(card, 180); return; }
  $('#main').innerHTML = '<div class="final-test">' + inel(K.stiute / K.lista.length, K.stiute + '/' + K.lista.length, 'știute') + '<h2>Gata pe azi</h2><p class="text-2">Cele știute revin peste câteva zile; restul, mâine.</p><a class="buton principal" href="#/exerseaza">Înapoi</a></div>';
  if (K.stiute === K.lista.length && K.lista.length >= 5) confetti();
  incarcaStare().catch(() => {});
}

/* ------------------------------------------------------------ SCRIE CU PROFESORUL */
let C = null;
function salveazaScris() { try { sessionStorage.setItem(CHEIE_SCRIS, JSON.stringify(C)); } catch (e) { /* ignor */ } }
async function vedereScris(id) {
  titlu('Scrie cu profesorul');
  try { C = JSON.parse(sessionStorage.getItem(CHEIE_SCRIS) || 'null'); } catch (e) { C = null; }
  const saptCeruta = sessionStorage.getItem('engleza.scris.sapt');
  sessionStorage.removeItem('engleza.scris.sapt');
  if (!C || (saptCeruta !== null && Number(saptCeruta) !== C.saptamana)) {
    C = { mesaje: [], start: Date.now(), saptamana: saptCeruta !== null ? Number(saptCeruta) : null };
  }
  deseneazaScris();
  if (!C.mesaje.length) await raspunsProfesor(id);
}
function deseneazaScris() {
  let h = '<div class="chat"><div class="chat-sus"><span class="mic">' + (C.saptamana !== null ? 'Tema săptămânii ' + C.saptamana : 'Conversație liberă în scris') + '</span><button class="buton mic-b" id="termina-scris">Termină</button></div><div class="chat-bule" id="bule">';
  C.mesaje.forEach((m, i) => {
    h += '<div class="bula ' + (m.de === 'eu' ? 'eu' : 'prof') + '">' + esc(m.text) + (m.de !== 'eu' ? '<button class="buton-rotund mic" data-reda="' + i + '" aria-label="Ascultă">' + ICON.difuzor + '</button>' : '') + '</div>';
    if (m.corectura) h += '<div class="corectura"><span class="eticheta">Mai bine așa</span><b>' + esc(m.corectura.corect) + '</b>' + (m.corectura.nota_ro ? '<small>' + esc(m.corectura.nota_ro) + '</small>' : '') + '</div>';
  });
  if (C.asteapta) h += '<div class="bula prof scrie"><span class="punct-incarca"></span></div>';
  h += '</div><div class="chat-jos"><button class="buton-rotund" id="dicteaza" aria-label="Dictează în engleză">' + ICON.mic + '</button><textarea id="mesaj" rows="1" placeholder="Write in English…" autocapitalize="sentences"></textarea><button class="buton principal" id="trimite">Trimite</button></div></div>';
  $('#main').innerHTML = h;
  const ta = $('#mesaj');
  ta.value = C.ciorna || '';
  ta.oninput = () => { C.ciorna = ta.value; ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; };
  ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(min-width: 700px)').matches) { e.preventDefault(); trimiteScris(); } };
  $('#trimite').onclick = trimiteScris;
  $('#termina-scris').onclick = terminaScris;
  $$('[data-reda]').forEach((b) => { b.onclick = () => reda(C.mesaje[Number(b.dataset.reda)].text, b); });
  legaDictareEngleza($('#dicteaza'), ta);
  const b = $('#bule'); b.scrollTop = b.scrollHeight;
  window.scrollTo(0, document.body.scrollHeight);
}
function legaDictareEngleza(buton, ta) {
  let inreg = false;
  buton.onclick = async () => {
    if (!inreg) {
      try { await Mic.porneste(); } catch (e) { toast(mesajMicrofon(e), true); return; }
      inreg = true; buton.classList.add('inregistreaza'); return;
    }
    inreg = false; buton.classList.remove('inregistreaza'); buton.disabled = true;
    try {
      const blob = await Mic.opreste();
      if (blob) { const t = await apiTranscrieEngleza(blob); ta.value = (ta.value ? ta.value + ' ' : '') + t; ta.dispatchEvent(new Event('input')); ta.focus(); }
    } catch (e) { toast(e.message, true); }
    buton.disabled = false;
  };
}
async function raspunsProfesor(id) {
  C.asteapta = true; deseneazaScris();
  try {
    const corp = { mesaje: C.mesaje.map((m) => ({ de: m.de, text: m.text })) };
    if (C.saptamana !== null) corp.saptamana = C.saptamana;
    const r = await api('/api/engleza/chat', { method: 'POST', body: corp });
    C.asteapta = false;
    if (r.corectura) { const ultim = C.mesaje[C.mesaje.length - 1]; if (ultim && ultim.de === 'eu') ultim.corectura = r.corectura; }
    C.mesaje.push({ de: 'prof', text: r.raspuns, ts: new Date().toISOString() });
  } catch (e) {
    C.asteapta = false;
    if (e instanceof EroareAuth) return ecranNeautorizat();
    toast(e.message, true);
  }
  salveazaScris();
  if (id === undefined || id === S.randare || ruta().v === 'scris') deseneazaScris();
}
async function trimiteScris() {
  const ta = $('#mesaj');
  const text = ta.value.trim();
  if (!text || C.asteapta) return;
  C.mesaje.push({ de: 'eu', text, ts: new Date().toISOString() });
  C.ciorna = '';
  salveazaScris();
  await raspunsProfesor();
}
async function terminaScris() {
  const ale = C.mesaje.filter((m) => m.de === 'eu').length;
  if (ale < 1) { sessionStorage.removeItem(CHEIE_SCRIS); C = null; location.hash = '#/acasa'; return; }
  const transcript = [];
  C.mesaje.forEach((m) => { transcript.push({ de: m.de === 'eu' ? 'eu' : 'profesor', text: m.text, ts: m.ts }); });
  try {
    const r = await api('/api/engleza/lectie', { method: 'POST', body: { mod: 'text', transcript, durata_s: Math.round((Date.now() - C.start) / 1000), saptamana: C.saptamana } });
    sessionStorage.removeItem(CHEIE_SCRIS); C = null;
    toast('Salvat. Rezumatul vine în câteva secunde.');
    location.hash = '#/lectie/' + r.id;
  } catch (e) { toast(e.message, true); }
}

/* ------------------------------------------------------------ PROGRES (grafice: o serie, o axă, tooltip la fiecare punct) */
let graficeActive = [];
function grafic(puncte, opt) {
  const W = Math.max(280, Math.min(680, (($('#main') || {}).clientWidth || 360) - 34)), H = opt.inaltime || 190, pL = 40, pR = 10, pT = 14, pB = 26;
  const n = puncte.length;
  if (!n) return '<p class="text-2">Încă nu sunt date.</p>';
  const vals = puncte.map((p) => p.v).filter((v) => !gol(v));
  let max = opt.max || Math.max(1, ...vals);
  let min = opt.min !== undefined ? opt.min : 0;
  if (!opt.max) { const p10 = Math.pow(10, Math.floor(Math.log10(max))); max = Math.ceil(max / p10) * p10; }
  const slot = (W - pL - pR) / n;
  const y = (v) => pT + (H - pT - pB) * (1 - (v - min) / (max - min || 1));
  let s = '<svg class="grafic" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opt.titlu) + '">';
  (opt.grila || [min, (min + max) / 2, max]).forEach((v) => {
    const yy = y(v);
    s += '<line class="g-grila" x1="' + pL + '" x2="' + (W - pR) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '"/><text class="g-ax" x="' + (pL - 6) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="end">' + esc(opt.etichetaY ? opt.etichetaY(v) : nf.format(v)) + '</text>';
  });
  if (opt.tip === 'bare') {
    const bw = Math.max(2, slot - 2);
    puncte.forEach((p, i) => {
      if (gol(p.v) || p.v <= 0) return;
      const yy = y(p.v), x = pL + i * slot + (slot - bw) / 2, h = (H - pB) - yy, r = Math.min(4, bw / 2, h);
      s += '<path class="g-bara" data-i="' + i + '" d="M' + x.toFixed(1) + ',' + (H - pB) + 'V' + (yy + r).toFixed(1) + 'Q' + x.toFixed(1) + ',' + yy.toFixed(1) + ' ' + (x + r).toFixed(1) + ',' + yy.toFixed(1) + 'H' + (x + bw - r).toFixed(1) + 'Q' + (x + bw).toFixed(1) + ',' + yy.toFixed(1) + ' ' + (x + bw).toFixed(1) + ',' + (yy + r).toFixed(1) + 'V' + (H - pB) + 'Z"/>';
    });
  } else {
    const pts = puncte.map((p, i) => gol(p.v) ? null : [pL + i * slot + slot / 2, y(p.v)]).filter(Boolean);
    if (pts.length > 1) s += '<path class="g-linie" d="' + pts.map((q, k) => (k ? (opt.trepte ? 'H' + q[0].toFixed(1) + 'V' + q[1].toFixed(1) : 'L' + q[0].toFixed(1) + ',' + q[1].toFixed(1)) : 'M' + q[0].toFixed(1) + ',' + q[1].toFixed(1))).join('') + '"/>';
    puncte.forEach((p, i) => { if (!gol(p.v)) s += '<circle class="g-punct" data-i="' + i + '" cx="' + (pL + i * slot + slot / 2).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="5"/>'; });
  }
  const pas = Math.max(1, Math.ceil(n / 6));
  puncte.forEach((p, i) => { if ((n - 1 - i) % pas === 0) s += '<text class="g-ax" x="' + (pL + i * slot + slot / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(p.x) + '</text>'; });
  puncte.forEach((p, i) => { s += '<rect class="g-hit" data-i="' + i + '" x="' + (pL + i * slot).toFixed(1) + '" y="' + pT + '" width="' + slot.toFixed(1) + '" height="' + (H - pT - pB + 6) + '"/>'; });
  s += '</svg>';
  const id = 'g' + graficeActive.length;
  graficeActive.push({ id, puncte, W, pL, slot });
  return '<div class="grafic-cutie" data-grafic="' + id + '">' + s + '<div class="g-tip" hidden></div></div>';
}
function legaGrafice() {
  graficeActive.forEach((g) => {
    const cutie = $('[data-grafic="' + g.id + '"]');
    if (!cutie) return;
    const tip = $('.g-tip', cutie);
    const arata = (ev) => {
      const t = ev.target.closest('[data-i]');
      if (!t) return;
      const i = Number(t.dataset.i), p = g.puncte[i];
      if (!p || gol(p.v)) { tip.hidden = true; return; }
      $$('.activ', cutie).forEach((x) => x.classList.remove('activ'));
      $$('[data-i="' + i + '"]:not(.g-hit)', cutie).forEach((x) => x.classList.add('activ'));
      tip.innerHTML = p.tip;
      tip.hidden = false;
      const lat = cutie.clientWidth, cx = ((g.pL + (i + 0.5) * g.slot) / g.W) * lat;
      tip.style.left = Math.max(4, Math.min(lat - tip.offsetWidth - 4, cx - tip.offsetWidth / 2)) + 'px';
    };
    cutie.addEventListener('pointermove', arata);
    cutie.addEventListener('pointerdown', arata);
    cutie.addEventListener('pointerleave', () => { tip.hidden = true; $$('.activ', cutie).forEach((x) => x.classList.remove('activ')); });
  });
}
function hartaZile(zileActive) {
  const set = new Set(zileActive || []);
  const azi = new Date(); azi.setHours(12, 0, 0, 0);
  const sapt = 17;
  const start = new Date(azi); start.setDate(start.getDate() - ((azi.getDay() + 6) % 7) - (sapt - 1) * 7);
  let s = '<div class="harta-zile" role="img" aria-label="Zilele în care ai exersat, ultimele ' + sapt + ' săptămâni">';
  for (let w = 0; w < sapt; w++) {
    s += '<div class="col-zile">';
    for (let d = 0; d < 7; d++) {
      const z = new Date(start); z.setDate(start.getDate() + w * 7 + d);
      const iso = z.toLocaleDateString('sv-SE');
      const viitor = z > azi;
      s += '<span class="' + (viitor ? 'viitor' : set.has(iso) ? 'activ' : '') + '" title="' + z.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }) + (set.has(iso) ? ': ai exersat' : '') + '"></span>';
    }
    s += '</div>';
  }
  return s + '</div><div class="legenda-zile"><span class="mic">fără exercițiu</span><span class="cel"></span><span class="cel activ"></span><span class="mic">ai exersat</span></div>';
}
async function vedereProgres(id) {
  titlu('Progres');
  $('#main').innerHTML = '<div class="incarca"><span class="punct-incarca"></span></div>';
  const p = await api('/api/engleza/progres');
  if (id !== S.randare) return;
  S.progres = p;
  graficeActive = [];
  const ore = Math.floor((p.minute || 0) / 60), min = (p.minute || 0) % 60;
  let h = '<section class="erou mic-erou-p"><div class="erou-sus"><div class="erou-text"><span class="eticheta-erou">Nivelul tău acum</span><h2 class="cefr-mare">' + esc(p.nivel || '—') + '</h2><p class="tema">' + (p.nivel ? 'estimat din lecții și din testele vorbite' : 'îl afli după prima lecție sau din testul vorbit') + '</p></div>' +
    '<div class="erou-cifre col"><div class="cifra-erou' + (p.serie > 0 ? ' aprinsa' : '') + '">' + ICON.flacara + '<b>' + p.serie + '</b><span>zile la rând · record ' + p.serie_max + '</span></div><div class="cifra-erou xp"><b>' + new Intl.NumberFormat('ro-RO').format(p.xp) + '</b><span>XP</span></div></div></div></section>';
  h += '<div class="dale">' +
    dala(p.lectii, p.lectii === 1 ? 'sesiune' : 'sesiuni') + dala(ore ? ore + ' h ' + min + ' m' : min + ' min', 'de engleză vorbită') +
    dala(p.cuvinte, 'cuvinte și expresii', p.stapanite + ' stăpânite') + dala(p.teste, p.teste === 1 ? 'test' : 'teste') + '</div>';
  const nivelP = (p.nivel_istoric || []).map((x) => ({ x: new Date(x.data.replace(' ', 'T')).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }), v: cefrNr(x.nivel), tip: '<b>' + esc(x.nivel) + '</b><br>' + esc(x.sursa) + ', ' + zi(x.data) }));
  h += '<section class="card"><div class="rand"><h3>Nivelul în timp</h3><span class="mic">A1 → C2</span></div>' + (nivelP.length ? grafic(nivelP, { tip: 'linie', trepte: true, titlu: 'Nivelul în timp', min: 1, max: 6, grila: [1, 2, 3, 4, 5, 6], etichetaY: (v) => ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'][Math.round(v)] || '' }) : '<p class="text-2">Apare după prima lecție.</p>') + '</section>';
  const zile = (p.zile30 || []).map((z) => ({ x: new Date(z.zi).toLocaleDateString('ro-RO', { day: 'numeric', month: 'numeric' }), v: z.minute, tip: '<b>' + new Date(z.zi).toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'short' }) + '</b><br>' + nf.format(z.minute) + ' minute vorbite' }));
  h += '<section class="card"><div class="rand"><h3>Minute vorbite pe zi</h3><span class="mic">ultimele 30 de zile</span></div>' + grafic(zile, { tip: 'bare', titlu: 'Minute vorbite pe zi' }) + '</section>';
  const gr = (p.greseli_10min || []).map((x) => ({ x: new Date(x.data.replace(' ', 'T')).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }), v: x.valoare, tip: '<b>' + nf.format(x.valoare) + ' greșeli la 10 minute</b><br>' + zi(x.data) }));
  h += '<section class="card"><div class="rand"><h3>Greșeli la 10 minute</h3><span class="mic">cu cât mai jos, cu atât mai bine</span></div>' + (gr.length ? grafic(gr, { tip: 'linie', titlu: 'Greșeli la 10 minute' }) : '<p class="text-2">Apare după lecțiile vorbite de cel puțin 5 minute.</p>') + '</section>';
  const ts = (p.teste_istoric || []).map((x) => ({ x: new Date(x.data.replace(' ', 'T')).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }), v: x.scor, tip: '<b>' + x.scor + '%</b><br>' + esc(x.titlu || x.tip) + ', ' + zi(x.data) }));
  h += '<section class="card"><div class="rand"><h3>Scorurile la teste</h3><span class="mic">în procente</span></div>' + (ts.length ? grafic(ts, { tip: 'bare', titlu: 'Scorurile la teste', max: 100, grila: [0, 50, 100] }) : '<p class="text-2">Apare după primul test.</p>') + '</section>';
  const ex = (p.examene || []).slice(-1)[0];
  if (ex) h += '<section class="card"><div class="rand"><h3>Ultimul test vorbit</h3><span class="mic">' + zi(ex.data) + '</span></div>' + raportScoruri(ex) + '</section>';
  h += '<section class="card"><div class="rand"><h3>Zilele în care ai exersat</h3><span class="mic">ultimele 4 luni</span></div>' + hartaZile(p.zile_active) + '</section>';
  h += '<h2 class="titlu">Insigne</h2><div class="insigne">' + (p.insigne || []).map((b) => '<div class="insigna-p' + (b.castigata ? ' castigata' : '') + '" title="' + esc(b.descriere) + '"><span class="insigna-icon">' + (b.castigata ? ICON.trofeu : ICON.bifa) + '</span><b>' + esc(b.nume) + '</b><small>' + esc(b.descriere) + '</small></div>').join('') + '</div>';
  $('#main').innerHTML = h;
  legaGrafice();
}
function dala(v, et, sub) { return '<div class="dala"><b>' + esc(v) + '</b><span>' + esc(et) + '</span>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>'; }
function raportScoruri(r) {
  const rand = (n, v) => '<div class="scor-rand"><span>' + n + '</span><div class="scor-bara"><i data-w="' + (v * 10) + '"></i></div><b>' + v + '/10</b></div>';
  setTimeout(() => $$('.scor-bara i').forEach((el) => { el.style.width = el.dataset.w + '%'; }), 30);
  return '<div class="raport"><div class="cefr-cerc">' + esc(r.cefr) + '</div><div class="scoruri">' + rand('Fluență', r.fluenta) + rand('Gramatică', r.gramatica) + rand('Vocabular', r.vocabular) + rand('Pronunție', r.pronuntie) + '</div></div>' +
    (r.puncte_forte ? '<p class="bine">' + esc(r.puncte_forte) + '</p>' : '') + (r.de_lucrat ? '<p class="text-2">De lucrat: ' + esc(r.de_lucrat) + '</p>' : '');
}

/* ------------------------------------------------------------ ISTORIC */
async function vedereIstoric(id) {
  titlu('Istoric');
  const s = await incarcaStare();
  if (id !== S.randare) return;
  const l = s.lectii || [];
  let h = '<div class="rand istoric-cap"><span class="mic">' + l.length + ' sesiuni</span><span class="mic">luna asta: ' + dolari(s.cost_luna_usd) + '</span></div>';
  h += l.length ? l.map((x) => cardLectie(x, false)).join('') : '<div class="gol-mare"><h2>Încă nimic</h2><p class="text-2">Lecțiile, testele vorbite și conversațiile scrise apar aici, cu rezumat și text.</p></div>';
  $('#main').innerHTML = h;
  $$('[data-lectie]').forEach((el) => { el.onclick = () => { location.hash = '#/lectie/' + el.dataset.lectie; }; });
}
async function vedereLectie(id, lid) {
  titlu('Sesiunea');
  const l = await api('/api/engleza/lectie?id=' + encodeURIComponent(lid));
  if (id !== S.randare) return;
  const r = l.rezumat || {};
  let h = '<a class="buton mic-b" href="#/istoric">← Istoric</a><section class="card"><div class="rand"><h2>' + esc(NUME_MOD[l.mod] || 'Lecție') + '</h2><span class="mic">' + zi(l.data) + ' · ' + (l.mod === 'text' ? (l.transcript || []).length + ' mesaje' : durata(l.durata_s)) + (l.cost_usd ? ' · ' + dolari(l.cost_usd) : '') + '</span></div>';
  if (l.raport_test) h += raportScoruri(l.raport_test);
  if (!l.rezumat) h += '<p class="text-2 pulseaza">Rezumatul se pregătește…</p>';
  if (r.rezumat_ro) h += '<p>' + esc(r.rezumat_ro) + '</p>';
  if (r.progres_ro) h += '<p class="bine">' + esc(r.progres_ro) + '</p>';
  h += '</section>';
  if ((r.greseli || []).length) h += '<h2 class="titlu">Greșelile de reținut</h2><section class="card"><ul class="greseli">' + r.greseli.map((g) => '<li><s>' + esc(g.gresit) + '</s><b>' + esc(g.corect) + '</b>' + (g.nota_ro ? '<small>' + esc(g.nota_ro) + '</small>' : '') + '</li>').join('') + '</ul></section>';
  if ((r.cuvinte_noi || []).length) h += '<h2 class="titlu">Cuvinte noi</h2><section class="card"><ul class="cuvinte">' + r.cuvinte_noi.map((c, i) => '<li><button class="buton-rotund mic" data-cuv="' + i + '" aria-label="Ascultă">' + ICON.difuzor + '</button><b>' + esc(c.en) + '</b><span>' + esc(c.ro) + '</span></li>').join('') + '</ul></section>';
  if (r.data_viitoare_en) h += '<p class="mic centru">' + esc(r.data_viitoare_en) + '</p>';
  if ((l.transcript || []).length) h += '<details class="card"><summary>Tot textul conversației (' + l.transcript.length + ' replici)</summary><div class="chat-bule static">' + l.transcript.map((t) => '<div class="bula ' + (t.de === 'eu' ? 'eu' : 'prof') + '">' + esc(t.text) + '</div>').join('') + '</div></details>';
  $('#main').innerHTML = h;
  $$('[data-cuv]').forEach((b) => { b.onclick = () => reda(r.cuvinte_noi[Number(b.dataset.cuv)].en, b); });
  if (!l.rezumat) setTimeout(() => { if (ruta().v === 'lectie' && ruta().arg === lid) vedereLectie(++S.randare, lid); }, 5000);
}

/* ------------------------------------------------------------ LECȚIA VORBITĂ (OpenAI Realtime, WebRTC) */
const L = {
  faza: 'oprit', pc: null, dc: null, flux: null, transcript: [], inceput: 0, cost: 0, mut: false, mod: 'lectie', saptamana: null,
  oprireCeruta: false, reconectari: 0, ceas: null, wake: null, salvare: null, raport: null, apeluri: new Set(),
  ac: null, anMic: null, anProf: null, buf: null, rafId: 0, stare: '',
};
function ecranLive() {
  const examen = L.mod === 'test';
  $('#main').innerHTML = '<div class="live' + (examen ? ' examen' : '') + '">' +
    '<div class="live-sus"><span class="eticheta-live">' + (examen ? 'Test vorbit' : NUME_MOD[L.mod]) + (L.saptamana !== null ? ' · săpt. ' + L.saptamana : '') + '</span><span class="mic"><span id="ceas">0:00</span> · <span id="cost">$0.00</span></span></div>' +
    '<div class="orb-live" id="orb"><span class="orb-halou"></span><span class="orb-corp"></span></div>' +
    '<p class="stare" id="stare">Mă conectez…</p><p class="mic centru" id="sub-stare">' + (examen ? 'Fără corecturi în timpul testului. La final primești nivelul și scorurile.' : 'Vorbește liber. Profesorul te așteaptă când faci pauze.') + '</p>' +
    '<div class="comenzi">' +
    '<button class="buton" id="mut">' + ICON.mic + ' Microfon</button>' +
    '<button class="buton" id="rar">Mai rar</button>' +
    '<button class="buton" id="repede">Mai repede</button>' +
    (examen ? '<button class="buton" id="text-buton">Text</button>' : '<button class="buton" id="recap">Recap</button>') +
    '</div>' +
    '<div class="subtitrari" id="subtitrari"' + (setari.subtitrari ? '' : ' hidden') + '></div>' +
    '<button class="buton pericol lat" id="termina">' + (examen ? 'Oprește testul' : 'Termină lecția') + '</button>' +
    (examen ? '' : '<button class="buton-text" id="arata-text">' + (setari.subtitrari ? 'Ascunde textul' : 'Arată textul conversației') + '</button>') +
    '</div>';
  $('#mut').onclick = comutaMut;
  $('#rar').onclick = () => schimbaViteza(-0.1);
  $('#repede').onclick = () => schimbaViteza(0.1);
  const rc = $('#recap'); if (rc) rc.onclick = () => trimiteText('recap');
  const tb = $('#text-buton') || $('#arata-text');
  if (tb) tb.onclick = () => {
    setari.subtitrari = !setari.subtitrari; salveazaSetari();
    $('#subtitrari').hidden = !setari.subtitrari;
    if ($('#arata-text')) $('#arata-text').textContent = setari.subtitrari ? 'Ascunde textul' : 'Arată textul conversației';
    deseneazaSubtitrari();
  };
  $('#termina').onclick = () => terminaLectia(false);
}
function seteazaStare(text, clasa) {
  L.stare = clasa || '';
  const el = $('#stare'); if (el) el.textContent = text;
  const o = $('#orb'); if (o) o.className = 'orb-live ' + (clasa || '');
}
function deseneazaSubtitrari() {
  const el = $('#subtitrari');
  if (!el || el.hidden) return;
  el.innerHTML = L.transcript.slice(-10).map((t) => '<p class="' + (t.de === 'eu' ? 'eu' : 'prof') + '">' + esc(t.text) + '</p>').join('');
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
  const it = u.input_token_details || {}, ot = u.output_token_details || {}, cd = it.cached_tokens_details || {};
  const ain = it.audio_tokens || 0, tin = it.text_tokens || 0;
  let cA = cd.audio_tokens, cT = cd.text_tokens;
  if (cA === undefined && cT === undefined) { const c = it.cached_tokens || 0; cT = Math.min(tin, c); cA = Math.min(ain, c - cT); }
  cA = cA || 0; cT = cT || 0;
  return ((ain - cA) * PRET.audio_in + cA * PRET.audio_in_cache + (tin - cT) * PRET.text_in + cT * PRET.text_in_cache + (ot.audio_tokens || 0) * PRET.audio_out + (ot.text_tokens || 0) * PRET.text_out) / 1e6;
}
function laApelFunctie(nume, callId, argumente) {
  if (!callId || L.apeluri.has(callId)) return;
  L.apeluri.add(callId);
  if (nume === 'raport_test') {
    try { L.raport = JSON.parse(argumente || '{}'); } catch (e) { L.raport = null; }
    trimiteEveniment({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify({ ok: true, salvat: true }) } });
    trimiteEveniment({ type: 'response.create' });
    const ss = $('#sub-stare'); if (ss) ss.textContent = 'Rezultatul e gata. Îl vezi imediat ce închizi testul.';
    if (L.raport && L.raport.cefr) toast('Testul s-a încheiat: nivel ' + L.raport.cefr);
  }
}
function laEveniment(ev) {
  switch (ev.type) {
    case 'input_audio_buffer.speech_started': seteazaStare('Te ascult…', 'asculta'); break;
    case 'input_audio_buffer.speech_stopped': seteazaStare('Se gândește…', 'gandeste'); break;
    case 'response.created': seteazaStare(L.mod === 'test' ? 'Examinatorul vorbește' : 'Profesorul vorbește', 'vorbeste'); break;
    case 'response.done': {
      L.cost += costDin(ev.response && ev.response.usage);
      (ev.response && ev.response.output || []).forEach((o) => { if (o && o.type === 'function_call') laApelFunctie(o.name, o.call_id, o.arguments); });
      seteazaStare(L.mut ? 'Microfonul e oprit' : 'Rândul tău', L.mut ? 'mut' : 'asteapta');
      break;
    }
    case 'response.function_call_arguments.done': laApelFunctie(ev.name, ev.call_id, ev.arguments); break;
    case 'conversation.item.input_audio_transcription.completed': adaugaReplica('eu', ev.transcript); break;
    case 'response.output_audio_transcript.done': adaugaReplica('profesor', ev.transcript); break;
    case 'error': { const m = (ev.error && ev.error.message) || 'eroare'; if (!/cancel|no active response|already/i.test(m)) toast('OpenAI: ' + m, true); break; }
    default: break;
  }
}
function pornesteAnaliza() {
  try {
    L.ac = L.ac || new (window.AudioContext || window.webkitAudioContext)();
    if (L.ac.state === 'suspended') L.ac.resume();
    L.anMic = L.ac.createAnalyser(); L.anMic.fftSize = 512;
    L.ac.createMediaStreamSource(L.flux).connect(L.anMic);
    L.buf = new Uint8Array(L.anMic.fftSize);
  } catch (e) { L.anMic = null; }
  const nivel = (an) => {
    if (!an) return 0;
    an.getByteTimeDomainData(L.buf);
    let s = 0;
    for (let i = 0; i < L.buf.length; i++) { const v = (L.buf[i] - 128) / 128; s += v * v; }
    return Math.sqrt(s / L.buf.length);
  };
  let neted = 0;
  const cadru = () => {
    if (L.faza !== 'live' && L.faza !== 'conectare') return;
    const v = Math.max(L.mut ? 0 : nivel(L.anMic), nivel(L.anProf) * 1.2);
    neted = neted * 0.75 + Math.min(1, v * 4) * 0.25;
    const o = $('#orb');
    if (o) { o.style.setProperty('--nivel', neted.toFixed(3)); }
    L.rafId = requestAnimationFrame(cadru);
  };
  cancelAnimationFrame(L.rafId);
  L.rafId = requestAnimationFrame(cadru);
}
function leagaSunetProfesor(stream) {
  try {
    if (!L.ac) return;
    L.anProf = L.ac.createAnalyser(); L.anProf.fftSize = 512;
    L.ac.createMediaStreamSource(stream).connect(L.anProf);
  } catch (e) { L.anProf = null; }
}
async function conecteaza(reluare) {
  const corp = { mod: L.mod, drum: S.drum || drumImplicit(), viteza: setari.viteza, rabdare: setari.rabdare, zgomot: setari.zgomot, reluare: reluare || [] };
  if (L.saptamana !== null) corp.saptamana = L.saptamana;
  const s = await api('/api/engleza/sesiune', { method: 'POST', body: corp });
  if (s.preturi) PRET = s.preturi;
  const pc = new RTCPeerConnection();
  const sunet = $('#sunet');
  pc.ontrack = (e) => { sunet.srcObject = e.streams[0]; sunet.play().catch(() => {}); leagaSunetProfesor(e.streams[0]); };
  L.flux.getAudioTracks().forEach((t) => { t.enabled = !L.mut; pc.addTrack(t, L.flux); });
  const dc = pc.createDataChannel('oai-events');
  dc.onmessage = (e) => { try { laEveniment(JSON.parse(e.data)); } catch (x) { /* ignor */ } };
  dc.onopen = () => { dc.send(JSON.stringify({ type: 'response.create' })); };
  const oferta = await pc.createOffer();
  await pc.setLocalDescription(oferta);
  const r = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', body: oferta.sdp, referrerPolicy: 'no-referrer', headers: { Authorization: 'Bearer ' + s.cheie, 'Content-Type': 'application/sdp' } });
  if (!r.ok) throw new Error('OpenAI a refuzat legătura (' + r.status + '): ' + (await r.text()).slice(0, 160));
  await pc.setRemoteDescription({ type: 'answer', sdp: await r.text() });
  pc.onconnectionstatechange = () => { if (pc === L.pc && ['failed', 'disconnected', 'closed'].includes(pc.connectionState) && L.faza === 'live' && !L.oprireCeruta) reconecteaza(); };
  dc.onclose = () => { if (pc === L.pc && L.faza === 'live' && !L.oprireCeruta) reconecteaza(); };
  L.pc = pc; L.dc = dc;
}
let reconectareInCurs = false;
async function reconecteaza() {
  if (reconectareInCurs) return;
  reconectareInCurs = true;
  try {
    if (L.reconectari >= 4) { toast('Legătura a căzut de prea multe ori. Salvez sesiunea.', true); reconectareInCurs = false; await terminaLectia(true); return; }
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
      cost_usd: Math.round(L.cost * 10000) / 10000, mod: L.mod, drum: S.drum, raport_test: L.raport, saptamana: L.saptamana }));
  } catch (e) { /* ignor */ }
}
async function pornesteLectia(opt) {
  if (L.faza !== 'oprit') return;
  if (!window.RTCPeerConnection || !navigator.mediaDevices) { toast('Browserul ăsta nu poate face convorbiri.', true); return; }
  Object.assign(L, { faza: 'conectare', transcript: [], cost: 0, mut: false, oprireCeruta: false, reconectari: 0, raport: null, apeluri: new Set(),
    mod: (opt && opt.mod) || 'lectie', saptamana: opt && Number.isInteger(opt.saptamana) ? opt.saptamana : null });
  location.hash = '#/live';
  document.body.classList.add('in-lectie');
  ecranLive();
  try {
    L.flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    L.faza = 'oprit'; toast(mesajMicrofon(e), true); location.hash = '#/acasa'; return;
  }
  pornesteAnaliza();
  try {
    await conecteaza([]);
  } catch (e) {
    oprireTehnica(); L.faza = 'oprit';
    if (e instanceof EroareAuth) { ecranNeautorizat(); return; }
    toast(e.message || 'Nu m-am putut conecta.', true);
    location.hash = '#/acasa';
    return;
  }
  L.faza = 'live';
  L.inceput = Date.now();
  seteazaStare(L.mod === 'test' ? 'Examinatorul începe…' : 'Profesorul începe…', 'vorbeste');
  tineEcranul();
  if ('mediaSession' in navigator && window.MediaMetadata) navigator.mediaSession.metadata = new MediaMetadata({ title: L.mod === 'test' ? 'English speaking test' : 'English lesson', artist: 'English' });
  L.ceas = setInterval(() => {
    const c = $('#ceas'); if (c) c.textContent = durata((Date.now() - L.inceput) / 1000);
    const k = $('#cost'); if (k) k.textContent = dolari(L.cost);
  }, 1000);
  L.salvare = setInterval(salveazaLocal, 20000);
}
function oprireTehnica() {
  try { if (L.pc) L.pc.close(); } catch (e) { /* ignor */ }
  if (L.flux) L.flux.getTracks().forEach((t) => t.stop());
  L.pc = null; L.dc = null; L.flux = null; L.anMic = null; L.anProf = null;
  cancelAnimationFrame(L.rafId);
  clearInterval(L.ceas); clearInterval(L.salvare);
  if (L.wake) { L.wake.release().catch(() => {}); L.wake = null; }
  const s = $('#sunet'); if (s) s.srcObject = null;
}
async function terminaLectia(fortat) {
  if (L.faza !== 'live') return;
  if (!fortat && L.transcript.length && !confirm(L.mod === 'test' ? 'Oprești testul?' : 'Termini lecția?')) return;
  L.oprireCeruta = true;
  L.faza = 'final';
  const durataS = Math.round((Date.now() - L.inceput) / 1000);
  oprireTehnica();
  document.body.classList.remove('in-lectie');
  const sesiune = { transcript: L.transcript, durata_s: durataS, cost_usd: Math.round(L.cost * 10000) / 10000, mod: L.mod, drum: S.drum, raport_test: L.raport };
  if (L.saptamana !== null) sesiune.saptamana = L.saptamana;
  L.faza = 'oprit';
  const minuteNoi = Math.round(durataS / 60);
  $('#main').innerHTML = '<div class="final-test">' + (L.raport && L.raport.cefr ? raportScoruri(L.raport) : inel(Math.min(1, minuteNoi / Math.max(5, setari.obiectiv)), durata(durataS), 'minute')) +
    '<h2>' + (L.mod === 'test' ? (L.raport ? 'Testul s-a încheiat' : 'Test oprit înainte de final') : 'Lecție terminată') + '</h2><p class="text-2">' + (minuteNoi ? '+' + minuteNoi + ' XP · ' : '') + dolari(L.cost) + '</p><p class="text-2" id="mesaj-final">Salvez și pregătesc rezumatul…</p>' +
    '<div class="butoane-col"><a class="buton principal" href="#/acasa">Acasă</a></div></div>';
  if (L.raport || minuteNoi >= 10) confetti();
  history.replaceState(null, '', '#/acasa');
  if (!L.transcript.some((t) => t.de === 'eu')) {
    localStorage.removeItem(CHEIE_LECTIE);
    $('#mesaj-final').textContent = 'Sesiunea a fost prea scurtă ca s-o salvez.';
    return;
  }
  try {
    const r = await api('/api/engleza/lectie', { method: 'POST', body: sesiune });
    localStorage.removeItem(CHEIE_LECTIE);
    $('#mesaj-final').innerHTML = 'Salvat. <a href="#/lectie/' + esc(r.id) + '">Vezi rezumatul</a> (gata în câteva secunde).';
    incarcaStare().catch(() => {});
  } catch (e) {
    salveazaLocal();
    $('#mesaj-final').textContent = 'N-am putut salva acum (' + e.message + '). O salvez singur la următoarea deschidere.';
  }
}
async function trimiteSesiuneaRamasa() {
  let l = null;
  try { l = JSON.parse(localStorage.getItem(CHEIE_LECTIE) || 'null'); } catch (e) { l = null; }
  if (!l || !(l.transcript || []).some((t) => t.de === 'eu')) { localStorage.removeItem(CHEIE_LECTIE); return; }
  try { await api('/api/engleza/lectie', { method: 'POST', body: l }); localStorage.removeItem(CHEIE_LECTIE); toast('Am salvat lecția întreruptă de data trecută.'); } catch (e) { /* data viitoare */ }
}

/* ------------------------------------------------------------ SETĂRI */
function foaieSetari() {
  strat('<h2>Setări</h2>' +
    '<label class="setare"><span>Obiectivul zilnic</span><select id="obiectiv">' + [15, 30, 45, 60, 90, 120].map((m) => '<option value="' + m + '"' + (setari.obiectiv === m ? ' selected' : '') + '>' + m + ' minute pe zi</option>').join('') + '</select></label>' +
    '<label class="setare"><span>Viteza profesorului <b id="viteza-val">' + setari.viteza.toFixed(2) + '×</b></span><input type="range" id="viteza" min="0.8" max="1.2" step="0.05" value="' + setari.viteza + '"></label>' +
    '<label class="setare"><span>Te așteaptă când faci pauze</span><select id="rabdare"><option value="low"' + (setari.rabdare === 'low' ? ' selected' : '') + '>mult (recomandat)</option><option value="medium"' + (setari.rabdare === 'medium' ? ' selected' : '') + '>normal</option></select></label>' +
    '<label class="setare"><span>Microfonul</span><select id="zgomot"><option value="far_field"' + (setari.zgomot === 'far_field' ? ' selected' : '') + '>telefonul în suport sau pe masă</option><option value="near_field"' + (setari.zgomot === 'near_field' ? ' selected' : '') + '>căști cu microfon</option></select></label>' +
    '<label class="setare comutator"><input type="checkbox" id="ecran"' + (setari.ecran ? ' checked' : '') + '><span>Ține ecranul aprins în timpul lecției</span></label>' +
    '<label class="setare comutator"><input type="checkbox" id="subtitrari"' + (setari.subtitrari ? ' checked' : '') + '><span>Arată textul conversației în lecție</span></label>' +
    '<p class="mic">Luna asta: ' + dolari((S.stare && S.stare.cost_luna_usd) || 0) + ' la OpenAI. Modelul: ' + esc((S.stare && S.stare.model) || '') + '.</p>' +
    '<button class="buton principal lat" id="inchide-setari">Gata</button>',
  () => {
    $('#obiectiv').onchange = (e) => { setari.obiectiv = Number(e.target.value); salveazaSetari(); };
    $('#viteza').oninput = (e) => { setari.viteza = Number(e.target.value); $('#viteza-val').textContent = setari.viteza.toFixed(2) + '×'; salveazaSetari(); };
    $('#rabdare').onchange = (e) => { setari.rabdare = e.target.value; salveazaSetari(); };
    $('#zgomot').onchange = (e) => { setari.zgomot = e.target.value; salveazaSetari(); };
    $('#ecran').onchange = (e) => { setari.ecran = e.target.checked; salveazaSetari(); };
    $('#subtitrari').onchange = (e) => { setari.subtitrari = e.target.checked; salveazaSetari(); };
    $('#inchide-setari').onclick = () => { inchideStrat(); if (ruta().v === 'acasa') randeaza(); };
  });
}

/* ------------------------------------------------------------ pornire */
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && L.faza === 'live') tineEcranul(); });
window.addEventListener('pagehide', () => { if (L.faza === 'live') salveazaLocal(); });
window.addEventListener('hashchange', randeaza);
window.addEventListener('resize', () => { if (ruta().v === 'parcurs' && S.parcurs) deseneazaHarta(S.parcurs); });

async function porneste() {
  $('#setari').onclick = foaieSetari;
  const p = citestePerechea();
  if (p) await imperecheaza(p);
  if (!cfg) return ecranNelegat();
  if (!location.hash || location.hash === '#') history.replaceState(null, '', '#/acasa');
  randeaza();
  if (ruta().v !== 'acasa') incarcaStare().catch(() => {});
  trimiteSesiuneaRamasa();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
porneste();

/* English 1.5 (24.11.2026): lecții cu pași și verificare finală, nivel evaluat strict, microfon automat, părerea ta, diagnostic.
   English v2 (23.11.2026): lecții vorbite, conversație scrisă, parcurs pe 20 de săptămâni, teste, cartonașe, progres.
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
const VERSIUNE_APP = '1.8';
let setari = { mod: 'lectie', viteza: 0.95, rabdare: 'low', zgomot: 'auto', ecran: true, subtitrari: false, obiectiv: 30, vorbire: 'buton', corecturi: true };
try { Object.assign(setari, JSON.parse(localStorage.getItem(CHEIE_SETARI) || '{}')); } catch (e) { /* implicite */ }
function salveazaSetari() { try { localStorage.setItem(CHEIE_SETARI, JSON.stringify(setari)); } catch (e) { /* ignor */ } }
// 1.5: microfonul se alege singur (recunosc căștile); „telefonul pe masă” era doar valoarea implicită veche
if (!setari.v15) { setari.zgomot = 'auto'; setari.v15 = true; salveazaSetari(); }

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
  telefon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  grafic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20h18M6 16v-4M11 16V8M16 16v-6M20 6l-5 3-4-3-6 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bani: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  alerta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20zM12 10v4M12 17v.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  microfon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  oameni: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="9" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2 20a6 6 0 0 1 12 0M14 20a4.5 4.5 0 0 1 8 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  om: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 21a8 8 0 0 1 16 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  avion: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 13l8-2 5-8 2 1-2 8 6 2-1 2-6-1-3 6-2-1 1-5-8 1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
};
const ORE_CEFR = { A1: 90, 'A1+': 140, A2: 190, 'A2+': 280, B1: 375, 'B1+': 460, B2: 550, 'B2+': 650, C1: 750, 'C1+': 870, C2: 1000 };
const ORDINE_CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
function nivelUrmator(n) { const i = ORDINE_CEFR.indexOf(String(n || '').replace('+', '')); return i >= 0 && i < ORDINE_CEFR.length - 1 ? ORDINE_CEFR[i + 1] : 'B1'; }
function tintaCurenta(s) { const t = setari.tinta; const n = String((s && s.nivel) || '').replace(/\s/g, '').toUpperCase(); if (t && (!ORE_CEFR[n] || ORE_CEFR[t] > ORE_CEFR[n])) return t; return nivelUrmator(n || 'A2'); }
function estimare(s) {
  const niv = String((s && s.nivel) || '').replace(/\s/g, '').toUpperCase();
  const tinta = tintaCurenta(s);
  if (!ORE_CEFR[niv] || !ORE_CEFR[tinta]) return null;
  const ore = ORE_CEFR[tinta] - ORE_CEFR[niv];
  const real = ((s.minute_14z || 0) / 2) / 60;
  const plan = ((setari.obiectiv || 30) * 6) / 60;
  const ritm = real >= 1 ? real : plan;
  const sapt = ore / ritm;
  return { niv, tinta, ore, ritm, sapt, data: new Date(Date.now() + sapt * 7 * 864e5), dinPlan: real < 1 };
}
function cardTinta(s) {
  const e = estimare(s);
  if (!e) return '';
  const luna = e.data.toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' });
  return '<section class="card tinta" id="card-tinta"><div class="rand"><div><span class="eticheta">Ținta ta</span><h2>' + esc(e.tinta) + ' <small>de la ' + esc(e.niv) + '</small></h2></div>' +
    '<div class="tinta-data"><b>' + esc(luna) + '</b><span>estimat</span></div></div>' +
    '<p class="mic">≈ ' + Math.round(e.ore) + ' de ore de exercițiu, la ' + (Math.round(e.ritm * 10) / 10).toString().replace('.', ',') + ' ore pe săptămână' + (e.dinPlan ? ' (obiectivul tău zilnic, 6 zile)' : ' (ritmul tău din ultimele două săptămâni)') + '. Estimare orientativă, după orele de studiu ale Cambridge; o poți schimba din Setări.</p></section>';
}
function planulZilei(s) {
  const a = s.azi || {};
  const ob = setari.obiectiv || 30;
  const it = [
    { ok: (a.minute || 0) >= ob, t: 'Vorbește ' + ob + ' de minute', d: (a.minute || 0) + ' din ' + ob + ' azi', act: 'start' },
    { ok: (a.de_repetat || 0) === 0 || (a.carduri || 0) >= 10, t: 'Repetă cartonașele', d: a.de_repetat ? a.de_repetat + ' de repetat' : (a.carduri ? a.carduri + ' repetate azi' : 'nimic de repetat'), href: '#/carduri' },
    { ok: (a.teste || 0) >= 1, t: 'Un test scurt', d: a.teste ? (a.teste === 1 ? 'un test azi' : a.teste + ' teste azi') : 'trei minute', href: '#/test/rapid' },
  ];
  const gata = it.filter((x) => x.ok).length;
  return '<section class="card plan"><div class="rand"><h3>Planul de azi</h3><span class="mic">' + gata + ' din ' + it.length + '</span></div><ul class="plan-lista">' +
    it.map((x, i) => '<li class="' + (x.ok ? 'facut' : '') + '" data-plan="' + i + '"><span class="plan-bifa">' + (x.ok ? ICON.bifa : '') + '</span><span class="plan-text"><b>' + esc(x.t) + '</b><small>' + esc(x.d) + '</small></span></li>').join('') +
    '</ul></section>';
}
function legaPlanul(s) {
  const ob = setari.obiectiv || 30; void ob;
  $$('[data-plan]').forEach((li) => {
    li.onclick = () => {
      const i = Number(li.dataset.plan);
      if (i === 0) pornesteLectia({ mod: setari.mod === 'test' ? 'lectie' : setari.mod });
      else if (i === 1) location.hash = '#/carduri';
      else location.hash = '#/test/rapid';
    };
  });
}
function ritmFataDePlan(s) {
  const d = (s.saptamana || 1) - (s.plan_saptamana || 1);
  if (d > 0) return { text: 'în avans cu ' + d + (d === 1 ? ' unitate' : ' unități') + ' față de plan', clasa: 'bine' };
  if (d < 0) return { text: 'în urmă cu ' + (-d) + (d === -1 ? ' unitate' : ' unități') + ' față de plan', clasa: 'rau' };
  return { text: 'exact pe plan', clasa: '' };
}
function cardUnitate(s) {
  const u = s.unitate;
  if (!u) return '';
  const pr = s.praguri || { vorbit: 45, test: 70, fraze: 10, scris: 10 };
  const lu = s.lectii_unitate || [];
  const testul = { ok: u.test >= pr.test, t: 'Testul pe temă', d: u.test ? 'cel mai bun: ' + u.test + '% (minim ' + pr.test + '%)' : 'minim ' + pr.test + '%', act: 'test' };
  const frazele = { ok: u.fraze >= pr.fraze, t: 'Frazele unității', d: u.fraze >= pr.fraze ? 'ascultate' : 'ascultă lista o dată, cap-coadă', act: 'fraze' };
  const it = lu.length ? lu.map((x) => ({ ok: x.facuta, t: 'Lecția ' + x.index + ' · ' + x.titlu, d: progresLectie(x), act: 'lectie:' + x.id })).concat([testul, frazele]) : [
    { ok: u.vorbit_min >= pr.vorbit, t: 'Vorbește pe tema unității', d: u.vorbit_min + ' din ' + pr.vorbit + ' de minute', act: 'vorbit' },
    testul, frazele,
    { ok: u.scris >= pr.scris, t: 'Scrie cu profesorul', d: u.scris + ' din ' + pr.scris + ' mesaje', act: 'scris' },
  ];
  if (u.checkpoint) it.push({ ok: !!u.examen, t: 'Testul vorbit de checkpoint', d: u.examen ? 'făcut: ' + u.examen.cefr : '10 minute, obligatoriu ca să treci mai departe', act: 'examen' });
  const r = ritmFataDePlan(s);
  return '<section class="card unitate-card"><div class="rand"><div><span class="eticheta">Unitatea ' + u.n + ' din 20' + (u.checkpoint ? ' · checkpoint' : '') + '</span><h3>Ca s-o termini</h3></div>' +
    inel(u.procent / 100, u.procent + '%', 'gata') + '</div><ul class="plan-lista">' +
    it.map((x) => '<li class="' + (x.ok ? 'facut' : '') + '" data-unit="' + x.act + '"><span class="plan-bifa">' + (x.ok ? ICON.bifa : '') + '</span><span class="plan-text"><b>' + esc(x.t) + '</b><small>' + esc(x.d) + '</small></span></li>').join('') +
    '</ul><p class="mic ' + r.clasa + '">' + (lu.length ? 'Treci la unitatea următoare după cele 5 lecții și testul pe temă (minim ' + pr.test + '%)' : 'Treci la unitatea următoare când ajungi la 85%') + (u.checkpoint ? ' și testul vorbit' : '') + '. Acum ești ' + esc(r.text) + '.</p></section>';
}
function legaUnitatea() {
  $$('[data-unit]').forEach((li) => {
    li.onclick = () => {
      const a = li.dataset.unit;
      if (a.startsWith('lectie:')) foaieLectie(((S.stare && S.stare.lectii_unitate) || []).find((x) => x.id === a.slice(7)));
      else if (a === 'vorbit') pornesteLectia({ mod: 'lectie' });
      else if (a === 'test') location.hash = '#/test/tema';
      else if (a === 'fraze') location.hash = '#/fraze';
      else if (a === 'scris') location.hash = '#/scris';
      else if (a === 'examen') pornesteLectia({ mod: 'test' });
    };
  });
}
const ZILE_SCURT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
function zileleTale(s) {
  const z = (s.zile || []).slice(-7);
  if (!z.length) return '';
  const ex = z.filter((x) => x.exersat).length;
  return '<section class="card zile-card"><div class="rand"><h3>Ultimele 7 zile</h3><span class="mic">ai exersat ' + ex + ' din 7</span></div><div class="zile-sir">' +
    z.map((x) => { const d = new Date(x.zi + 'T12:00:00'); const cls = x.exersat ? 'exersat' : x.deschis ? 'deschis' : 'gol';
      const tit = d.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'short' }) + ': ' + (x.exersat ? (x.minute ? x.minute + ' min vorbit' : 'ai exersat') + (x.teste ? ', ' + x.teste + ' test' : '') + (x.carduri ? ', ' + x.carduri + ' cartonașe' : '') : x.deschis ? 'doar ai deschis aplicația' : 'n-ai folosit aplicația');
      return '<div class="zi-punct ' + cls + '" title="' + esc(tit) + '"><span></span><small>' + ZILE_SCURT[d.getDay()] + '</small></div>'; }).join('') +
    '</div><div class="legenda-zile"><span class="cel exersat"></span><span class="mic">ai exersat</span><span class="cel deschis"></span><span class="mic">doar ai intrat</span><span class="cel"></span><span class="mic">n-ai folosit-o</span></div></section>';
}
/* ------------------------------------------------------------ LECȚIILE: 100, câte 5 pe unitate, construite după testul de nivel */
function nrLectie(l) { return (l.unitate - 1) * 5 + l.index; }
function deLectii(n) { n = n || 0; return n === 1 ? 'o lecție' : n + (n % 100 >= 20 || n % 100 === 0 ? ' de lecții' : ' lecții'); }
function nivelCurs(n) {
  const v = /([ABC][12]\+?) when speaking/.exec(n || ''), w = /([ABC][12]\+?) in the written/.exec(n || '');
  if (v && w) return v[1] === w[1] ? v[1] : v[1] + ' vorbit, ' + w[1] + ' scris';
  return (v && v[1]) || (w && w[1]) || (/[ABC][12]\+?/.exec(n || '') || [''])[0];
}
function facute(n) { return (n || 0) + ((n || 0) === 1 ? ' făcută' : ' făcute'); }
function pragLectie() { const c = (S.stare && S.stare.curriculum) || {}; return { min: c.prag_minute || 10, mes: c.prag_mesaje || 8, verif: c.prag_verificare || 4 }; }
function progresLectie(l) {
  const p = pragLectie();
  if (l.are_verificare) {
    if (l.facuta) return 'trecută' + (l.verif_total ? ': ' + l.verif_corecte + ' din ' + l.verif_total + ' la verificare' : '');
    if (l.verif_total) return l.verif_corecte + ' din ' + l.verif_total + ' la verificare · îți trebuie ' + p.verif;
    if (l.minute || l.mesaje) return 'începută · se bifează când treci verificarea finală';
    return '15–20 de minute · se bifează când treci verificarea finală (' + p.verif + ' din 5)';
  }
  if (l.facuta) return 'făcută';
  if (l.minute) return l.minute + ' din ' + p.min + ' minute';
  if (l.mesaje) return l.mesaje + ' din ' + p.mes + ' mesaje scrise';
  return '15–20 de minute de vorbit';
}
function lectiiInConstructie(s) {
  const c = s.curriculum || {};
  return !c.are_lectii && (c.stare === 'se_genereaza' || (s.are_nivel && c.stare !== 'eroare'));
}
function cardLectiaDeAzi(s) {
  const c = s.curriculum || {};
  if (!c.are_lectii) {
    if (lectiiInConstructie(s)) {
      return '<section class="card lectia-azi se-face"><span class="eticheta">Lecțiile tale</span><h2>Îți construiesc cele 100 de lecții…</h2>' +
        '<p class="text-2">Pe nivelul tău, câte 5 pe fiecare unitate. Durează un minut-două; pagina se actualizează singură.</p><div class="bara-asteptare"><span></span></div></section>';
    }
    if (c.stare === 'eroare') {
      return '<section class="card lectia-azi"><span class="eticheta">Lecțiile tale</span><h2>N-am reușit să construiesc lecțiile</h2>' +
        '<p class="text-2">Se mai întâmplă la OpenAI. Mai încerc o dată?</p><button class="buton principal lat" id="refa-lectii">' + ICON.fulger + ' Construiește lecțiile</button></section>';
    }
    return '';
  }
  const u = s.unitate, lu = s.lectii_unitate || [], l = s.lectia;
  const pr = s.praguri || { test: 70 };
  if (u && !u.gata && lu.length && lu.every((x) => x.facuta)) {
    const pasi = [];
    if ((u.test || 0) < pr.test) pasi.push('<button class="pas" id="fin-test"><b>' + ICON.fulger + '</b><span><strong>Testul pe tema unității</strong>' + (u.test ? 'ai ' + u.test + '%, îți trebuie ' + pr.test + '%' : 'minim ' + pr.test + '% · cam 3 minute') + '</span></button>');
    if (u.checkpoint && !u.examen) pasi.push('<button class="pas" id="fin-examen"><b>' + ICON.trofeu + '</b><span><strong>Testul vorbit de checkpoint</strong>10 minute, cu nivel și scor</span></button>');
    return '<section class="card lectia-azi"><span class="eticheta">Unitatea ' + u.n + ' · toate cele 5 lecții făcute</span><h2>Încă un pas ca s-o închei</h2>' + pasi.join('') +
      (l ? '<button class="buton-text" id="sari-inainte">sau mergi mai departe: lecția ' + nrLectie(l) + ', ' + esc(l.titlu) + '</button>' : '') + '</section>';
  }
  if (!l) {
    return '<section class="card lectia-azi"><span class="eticheta">Lecțiile tale</span><h2>Ai făcut toate cele ' + (c.total || 100) + ' de lecții</h2>' +
      '<p class="text-2">Fă testul vorbit ca să vezi unde ai ajuns. Din Setări îți poți reface lecțiile pe noul nivel.</p></section>';
  }
  const p = pragLectie();
  const procent = l.are_verificare ? (l.verif_total ? Math.min(1, l.verif_corecte / Math.max(1, p.verif)) : 0) : Math.min(1, Math.max((l.minute || 0) / p.min, (l.mesaje || 0) / p.mes));
  const vocab = (l.vocabular || []).slice(0, 6);
  return '<section class="card lectia-azi"><div class="rand"><span class="eticheta">Lecția de azi · unitatea ' + l.unitate + ' · ' + l.index + ' din 5</span>' +
    '<span class="lectia-nr">' + nrLectie(l) + '<small> din ' + (c.total || 100) + '</small></span></div>' +
    '<h2>' + esc(l.titlu) + '</h2><p class="obiectiv">' + esc(l.obiectiv) + '</p>' +
    (l.gramatica ? '<p class="gram">' + esc(l.gramatica) + '</p>' : '') +
    (vocab.length ? '<div class="chips">' + vocab.map((v) => '<span class="chip">' + esc(v) + '</span>').join('') + '</div>' : '') +
    (procent > 0 ? '<div class="lectie-bara"><span data-w="' + Math.round(procent * 100) + '"></span></div>' : '') + '<p class="mic">' + esc(progresLectie(l)) + (l.are_verificare || procent === 0 ? '' : ' · se bifează la ' + p.min + ' minute de vorbit') + '</p>' +
    '<div class="butoane"><button class="buton principal" id="lectia-start">' + ICON.mic + ' Începe lecția</button><button class="buton" id="lectia-detalii">' + ICON.carte + ' Ce înveți</button></div>' +
    '<p class="mic centru contor-lectii">' + (c.facute || 0) + ' din ' + deLectii(c.total || 100) + ' ' + ((c.facute || 0) === 1 ? 'făcută' : 'făcute') + '</p></section>';
}
function legaLectiaDeAzi(s) {
  const l = s.lectia;
  const b = $('#lectia-start'); if (b && l) b.onclick = () => pornesteLectia({ mod: 'lectie', lectie: l.id, titlu: l.titlu });
  const d = $('#lectia-detalii'); if (d && l) d.onclick = () => foaieLectie(l);
  const si = $('#sari-inainte'); if (si && l) si.onclick = () => foaieLectie(l);
  const ft = $('#fin-test'); if (ft) ft.onclick = () => { location.hash = '#/test/tema'; };
  const fe = $('#fin-examen'); if (fe) fe.onclick = () => pornesteLectia({ mod: 'test' });
  const rf = $('#refa-lectii');
  if (rf) rf.onclick = async () => {
    rf.disabled = true;
    try { await api('/api/engleza/curriculum/genereaza', { method: 'POST', body: {} }); toast('Am pornit. Lecțiile apar în 1–2 minute.'); await incarcaStare(); vedereAcasa(++S.randare); } catch (e) { toast(e.message, true); rf.disabled = false; }
  };
  clearTimeout(S.timerLectii);
  if (lectiiInConstructie(s)) {
    S.timerLectii = setTimeout(async () => {
      if (ruta().v !== 'acasa' || L.faza !== 'oprit') return;
      try { await incarcaStare(); } catch (e) { /* data viitoare */ }
      if (ruta().v === 'acasa' && L.faza === 'oprit') vedereAcasa(++S.randare);
    }, 12000);
  }
}
function foaieLectie(l) {
  if (!l) return;
  const c = (S.stare && S.stare.curriculum) || {};
  const p = pragLectie();
  const pasi = c.pasi || [{ nume: 'Încălzire', minute: 2 }, { nume: 'Ce înveți', minute: 3 }, { nume: 'Exersezi', minute: 5 }, { nume: 'Situația reală', minute: 5 }, { nume: 'Verificarea', minute: 3 }];
  const desc = [l.incalzire, l.gramatica, (l.exercitii || []).length ? l.exercitii.length + ' exerciții scurte, pe rând' : '', l.situatie || l.sarcina,
    (l.verificare || []).length + ' sarcini, fără ajutor; treci cu ' + p.verif];
  strat('<span class="eticheta">Unitatea ' + l.unitate + ' · lecția ' + l.index + ' din 5 · ' + nrLectie(l) + ' din ' + (c.total || 100) + '</span>' +
    '<h2>' + esc(l.titlu) + '</h2>' +
    (l.facuta ? '<p class="bine stare-lectie">' + ICON.bifa + ' ' + esc(progresLectie(l)) + '. O poți relua oricând.</p>' : (l.minute || l.mesaje || l.verif_total ? '<p class="mic">' + esc(progresLectie(l)) + '</p>' : '')) +
    '<p class="obiectiv">' + esc(l.obiectiv) + '</p>' +
    (l.gramatica ? '<h3 class="sub-foaie">Ce înveți</h3><p class="text-2">' + esc(l.gramatica) + '</p>' + (l.explicatie_ro ? '<p>' + esc(l.explicatie_ro) + '</p>' : '') : '') +
    ((l.exemple || []).length ? '<ul class="fraze-lectie">' + l.exemple.map((f, i) => '<li><span>' + esc(f) + '</span><button class="buton-rotund mic" data-exemplu="' + i + '" aria-label="Ascultă exemplul">' + ICON.difuzor + '</button></li>').join('') + '</ul>' : '') +
    (l.are_verificare ? '<h3 class="sub-foaie">Cum decurge</h3><ol class="pasi-foaie">' + pasi.map((x, i) => '<li><b>' + esc(x.nume) + '</b> <span class="mic">' + x.minute + ' min</span>' + (desc[i] ? '<small>' + esc(desc[i]) + '</small>' : '') + '</li>').join('') + '</ol>'
      : (l.sarcina ? '<h3 class="sub-foaie">Ce faci în lecție</h3><p class="text-2">' + esc(l.sarcina) + '</p>' : '')) +
    ((l.vocabular || []).length ? '<h3 class="sub-foaie">Cuvinte</h3><div class="chips">' + l.vocabular.map((v) => '<span class="chip">' + esc(v) + '</span>').join('') + '</div>' : '') +
    ((l.fraze || []).length ? '<h3 class="sub-foaie">Fraze</h3><ul class="fraze-lectie">' + l.fraze.map((f, i) => '<li><span>' + esc(f) + '</span><button class="buton-rotund mic" data-fraza="' + i + '" aria-label="Ascultă fraza">' + ICON.difuzor + '</button></li>').join('') + '</ul>' : '') +
    (l.are_verificare ? '<h3 class="sub-foaie">Verificarea finală · minim ' + p.verif + ' din ' + l.verificare.length + '</h3><ol class="verif-foaie">' + l.verificare.map((z) => '<li>' + esc(z.ro || z.cerinta) + '</li>').join('') + '</ol>' : '') +
    '<div class="butoane-col"><button class="buton principal" id="fl-vorbit">' + ICON.mic + ' Lecția vorbită (15–20 min)</button>' +
    (l.are_verificare ? '<button class="buton" id="fl-verif">' + ICON.fulger + ' Doar verificarea (2 min)</button>' : '') +
    '<button class="buton" id="fl-scris">' + ICON.creion + ' Fă-o în scris</button></div>',
  () => {
    $('#fl-vorbit').onclick = () => { inchideStrat(); pornesteLectia({ mod: 'lectie', lectie: l.id, titlu: l.titlu }); };
    const fv = $('#fl-verif'); if (fv) fv.onclick = () => { inchideStrat(); location.hash = '#/test/verificare-' + l.id; };
    $('#fl-scris').onclick = () => {
      inchideStrat();
      try { sessionStorage.setItem('engleza.scris.lectie', JSON.stringify({ id: l.id, titlu: l.titlu })); } catch (e) { /* ignor */ }
      if (ruta().v === 'scris') randeaza(); else location.hash = '#/scris';
    };
    $$('[data-fraza]').forEach((b) => { b.onclick = () => reda(l.fraze[Number(b.dataset.fraza)], b); });
    $$('[data-exemplu]').forEach((b) => { b.onclick = () => reda(l.exemple[Number(b.dataset.exemplu)], b); });
  });
  const st = $('#strat');
  const vechi = st.onclick;
  st.onclick = (e) => { if (e.target === st) { vechi(e); if (ruta().v === 'saptamana') history.replaceState(null, '', '#/parcurs'); } };
}
function grilaLectii(cur) {
  if (!cur || !cur.are_lectii) return '';
  const toate = [];
  (cur.unitati || []).forEach((u) => (u.lectii || []).forEach((l) => toate.push(l)));
  const azi = toate.find((l) => !l.facuta);
  return '<div class="grila-lectii" role="list" aria-label="Cele ' + toate.length + ' de lecții, pe unități">' +
    toate.map((l) => '<button role="listitem" class="' + (l.facuta ? 'facuta' : '') + (azi && l.id === azi.id ? ' azi' : '') + '" data-gl="' + esc(l.id) + '" aria-label="' + esc('Lecția ' + nrLectie(l) + ', unitatea ' + l.unitate + ': ' + l.titlu + (l.facuta ? ', făcută' : '')) + '" title="' + esc(nrLectie(l) + '. ' + l.titlu) + '"></button>').join('') +
    '</div><div class="grila-axa"><span>unitatea 1</span><span>fiecare coloană = o unitate, 5 lecții</span><span>20</span></div>' +
    '<div class="legenda-zile"><span class="cel exersat"></span><span class="mic">făcută</span><span class="cel azi"></span><span class="mic">urmează</span><span class="cel"></span><span class="mic">încă nu</span></div>';
}
function legaGrilaLectii(cur) {
  $$('[data-gl]').forEach((b) => {
    b.onclick = () => {
      for (const u of cur.unitati || []) { const l = (u.lectii || []).find((x) => x.id === b.dataset.gl); if (l) return foaieLectie(l); }
    };
  });
}

function cardNivelDeInceput() {
  return '<section class="card inceput"><span class="eticheta">Primul pas</span><h2>Află-ți nivelul</h2>' +
    '<p class="text-2">Programul tău a pornit azi. Începe cu testul de nivel: după el îți construiesc 100 de lecții pe nivelul tău, câte 5 pe fiecare din cele 20 de unități.</p>' +
    '<a class="pas" href="#/test/nivel"><b>1</b><span><strong>Test scris</strong>24 de întrebări, de la A2 la C1 · cam 10 minute</span></a>' +
    '<button class="pas" id="pas-vorbit"><b>2</b><span><strong>Test vorbit</strong>10 minute cu examinatorul · fluență, gramatică, vocabular, pronunție</span></button></section>';
}

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

/* ------------------------------------------------------------ microfonul, părerea ta, evaluarea vorbită (1.5) */
function infoMicrofon(flux) {
  const t = flux && flux.getAudioTracks()[0];
  let st = {};
  try { st = (t && t.getSettings && t.getSettings()) || {}; } catch (e) { st = {}; }
  let nativ = null;
  try { if (window.Aplicatie && window.Aplicatie.audio) nativ = JSON.parse(window.Aplicatie.audio()); } catch (e) { nativ = null; }
  const eticheta = (t && t.label) || '';
  const casti = /bluetooth|headset|hands-?free|buds|airpods|baseus|\bsco\b|earphone|wired|căști/i.test(eticheta) || !!(nativ && (nativ.bt || nativ.fir));
  return { eticheta: eticheta.slice(0, 120), casti, rata: st.sampleRate || null, canale: st.channelCount || null,
    ec: st.echoCancellation, ns: st.noiseSuppression, agc: st.autoGainControl, nativ };
}
const ETICHETE_FEEDBACK = ['M-a auzit greșit', 'M-a corectat aiurea', 'Prea multe repetări', 'Prea ușor', 'Prea greu', 'Prea lung', 'A vorbit prea mult', 'A mers bine'];
function blocFeedback(titluF) {
  return '<section class="card feedback-bloc"><h3>' + esc(titluF || 'Cum a fost?') + '</h3><p class="mic">Alege ce se potrivește. Le citesc și repar aplicația pe baza lor.</p>' +
    '<div class="chips alege">' + ETICHETE_FEEDBACK.map((e) => '<button class="chip" data-fb="' + esc(e) + '">' + esc(e) + '</button>').join('') + '</div>' +
    '<textarea id="fb-text" rows="2" placeholder="Altceva? (opțional; poți dicta cu tastatura)"></textarea><button class="buton lat" id="fb-trimite" disabled>Trimite</button></section>';
}
function legaFeedback(context) {
  const tr = $('#fb-trimite');
  if (!tr) return;
  const ales = new Set();
  const act = () => { tr.disabled = !ales.size && !$('#fb-text').value.trim(); };
  $$('[data-fb]').forEach((b) => { b.onclick = () => { const e = b.dataset.fb; if (ales.has(e)) ales.delete(e); else ales.add(e); b.classList.toggle('ales', ales.has(e)); act(); }; });
  $('#fb-text').oninput = act;
  tr.onclick = async () => {
    tr.disabled = true; tr.textContent = 'Trimit…';
    const c = typeof context === 'function' ? context() : (context || {});
    try {
      await api('/api/engleza/feedback', { method: 'POST', body: Object.assign({ etichete: [...ales], text: $('#fb-text').value.trim(),
        nota: ales.has('A mers bine') && ales.size === 1 ? 1 : (ales.size || $('#fb-text').value.trim() ? -1 : 0), versiune: VERSIUNE_APP, ecran: ruta().v }, c) });
      const s = tr.closest('.feedback-bloc'); if (s) s.innerHTML = '<p class="bine">' + ICON.bifa + ' Mulțumesc! Le citesc și repar.</p>';
    } catch (e) {
      tr.disabled = false; tr.textContent = 'Trimite';
      if (e instanceof EroareAuth) return ecranNeautorizat();
      toast(e.message, true);
    }
  };
}
function foaieFeedback() {
  strat('<h2>Spune-mi ce să îmbunătățesc</h2><p class="text-2">Orice: ce nu merge, ce te enervează, ce ți-ar plăcea. Fiecare părere ajunge pe Mac, cu ecranul și versiunea, iar eu o citesc înainte să lucrez la aplicație.</p>' +
    blocFeedback('Ce s-a întâmplat?') + '<button class="buton lat" id="fb-inchide">Închide</button>', () => {
    legaFeedback({ ecran: 'setari' });
    $('#fb-inchide').onclick = inchideStrat;
  });
}
const PROPOZITIE_MIC = "I'm walking to the office and checking the results of our campaigns.";
function cuvinteMic(t) { return String(t || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean); }
function potrivireMic(asteptat, auzit) {
  const a = cuvinteMic(asteptat), b = cuvinteMic(auzit);
  const d = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]);
  const prinse = new Set();
  for (let i = a.length, j = b.length; i > 0 && j > 0;) {
    if (a[i - 1] === b[j - 1]) { prinse.add(i - 1); i--; j--; } else if (d[i - 1][j] >= d[i][j - 1]) i--; else j--;
  }
  const orig = String(asteptat || '').split(/\s+/).filter(Boolean);
  return { scor: a.length ? Math.round(100 * d[a.length][b.length] / Math.max(a.length, b.length)) : 0,
    cuvinte: a.map((w, i) => ({ w: orig.length === a.length ? orig[i] : w, ok: prinse.has(i) })) };
}
function foaieTestMicrofon() {
  strat('<h2>Testul de microfon</h2><p class="text-2">Pune căștile cum le porți de obicei (sau ține telefonul cum îl ții în lecție) și citește normal, cu voce tare:</p>' +
    '<p class="propozitie">„' + esc(PROPOZITIE_MIC) + '”</p><button class="mic-mare" id="tm-start">' + ICON.mic + '<span>Apasă și citește</span></button>' +
    '<div id="tm-rez" class="tm-rez"></div><button class="buton lat" id="tm-inchide">Închide</button>', () => {
    const b = $('#tm-start');
    let inreg = false, maxim = 0, timer = 0, ac = null, info = null;
    $('#tm-inchide').onclick = () => { clearInterval(timer); if (inreg) Mic.opreste(); inchideStrat(); };
    b.onclick = async () => {
      if (!inreg) {
        try { await Mic.porneste(); } catch (e) { toast(mesajMicrofon(e), true); return; }
        info = infoMicrofon(Mic.flux);
        maxim = 0;
        try {
          ac = new (window.AudioContext || window.webkitAudioContext)();
          const an = ac.createAnalyser(); an.fftSize = 1024; ac.createMediaStreamSource(Mic.flux).connect(an);
          const buf = new Uint8Array(an.fftSize);
          timer = setInterval(() => { an.getByteTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; } maxim = Math.max(maxim, Math.sqrt(s / buf.length)); }, 100);
        } catch (e) { ac = null; }
        inreg = true; b.classList.add('inregistreaza'); b.querySelector('span').textContent = 'Te ascult… apasă când termini';
        return;
      }
      inreg = false; clearInterval(timer); if (ac) ac.close().catch(() => {});
      b.classList.remove('inregistreaza'); b.disabled = true; b.querySelector('span').textContent = 'Verific…';
      try {
        const blob = await Mic.opreste();
        const auzit = blob ? await apiTranscrieEngleza(blob) : '';
        const p = potrivireMic(PROPOZITIE_MIC, auzit);
        const volum = maxim < 0.02 ? 'foarte încet' : maxim < 0.06 ? 'încet' : maxim > 0.6 ? 'prea tare, distorsionat' : 'bun';
        const verdict = p.scor >= 90 ? 'Te aude clar.' : p.scor >= 70 ? 'Te aude, dar pierde cuvinte.' : 'Te aude prost.';
        const sfat = p.scor >= 90 ? 'Microfonul e în regulă: dacă profesorul tot greșește, apasă „Nu asta am zis” în lecție.'
          : (info && info.casti ? 'Fă testul încă o dată fără căștile Bluetooth (cu microfonul telefonului, ținut la 20–30 cm de gură) și compară scorurile. Căștile ieftine trimit în apeluri un sunet mai slab decât la muzică.'
            : 'Ține telefonul mai aproape de gură sau încearcă cu căștile cu fir; în mașină, telefonul în suport, nu în buzunar.');
        $('#tm-rez').innerHTML = '<div class="tm-scor ' + (p.scor >= 90 ? 'bine' : p.scor >= 70 ? '' : 'rau') + '"><b>' + p.scor + '%</b><span>' + verdict + '</span></div>' +
          '<p class="tm-cuvinte">' + p.cuvinte.map((c) => '<span class="' + (c.ok ? '' : 'lipsa') + '">' + esc(c.w) + '</span>').join(' ') + '</p>' +
          '<p class="mic">Am auzit: „' + esc(auzit || '…') + '”</p><p class="mic">Volum: ' + volum + (info && info.eticheta ? ' · ' + esc(info.eticheta) : '') + (info && info.casti ? ' · căști' : '') + '</p><p class="text-2">' + esc(sfat) + '</p>';
        api('/api/engleza/feedback', { method: 'POST', body: { ecran: 'test_microfon', versiune: VERSIUNE_APP, etichete: ['test_microfon'],
          date: { scor: p.scor, auzit: auzit.slice(0, 300), volum: Math.round(maxim * 1000) / 1000, microfon: info } } }).catch(() => {});
      } catch (e) {
        if (e instanceof EroareAuth) return ecranNeautorizat();
        toast(e.message, true);
      }
      b.disabled = false; b.querySelector('span').textContent = 'Mai încearcă o dată';
    };
  });
}
function blocEvaluare(ev) {
  const nume = { gramatica: 'Gramatică', vocabular: 'Vocabular', fluenta: 'Fluență', coerenta: 'Coerență', interactiune: 'Conversație' };
  const cr = ev.criterii || {};
  return '<div class="evaluare"><p class="text-2">Evaluat strict, pe tot ce ai spus în test:</p><div class="criterii">' +
    Object.keys(nume).filter((k) => cr[k]).map((k) => '<div class="criteriu"><span>' + nume[k] + '</span><b>' + esc(cr[k]) + '</b></div>').join('') + '</div>' +
    (ev.explicatie_ro ? '<p>' + esc(ev.explicatie_ro) + '</p>' : '') +
    (ev.puncte_forte_ro ? '<p class="bine">' + esc(ev.puncte_forte_ro) + '</p>' : '') +
    ((ev.dovezi || []).length ? '<h3 class="sub-foaie">Ce te ține pe loc</h3><ul class="greseli">' + ev.dovezi.map((d) => '<li><s>' + esc(d.citat) + '</s><b>' + esc(d.corect) + '</b>' + (d.problema_ro ? '<small>' + esc(d.problema_ro) + '</small>' : '') + '</li>').join('') + '</ul>' : '') +
    (ev.pentru_nivelul_urmator_ro ? '<h3 class="sub-foaie">Pentru nivelul următor</h3><p class="text-2">' + esc(ev.pentru_nivelul_urmator_ro) + '</p>' : '') + '</div>';
}
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
  } catch (e) {
    toast(cfg ? 'Browserul ăsta e deja legat de Mac; linkul nu mai trebuie.' : e.message, !cfg);
    return !!cfg;
  }
}
function ecranNelegat() {
  $('#main').innerHTML = '<div class="gol-mare"><div class="gol-icon">' + ICON.chat + '</div><h2>Aplicația nu e legată de Mac</h2><p class="text-2">Lipește aici linkul de împerechere primit de la Claude (ține apăsat pe link, Copiază, apoi lipește). Linkul merge o singură dată.</p>' +
    '<textarea id="link-lipit" class="lipire" placeholder="Lipește linkul aici"></textarea><button class="buton principal lat" id="leaga">Leagă de Mac</button></div>';
  $('#leaga').onclick = async () => {
    const m = ($('#link-lipit').value || '').match(/p=([A-Za-z0-9_-]{20,})/);
    if (!m) { toast('Nu găsesc un link de împerechere în textul lipit.', true); return; }
    history.replaceState(null, '', location.pathname + '#p=' + m[1]);
    const p = citestePerechea();
    if (p && await imperecheaza(p)) { history.replaceState(null, '', location.pathname + '#/acasa'); randeaza(); incarcaStare().catch(() => {}); }
  };
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
  const tab = ({ saptamana: 'parcurs', test: 'exerseaza', carduri: 'exerseaza', scris: 'exerseaza', simulari: 'exerseaza', fraze: 'exerseaza', lectie: 'istoric', live: '' })[v];
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
    else if (v === 'simulari') await vedereSimulari(id);
    else if (v === 'fraze') await vedereFraze(id, arg);
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
  const prog = Math.min(1, ((s.unitati_gata || 0) + ((s.unitate && s.unitate.procent) || 0) / 100) / 20);
  let h = '<section class="erou">' +
    '<div class="erou-sus"><div class="erou-text"><p class="salut">' + salut() + ', Andrei</p>' +
    '<h2>' + (s.saptamana >= 1 && s.saptamana <= 20 ? 'Unitatea ' + s.saptamana + ' · ' + esc(s.faza_nume || '') : 'Englezul tău') + '</h2>' +
    '<p class="tema">' + esc(s.tema || 'Free conversation') + '</p></div>' +
    '<div class="nivel"><b>' + esc(s.nivel || '?') + '</b><span>nivel</span></div></div>' +
    '<div class="erou-jos">' + inel(procentAzi, (s.minute_azi || 0) + ' min', 'din ' + (setari.obiectiv || 30) + ' azi') +
    '<div class="erou-cifre"><div class="cifra-erou' + ((s.serie || 0) > 0 ? ' aprinsa' : '') + '">' + ICON.flacara + '<b>' + (s.serie || 0) + '</b><span>' + ((s.serie || 0) === 1 ? 'zi la rând' : 'zile la rând') + '</span></div>' +
    '<div class="cifra-erou xp"><b>' + new Intl.NumberFormat('ro-RO').format(s.xp || 0) + '</b><span>XP</span></div>' +
    '<div class="bara-program" role="img" aria-label="' + Math.round(prog * 100) + '% din program"><span data-w="' + (prog * 100).toFixed(1) + '"></span></div>' +
    '<span class="mic-erou">' + (s.saptamana >= 1 && s.saptamana <= 20 ? ((s.curriculum && s.curriculum.are_lectii) ? (s.curriculum.facute || 0) + ' din ' + deLectii(s.curriculum.total || 100) + ' · ' : '') + (s.unitati_gata || 0) + ' din 20 de unități · ' + esc(ritmFataDePlan(s).text) : '') + '</span></div></div>' +
    (s.checkpoint ? '<button class="banda-checkpoint" id="checkpoint">' + ICON.trofeu + '<span>Săptămână de checkpoint: fă testul vorbit</span></button>' : '') +
    '</section>';
  if (!s.are_nivel) h += cardNivelDeInceput();
  h += cardLectiaDeAzi(s);
  h += cardUnitate(s);
  h += zileleTale(s);
  h += planulZilei(s);

  h += '<section class="panou-start"><div class="moduri">' +
    [['lectie', 'Lecție', (s.curriculum && s.curriculum.are_lectii) ? 'lecția de azi, cu corecturi' : 'tema unității, cu corecturi', ICON.carte], ['liber', 'Conversație', 'liber, despre ce vrei', ICON.chat], ['test', 'Test vorbit', 'examen de 10 min, cu scor', ICON.trofeu]]
      .map(([v, t, d, ic]) => '<button class="mod' + (setari.mod === v ? ' activ' : '') + '" data-mod="' + v + '">' + ic + '<b>' + t + '</b><span>' + d + '</span></button>').join('') + '</div>' +
    '<div class="segment" role="radiogroup" aria-label="Unde ești">' +
    [['birou', 'Spre birou'], ['casa', 'Spre casă'], ['acasa', 'Acasă']].map(([v, t]) => '<button role="radio" aria-checked="' + (drum === v) + '" class="' + (drum === v ? 'activ' : '') + '" data-drum="' + v + '">' + t + '</button>').join('') + '</div>' +
    '<button class="orb-start" id="start"><span class="orb-unda"></span><span class="orb-unda d2"></span><span class="orb-miez">' + ICON.mic + '<b>' + (setari.mod === 'test' ? 'Începe testul' : 'Începe') + '</b></span></button>' +
    '<p class="mic centru">Profesorul începe el. Îl poți opri oricând cu „stop”, „slower” sau „recap”.</p></section>';

  h += '<div class="grila-actiuni">' +
    tile('#/simulari', ICON.telefon, 'Simulări de lucru', 'apel cu clientul, raport, negociere') +
    tile('#/fraze', ICON.difuzor, 'Frazele săptămânii', 'le asculți și în mașină') +
    tile('#/scris', ICON.creion, 'Scrie cu profesorul', 'conversație în scris, cu corecturi') +
    tile('#/carduri', ICON.carduri, 'Cartonașe', s.de_repetat ? s.de_repetat + ' de repetat azi' : (s.cuvinte_nr ? s.cuvinte_nr + ' cuvinte' : 'apar după lecții'), s.de_repetat) +
    '</div>';
  h += cardTinta(s);
  if (ultima) h += cardLectie(ultima, true);
  $('#main').innerHTML = h;
  $$('[data-w]').forEach((el) => { el.style.width = el.dataset.w + '%'; });
  $$('[data-mod]').forEach((b) => { b.onclick = () => { setari.mod = b.dataset.mod; salveazaSetari(); vedereAcasa(++S.randare); }; });
  $$('[data-drum]').forEach((b) => { b.onclick = () => { S.drum = b.dataset.drum; vedereAcasa(++S.randare); }; });
  $('#start').onclick = () => pornesteLectia({ mod: setari.mod });
  const cp = $('#checkpoint'); if (cp) cp.onclick = () => pornesteLectia({ mod: 'test' });
  const pv = $('#pas-vorbit'); if (pv) pv.onclick = () => pornesteLectia({ mod: 'test' });
  const ct = $('#card-tinta'); if (ct) ct.onclick = foaieSetari;
  legaPlanul(s);
  legaUnitatea();
  legaLectiaDeAzi(s);
  const ul = $('[data-lectie]'); if (ul) ul.onclick = () => { location.hash = '#/lectie/' + ul.dataset.lectie; };
}
function tile(href, icon, t, d, nr) {
  return '<a class="tile" href="' + href + '"><span class="tile-icon">' + icon + '</span><b>' + esc(t) + '</b><span>' + esc(d) + '</span>' + (nr ? '<i class="tile-nr">' + nr + '</i>' : '') + '</a>';
}
function cardLectie(l, eUltima) {
  let h = '<section class="card apasabil" data-lectie="' + esc(l.id) + '"><div class="rand"><b>' + (eUltima ? 'Ultima: ' : '') + esc(NUME_MOD[l.mod] || 'Lecție') + '</b><span class="mic">' + zi(l.data) + ' · ' + (l.mod === 'text' ? (l.replici || 0) + ' mesaje' : durata(l.durata_s)) + (l.cost_usd ? ' · ' + dolari(l.cost_usd) : '') + '</span></div>';
  if (l.evaluare && l.evaluare.cefr) { const k = l.evaluare.criterii || {}; h += '<div class="raport-mini"><span class="cefr">' + esc(l.evaluare.cefr) + '</span><span>gramatică ' + esc(k.gramatica || '?') + ' · vocabular ' + esc(k.vocabular || '?') + ' · fluență ' + esc(k.fluenta || '?') + '</span></div>'; }
  else if (l.raport_test && l.mod === 'test' && !('evaluare' in l)) h += '<div class="raport-mini"><span class="cefr">' + esc(l.raport_test.cefr) + '</span><span>fluență ' + l.raport_test.fluenta + ' · gramatică ' + l.raport_test.gramatica + ' · vocabular ' + l.raport_test.vocabular + ' · pronunție ' + l.raport_test.pronuntie + '</span></div>';
  if (l.verificare && l.verificare.total) h += '<p class="' + (l.verificare.trecuta ? 'bine' : 'mic') + '">' + (l.verificare.trecuta ? ICON.bifa + ' ' : '') + 'Verificarea: ' + l.verificare.corecte + ' din ' + l.verificare.total + '</p>';
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
  const [pc, curs] = await Promise.all([api('/api/engleza/parcurs'), api('/api/engleza/curriculum').catch(() => null)]);
  S.parcurs = pc; S.curriculum = curs;
  if (id !== S.randare) return;
  const p = S.parcurs;
  const cur = p.curenta;
  const gata = p.saptamani.filter((w) => w.n > 0 && w.progres && w.progres.gata).length;
  const curW = p.saptamani.find((w) => w.n === cur);
  const prog = Math.min(1, (gata + (curW && curW.progres ? curW.progres.procent / 100 : 0)) / 20);
  const dif = cur - (p.plan || 1);
  const ritm = cur === 0 ? 'începe cu testul de nivel' : dif > 0 ? 'în avans cu ' + dif + (dif === 1 ? ' unitate' : ' unități') + ' față de plan' : dif < 0 ? 'în urmă cu ' + (-dif) + (dif === -1 ? ' unitate' : ' unități') + ' față de plan' : 'exact pe plan';
  const fmt = (d) => new Date(d).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
  let h = '<section class="card parcurs-cap"><div class="rand"><div><span class="eticheta">Programul de 20 de unități</span><h2>' + (cur >= 1 && cur <= 20 ? 'Unitatea ' + cur + ' din 20' : cur > 20 ? 'Program terminat' : 'Testul de nivel') + '</h2><p class="mic ' + (cur === 0 ? '' : dif > 0 ? 'bine' : dif < 0 ? 'rau' : '') + '">' + esc(ritm) + '</p></div>' + inel(prog, Math.round(prog * 100) + '%', 'parcurs') + '</div>' +
    '<p class="mic">Treci la unitatea următoare după ce lucrezi, nu după calendar. Planul: câte o unitate pe săptămână, ' + (p.inceput ? fmt(p.inceput) + ' – ' + fmt(p.sfarsit) : '') + '.</p></section>';
  if (curs && curs.are_lectii) h += '<section class="card"><div class="rand"><h3>Cele ' + curs.total + ' de lecții</h3><span class="mic">' + facute(curs.facute) + '</span></div>' + grilaLectii(curs) + '</section>';
  else if (curs && curs.stare === 'se_genereaza') h += '<section class="card lectia-azi se-face"><h3>Îți construiesc cele 100 de lecții…</h3><div class="bara-asteptare"><span></span></div></section>';
  else if (!p.are_nivel) h += '<section class="card"><p class="text-2">Cele 100 de lecții apar aici după testul de nivel.</p></section>';
  h += '<div class="harta" id="harta"></div>';
  $('#main').innerHTML = h;
  if (curs && curs.are_lectii) legaGrilaLectii(curs);
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
    if (w.progres && w.progres.procent > 0 && !w.progres.gata) {
      const c = 2 * Math.PI * (r + 5), f = Math.min(1, w.progres.procent / 100);
      s += '<circle class="nod-progres" cx="' + q.x.toFixed(1) + '" cy="' + q.y + '" r="' + (r + 5) + '" stroke-dasharray="' + (c * f).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 ' + q.x.toFixed(1) + ' ' + q.y + ')"/>';
    }
    s += '<text class="nod-nr" x="' + q.x.toFixed(1) + '" y="' + (q.y + 6) + '" text-anchor="middle">' + (w.checkpoint ? '★' : w.n) + '</text>';
    const lat = q.x > W / 2 ? -1 : 1;
    const tx = q.x + lat * (r + 12);
    s += '<text class="nod-et" x="' + tx.toFixed(1) + '" y="' + (q.y - 2) + '" text-anchor="' + (lat > 0 ? 'start' : 'end') + '">' + (w.n === 0 ? 'Testul de nivel' : (w.checkpoint ? 'Checkpoint · ' : '') + 'Unitatea ' + w.n) + '</text>';
    const sub = w.n === 0 ? (w.stare === 'trecuta' ? 'făcut' + (w.nivel ? ' · ' + w.nivel : '') : 'primul pas') :
      w.progres && w.progres.gata ? 'terminată' : w.progres && w.progres.lectii_total ? (w.progres.lectii_facute ? w.progres.lectii_facute + ' din 5 lecții' + (w.progres.test ? ' · test ' + w.progres.test + '%' : '') : (w.stare === 'curenta' ? 'acum · 5 lecții' : '5 lecții')) :
      w.progres && w.progres.procent ? w.progres.procent + '% · ' + w.progres.vorbit_min + ' min vorbit' :
      w.stare === 'curenta' ? 'acum' : 'plan: ' + new Date(w.de_la).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
    s += '<text class="nod-sub" x="' + tx.toFixed(1) + '" y="' + (q.y + 15) + '" text-anchor="' + (lat > 0 ? 'start' : 'end') + '">' + esc(sub) + '</text>';
    const cu = w.n > 0 && S.curriculum && (S.curriculum.unitati || []).find((x) => x.n === w.n);
    if (cu) (cu.lectii || []).forEach((l, k) => {
      const px = lat > 0 ? tx + 4 + k * 11 : tx - 4 - (4 - k) * 11;
      s += '<circle class="nod-lectie' + (l.facuta ? ' facuta' : '') + '" cx="' + px.toFixed(1) + '" cy="' + (q.y + 28) + '" r="3.6"/>';
    });
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
  if (n === 0) {
    strat('<span class="eticheta">Primul pas</span><h2>Testul de nivel</h2>' +
      (S.parcurs.are_nivel ? '<p class="text-2">Făcut. Nivelul tău: <b>' + esc(w.nivel || '?') + '</b>. Îl poți reface oricând, ca să vezi cât ai crescut.</p>' : '<p class="text-2">Încă nu l-ai făcut. Durează în total cam 20 de minute și potrivește tot programul pe nivelul tău.</p>') +
      '<div class="butoane-col"><a class="buton principal" href="#/test/nivel">' + ICON.grafic + ' Test scris (20 de întrebări)</a><button class="buton" id="f-examen0">' + ICON.mic + ' Test vorbit (10 minute)</button></div>',
    () => {
      $('#f-examen0').onclick = () => { inchideStrat(); pornesteLectia({ mod: 'test' }); };
      $$('.foaie-jos a').forEach((a) => { a.addEventListener('click', inchideStrat); });
    });
    return;
  }
  const ex = w.examen;
  const cuU = S.curriculum && (S.curriculum.unitati || []).find((x) => x.n === n);
  strat('<span class="eticheta">' + esc(w.faza_nume || '') + ' · ' + new Date(w.de_la).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }) + ' – ' + new Date(w.pana_la).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }) + '</span>' +
    '<h2>' + (w.checkpoint ? 'Checkpoint · ' : '') + 'Unitatea ' + w.n + '</h2><p class="tema-foaie">' + esc(w.tema || '') + '</p>' +
    (w.progres ? '<div class="cifre-mici"><span><b>' + w.progres.procent + '%</b> gata</span>' + (w.progres.lectii_total ? '<span><b>' + (w.progres.lectii_facute || 0) + '/5</b> lecții</span>' : '') + '<span><b>' + w.progres.vorbit_min + '</b> min vorbit</span><span><b>' + (w.progres.test || 0) + '%</b> test</span></div>' : '') +
    (ex ? '<div class="raport-mini"><span class="cefr">' + esc(ex.cefr) + '</span><span>fluență ' + ex.fluenta + ' · gramatică ' + ex.gramatica + ' · vocabular ' + ex.vocabular + ' · pronunție ' + ex.pronuntie + '</span></div>' : '') +
    (cuU ? '<h3 class="sub-foaie">Lecțiile unității</h3><ul class="plan-lista">' + cuU.lectii.map((l) => '<li class="' + (l.facuta ? 'facut' : '') + '" data-lectie-id="' + esc(l.id) + '"><span class="plan-bifa">' + (l.facuta ? ICON.bifa : '<i>' + l.index + '</i>') + '</span><span class="plan-text"><b>' + esc(l.titlu) + '</b><small>' + esc(progresLectie(l)) + '</small></span></li>').join('') + '</ul>' : '') +
    '<div class="butoane-col"><button class="buton' + (cuU ? '' : ' principal') + '" id="f-lectie">' + ICON.mic + (cuU ? ' Conversație liberă pe tema asta' : ' Lecție vorbită pe tema asta') + '</button>' +
    '<button class="buton" id="f-scris">' + ICON.creion + ' Scrie pe tema asta</button>' +
    '<button class="buton" id="f-test">' + ICON.fulger + ' Test pe tema asta</button>' +
    (w.checkpoint ? '<button class="buton" id="f-examen">' + ICON.trofeu + ' Testul vorbit de checkpoint</button>' : '') + '</div>',
  () => {
    $('#f-lectie').onclick = () => { inchideStrat(); pornesteLectia({ mod: cuU ? 'liber' : 'lectie', saptamana: n }); };
    $$('[data-lectie-id]').forEach((li) => { li.onclick = () => foaieLectie(cuU.lectii.find((x) => x.id === li.dataset.lectieId)); });
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
    tile('#/simulari', ICON.telefon, 'Simulări de lucru', 'apel, raport, negociere, pronunție') +
    tile('#/fraze', ICON.difuzor, 'Frazele săptămânii', 'asculți și repeți, și în mașină') +
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
  h += '<a class="banda-checkpoint lat albastru" href="#/test/nivel">' + ICON.grafic + '<span>Testul de nivel scris (20 de întrebări, A1–C1)</span></a>';
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
  const m = String(arg || 'rapid').split('?')[0].match(/^(rapid|greseli|cuvinte|ascultare|tema|vorbit|nivel|verificare)(?:-(\d{1,2}|U\d{1,2}L[1-5]))?$/);
  const tip = m ? m[1] : 'rapid';
  const lectieV = m && m[2] && m[2][0] === 'U' ? m[2] : null;
  const sapt = m && m[2] && !lectieV ? Number(m[2]) : null;
  let k = 0;
  $('#main').innerHTML = '<div class="gol-mare"><div class="incarca-test"><span></span><span></span><span></span></div><h2>Îți pregătesc testul</h2><p class="text-2" id="msg-inc">' + MESAJE_INCARCARE[0] + '</p></div>';
  const ceas = setInterval(() => { const el = $('#msg-inc'); if (el) el.textContent = MESAJE_INCARCARE[++k % MESAJE_INCARCARE.length]; }, 3500);
  let r;
  try { r = await api('/api/engleza/test/nou', { method: 'POST', body: tip === 'verificare' ? { tip, lectie: lectieV } : sapt !== null ? { tip, saptamana: sapt } : { tip } }); } finally { clearInterval(ceas); }
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
async function finalTestNivel() {
  const t = T.test;
  titlu('Nivelul tău');
  $('#main').innerHTML = '<div class="gol-mare"><div class="incarca-test"><span></span><span></span><span></span></div><h2>Calculez nivelul…</h2></div>';
  let r;
  try {
    r = await api('/api/engleza/test/rezultat', { method: 'POST', body: { id: t.id, raspunsuri: T.rasp, durata_s: Math.round((Date.now() - T.start) / 1000) } });
  } catch (e) { toast(e.message, true); location.hash = '#/acasa'; return; }
  const benzi = r.benzi || {};
  confetti();
  $('#main').innerHTML = '<div class="final-test"><div class="cefr-cerc mare">' + esc(r.nivel || '?') + '</div><h2>Nivelul tău la scris: ' + esc(r.nivel || '?') + '</h2>' +
    '<p class="text-2">' + r.corecte + ' din ' + r.total + ' răspunsuri corecte. Pe fiecare nivel:</p><div class="benzi">' +
    ['A1', 'A2', 'B1', 'B2', 'C1'].filter((b) => benzi[b] && benzi[b].total).map((b) => { const x = benzi[b] || { corecte: 0, total: 0 }; const f = x.total ? x.corecte / x.total : 0;
      return '<div class="banda"><span>' + b + '</span><div class="scor-bara"><i data-w="' + Math.round(f * 100) + '"></i></div><b>' + x.corecte + '/' + x.total + '</b></div>'; }).join('') + '</div>' +
    '<p class="text-2">Testul scris arată ce recunoști: gramatica și vocabularul. Lecțiile merg după nivelul vorbit' + (S.stare && S.stare.nivel_vorbit ? ' (acum ' + esc(S.stare.nivel_vorbit) + ')' : '') + ', pentru că acolo e ținta ta; de obicei vorbitul e sub scris.</p>' +
    (S.stare && S.stare.curriculum && (S.stare.curriculum.facute || 0) < 3 ? '<p class="bine">Pentru că ai făcut mai puțin de 3 lecții, ți le potrivesc și după rezultatul ăsta, în 2–3 minute.</p>' : '') +
    '<div class="butoane-col"><button class="buton principal" id="vorbit">' + ICON.mic + ' Acum testul vorbit</button><a class="buton" href="#/acasa">Mai târziu</a></div></div>';
  setTimeout(() => $$('.benzi [data-w]').forEach((el) => { el.style.width = el.dataset.w + '%'; }), 50);
  $('#vorbit').onclick = () => pornesteLectia({ mod: 'test' });
  incarcaStare().catch(() => {});
}
async function finalVerificare() {
  const t = T.test;
  titlu('Verificarea lecției');
  const corecte = T.rasp.filter((x) => x && x.corect).length;
  $('#main').innerHTML = '<div class="gol-mare"><div class="incarca-test"><span></span><span></span><span></span></div><h2>Salvez rezultatul…</h2></div>';
  let r = null;
  try { r = await api('/api/engleza/test/rezultat', { method: 'POST', body: { id: t.id, raspunsuri: T.rasp, durata_s: Math.round((Date.now() - T.start) / 1000) } }); } catch (e) { toast('Rezultatul nu s-a salvat: ' + e.message, true); }
  const prag = (r && r.prag) || t.prag || 4;
  const ok = r ? !!r.trecuta : corecte >= prag;
  $('#main').innerHTML = '<div class="final-test"><div class="cefr-cerc mare' + (ok ? '' : ' slab') + '">' + corecte + '/' + t.intrebari.length + '</div>' +
    '<h2>' + (ok ? 'Lecție trecută' : 'Încă nu e trecută') + '</h2><p class="text-2">' + (ok ? 'Bifată. Data viitoare începi lecția următoare.' : 'Îți trebuie ' + prag + ' din ' + t.intrebari.length + '. Uită-te mai jos la ce n-a mers și mai încearcă.') + '</p>' +
    '<div class="recapitulare">' + t.intrebari.map((q, i) => (T.rasp[i] && T.rasp[i].corect) ? '' : '<div class="rec-item"><span class="rec-q">' + esc(q.ro || '') + '</span><b>' + esc(q.asteptat) + '</b>' + (T.rasp[i] && T.rasp[i].raspuns ? '<small>Ai spus: „' + esc(T.rasp[i].raspuns) + '”</small>' : '') + '</div>').join('') + '</div>' +
    '<div class="butoane-col">' + (ok ? '<a class="buton principal" href="#/acasa">Acasă</a>' : '<button class="buton principal" id="inca">Mai încearcă</button><a class="buton" href="#/acasa">Acasă</a>') + '</div></div>';
  if (ok) confetti();
  const inca = $('#inca'); if (inca) inca.onclick = () => { location.hash = '#/test/verificare-' + t.lectie_id + '?' + Date.now(); };
  incarcaStare().catch(() => {});
}
async function finalTest() {
  const t = T.test;
  if (t.tip === 'nivel') return finalTestNivel();
  if (t.tip === 'verificare') return finalVerificare();
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
  let lectieCeruta = null;
  try { lectieCeruta = JSON.parse(sessionStorage.getItem('engleza.scris.lectie') || 'null'); } catch (e) { lectieCeruta = null; }
  sessionStorage.removeItem('engleza.scris.lectie');
  if (!C || (saptCeruta !== null && Number(saptCeruta) !== C.saptamana) || (lectieCeruta && lectieCeruta.id !== C.lectie)) {
    if (C && C.mesaje.some((m) => m.de === 'eu')) salveazaScrisInFundal(C);
    C = { mesaje: [], start: Date.now(), saptamana: saptCeruta !== null ? Number(saptCeruta) : null,
      lectie: lectieCeruta ? lectieCeruta.id : null, lectieTitlu: lectieCeruta ? lectieCeruta.titlu : null };
  }
  deseneazaScris();
  if (!C.mesaje.length) await raspunsProfesor(id);
}
function corpScris(c) {
  const transcript = c.mesaje.map((m) => ({ de: m.de === 'eu' ? 'eu' : 'profesor', text: m.text, ts: m.ts }));
  return { mod: 'text', transcript, durata_s: Math.round((Date.now() - c.start) / 1000), saptamana: c.saptamana, lectie: c.lectie || undefined,
    unitate: c.saptamana !== null ? c.saptamana : (S.stare && S.stare.saptamana) || undefined };
}
function salveazaScrisInFundal(c) { api('/api/engleza/lectie', { method: 'POST', body: corpScris(c) }).catch(() => {}); }
function deseneazaScris() {
  let h = '<div class="chat"><div class="chat-sus"><span class="mic">' + (C.lectieTitlu ? 'Lecția · ' + esc(C.lectieTitlu) : C.saptamana !== null ? 'Tema unității ' + C.saptamana : 'Conversație liberă în scris') + '</span><span class="chat-actiuni">' + (C.lectie ? '<a class="buton mic-b" href="#/test/verificare-' + esc(C.lectie) + '">Verificarea</a>' : '') + '<button class="buton mic-b" id="termina-scris">Termină</button></span></div><div class="chat-bule" id="bule">';
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
    if (C.lectie) corp.lectie = C.lectie;
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
  try {
    const r = await api('/api/engleza/lectie', { method: 'POST', body: corpScris(C) });
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
function hartaZile(zileActive, zileDeschise) {
  const set = new Set(zileActive || []);
  const deschise = new Set(zileDeschise || []);
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
      s += '<span class="' + (viitor ? 'viitor' : set.has(iso) ? 'activ' : deschise.has(iso) ? 'deschis' : '') + '" title="' + z.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }) + (set.has(iso) ? ': ai exersat' : deschise.has(iso) ? ': doar ai intrat' : ': n-ai folosit-o') + '"></span>';
    }
    s += '</div>';
  }
  return s + '</div><div class="legenda-zile"><span class="cel activ"></span><span class="mic">ai exersat</span><span class="cel deschis"></span><span class="mic">doar ai intrat</span><span class="cel"></span><span class="mic">n-ai folosit-o</span></div>';
}
async function vedereProgres(id) {
  titlu('Progres');
  $('#main').innerHTML = '<div class="incarca"><span class="punct-incarca"></span></div>';
  const [p, cur] = await Promise.all([api('/api/engleza/progres'), api('/api/engleza/curriculum').catch(() => null)]);
  if (id !== S.randare) return;
  S.progres = p; S.curriculum = cur;
  graficeActive = [];
  const ore = Math.floor((p.minute || 0) / 60), min = (p.minute || 0) % 60;
  let h = '<section class="erou mic-erou-p"><div class="erou-sus"><div class="erou-text"><span class="eticheta-erou">Nivelul tău acum</span><h2 class="cefr-mare">' + esc(p.nivel || '—') + '</h2><p class="tema">' + (p.nivel ? 'estimat din lecții și din testele vorbite' : 'îl afli după prima lecție sau din testul vorbit') + '</p></div>' +
    '<div class="erou-cifre col"><div class="cifra-erou' + (p.serie > 0 ? ' aprinsa' : '') + '">' + ICON.flacara + '<b>' + p.serie + '</b><span>zile la rând · record ' + p.serie_max + '</span></div><div class="cifra-erou xp"><b>' + new Intl.NumberFormat('ro-RO').format(p.xp) + '</b><span>XP</span></div></div></div></section>';
  h += '<div class="dale">' +
    dala(p.lectii, p.lectii === 1 ? 'sesiune' : 'sesiuni') + dala(ore ? ore + ' h ' + min + ' m' : min + ' min', 'de engleză vorbită') +
    dala(p.cuvinte, 'cuvinte și expresii', p.stapanite + ' stăpânite') + dala(p.teste, p.teste === 1 ? 'test' : 'teste') + '</div>';
  if (cur && cur.are_lectii) h += '<section class="card"><div class="rand"><h3>Lecțiile cursului</h3><span class="mic">' + cur.facute + ' din ' + cur.total + '</span></div>' + grilaLectii(cur) + '</section>';
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
  h += '<section class="card"><div class="rand"><h3>Zilele în care ai exersat</h3><span class="mic">ultimele 4 luni</span></div>' + hartaZile(p.zile_active, p.zile_deschise) + '</section>';
  h += '<h2 class="titlu">Insigne</h2><div class="insigne">' + (p.insigne || []).map((b) => '<div class="insigna-p' + (b.castigata ? ' castigata' : '') + '" title="' + esc(b.descriere) + '"><span class="insigna-icon">' + (b.castigata ? ICON.trofeu : ICON.bifa) + '</span><b>' + esc(b.nume) + '</b><small>' + esc(b.descriere) + '</small></div>').join('') + '</div>';
  $('#main').innerHTML = h;
  if (cur && cur.are_lectii) legaGrilaLectii(cur);
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
  if (l.evaluare && l.evaluare.cefr) h += '<div class="raport"><div class="cefr-cerc">' + esc(l.evaluare.cefr) + '</div><div><b>Nivelul vorbit</b><p class="mic">evaluat strict pe tot testul</p></div></div>' + blocEvaluare(l.evaluare);
  else if (l.mod === 'test' && l.rezumat && !l.evaluare) h += '<p class="text-2 pulseaza">Nivelul se calculează (2–3 minute)…</p>';
  else if (l.raport_test) h += raportScoruri(l.raport_test);
  if (l.verificare && l.verificare.total) h += '<div class="verif-sesiune"><b>' + (l.verificare.trecuta ? ICON.bifa + ' Verificarea trecută: ' : 'Verificarea: ') + l.verificare.corecte + ' din ' + l.verificare.total + '</b><ul class="verif-lista">' + (l.verificare.itemi || []).map((i) => '<li class="' + (i.corect ? 'ok' : 'gresit') + '"><b>' + (i.corect ? '✓' : '✗') + '</b><span>' + esc(i.a_spus || '') + (!i.corect && i.varianta_buna ? '<small class="bine">' + esc(i.varianta_buna) + '</small>' : '') + '</span></li>').join('') + '</ul></div>';
  if (!l.rezumat) h += '<p class="text-2 pulseaza">Rezumatul se pregătește…</p>';
  if ((l.rezumat || {}).calitate_audio) h += '<p class="mic">Cât de clar te-a prins microfonul: ' + esc({ buna: 'bine', medie: 'mediu', slaba: 'slab' }[l.rezumat.calitate_audio] || l.rezumat.calitate_audio) + '</p>';
  if (r.rezumat_ro) h += '<p>' + esc(r.rezumat_ro) + '</p>';
  if (r.progres_ro) h += '<p class="bine">' + esc(r.progres_ro) + '</p>';
  h += '</section>';
  if ((r.greseli || []).length) h += '<h2 class="titlu">Greșelile de reținut</h2><section class="card"><ul class="greseli">' + r.greseli.map((g) => '<li><s>' + esc(g.gresit) + '</s><b>' + esc(g.corect) + '</b>' + (g.nota_ro ? '<small>' + esc(g.nota_ro) + '</small>' : '') + '</li>').join('') + '</ul></section>';
  if ((r.cuvinte_noi || []).length) h += '<h2 class="titlu">Cuvinte noi</h2><section class="card"><ul class="cuvinte">' + r.cuvinte_noi.map((c, i) => '<li><button class="buton-rotund mic" data-cuv="' + i + '" aria-label="Ascultă">' + ICON.difuzor + '</button><b>' + esc(c.en) + '</b><span>' + esc(c.ro) + '</span></li>').join('') + '</ul></section>';
  if (r.data_viitoare_en) h += '<p class="mic centru">' + esc(r.data_viitoare_en) + '</p>';
  if ((l.transcript || []).length) h += '<details class="card"><summary>Tot textul conversației (' + l.transcript.length + ' replici)</summary><div class="chat-bule static">' + l.transcript.map((t) => '<div class="bula ' + (t.de === 'eu' ? 'eu' : 'prof') + '">' + esc(t.text) + '</div>').join('') + '</div></details>';
  h += blocFeedback('Ceva n-a mers la sesiunea asta?');
  $('#main').innerHTML = h;
  $$('[data-cuv]').forEach((b) => { b.onclick = () => reda(r.cuvinte_noi[Number(b.dataset.cuv)].en, b); });
  legaFeedback({ sesiune: lid, lectie: l.lectie_id || undefined, ecran: 'sesiune' });
  const recenta = Date.now() - new Date(String(l.data || '').replace(' ', 'T')).getTime() < 15 * 60000;
  if (!l.rezumat || (l.mod === 'test' && !l.evaluare && recenta)) setTimeout(() => { if (ruta().v === 'lectie' && ruta().arg === lid) vedereLectie(++S.randare, lid); }, 5000);
}

/* ------------------------------------------------------------ LECȚIA VORBITĂ (OpenAI Realtime, WebRTC) */
/* 1.5 (24.11): lecția are 5 pași pe ecran și se termină cu verificarea finală (minim 4 din 5), pe care profesorul o notează
   prin funcții; „Nu asta am zis” îi spune profesorului că a auzit greșit; cercul îl oprește când vorbește (vocea ta nu-l
   mai întrerupe, ca să nu-l taie zgomotul de pe stradă); fiecare sesiune își salvează diagnosticul (microfon, cât de clar
   a prins transcrierea, tokeni), ca să pot repara aplicația din date, nu din ghicit. */
const L = {
  faza: 'oprit', pc: null, dc: null, flux: null, transcript: [], inceput: 0, cost: 0, mut: false, mod: 'lectie', saptamana: null,
  oprireCeruta: false, reconectari: 0, ceas: null, wake: null, salvare: null, raport: null, apeluri: new Set(),
  ac: null, anMic: null, anProf: null, buf: null, rafId: 0, stare: '',
  plan: null, pas: 0, pasInceput: 0, nudge: {}, verif: null, raspunsActiv: false, audioProf: false, vorbeste: false,
  coadaApp: [], inchidere: null, asteaptaFinal: false, rolNote: 'system', diag: null, zgomot: 'far_field', mic: null,
  vorbire: 'buton', inreg: null, raspunsDatorat: false, poarta: null, ultimaTranscriere: null,
};
const NUME_PAS_SCURT = ['Încălzire', 'Ce înveți', 'Exersezi', 'Situația', 'Verificarea'];
function secundeLive() { return L.inceput ? Math.round((Date.now() - L.inceput) / 1000) : 0; }
function diagNou() {
  return { versiune: VERSIUNE_APP, segmente: 0, scurte: 0, lp: [], neclare: 0, nu_am_zis: [], raspunsuri: 0, opriri: 0, vorbiri: 0,
    tokeni: { ain: 0, ain_cache: 0, aout: 0, tin: 0, tin_cache: 0, tout: 0 }, pasi: [], note_app: 0, erori: [],
    apasari: 0, intreruperi: 0, anulate: 0, prea_scurte: 0, secunde_vorbite: 0, niveluri: [],
    corecturi_verificate: 0, corecturi_reale: 0, fara_transcriere: 0, poarta_ms: [], a_spus_transcriere: 0 };
}
function ecranLive() {
  const examen = L.mod === 'test', cuButon = L.vorbire === 'buton';
  $('#main').innerHTML = '<div class="live' + (examen ? ' examen' : '') + (L.plan ? ' cu-pasi' : '') + '">' +
    '<div class="live-sus"><span class="eticheta-live">' + (examen ? 'Test vorbit' : (L.numeScenariu ? 'Simulare · ' + esc(L.numeScenariu) : (L.lectieTitlu ? 'Lecția · ' + esc(L.lectieTitlu) : NUME_MOD[L.mod]))) + (L.saptamana !== null ? ' · săpt. ' + L.saptamana : '') + '</span><span class="mic"><span id="ceas">0:00</span> · <span id="cost">$0.00</span></span></div>' +
    '<div class="pasi-live" id="pasi-live" hidden></div>' +
    '<button class="orb-live" id="orb" aria-label="' + (cuButon ? 'Apasă și vorbește' : 'Oprește profesorul') + '"><span class="orb-halou"></span><span class="orb-corp"></span></button>' +
    '<p class="stare" id="stare">Mă conectez…</p><p class="mic centru" id="sub-stare">' + (cuButon ? (examen ? 'Fără corecturi în timpul testului. Apeși butonul, vorbești, apeși din nou ca să trimiți.' : 'Apeși butonul, spui tot ce vrei, apeși din nou și abia atunci pleacă. Nu te mai întrerupe.') : (examen ? 'Fără corecturi în timpul testului. Nivelul îl calculez la final, din tot ce ai spus.' : 'Vorbește liber. Ca să-l oprești când vorbește, atinge cercul.')) + '</p>' +
    '<p class="mic centru aviz-casti" id="aviz-casti" hidden></p>' +
    '<div class="verif-live" id="verif-live" hidden></div>' +
    (cuButon ? '<div class="vorbit"><button class="buton principal lat vorbit-buton" id="vorbit">' + ICON.mic + ' Apasă și vorbește</button><button class="buton-text" id="vorbit-anuleaza" hidden>Anulează, nu trimite</button></div>' : '') +
    '<div class="comenzi">' +
    (cuButon ? '' : '<button class="buton" id="mut">' + ICON.mic + ' Microfon</button>') +
    '<button class="buton" id="nu-am-zis">Nu asta am zis</button>' +
    '<button class="buton" id="rar">Mai rar</button>' +
    (examen ? '<button class="buton" id="text-buton">Text</button>' : '<button class="buton" id="urmatorul">' + (L.plan ? 'Pasul următor' : 'Recap') + '</button>') +
    '</div>' +
    '<div class="subtitrari" id="subtitrari"' + (setari.subtitrari ? '' : ' hidden') + '></div>' +
    '<button class="buton pericol lat" id="termina">' + (examen ? 'Oprește testul' : 'Termină lecția') + '</button>' +
    (examen ? '' : '<button class="buton-text" id="arata-text">' + (setari.subtitrari ? 'Ascunde textul' : 'Arată textul conversației') + '</button>') +
    '</div>';
  const mb = $('#mut'); if (mb) mb.onclick = comutaMut;
  $('#rar').onclick = () => schimbaViteza(-0.1);
  $('#nu-am-zis').onclick = nuAstaAmZis;
  $('#orb').onclick = cuButon ? comutaVorbitul : opresteProfesorul;
  if (cuButon) { $('#vorbit').onclick = comutaVorbitul; $('#vorbit-anuleaza').onclick = anuleazaVorbitul; deseneazaButonVorbit(); }
  const urm = $('#urmatorul'); if (urm) urm.onclick = () => (L.plan ? pasulUrmator() : trimiteText('recap'));
  const tb = $('#text-buton') || $('#arata-text');
  if (tb) tb.onclick = () => {
    setari.subtitrari = !setari.subtitrari; salveazaSetari();
    $('#subtitrari').hidden = !setari.subtitrari;
    if ($('#arata-text')) $('#arata-text').textContent = setari.subtitrari ? 'Ascunde textul' : 'Arată textul conversației';
    deseneazaSubtitrari();
  };
  $('#termina').onclick = () => terminaLectia(false);
  if (L.plan) { deseneazaPasii(); deseneazaVerificarea(); }
}
function seteazaStare(text, clasa) {
  if (text === 'Rândul tău' && L.vorbire === 'buton') text = 'Rândul tău: apasă și vorbește';
  L.stare = clasa || '';
  const el = $('#stare'); if (el) el.textContent = text;
  const o = $('#orb'); if (o) o.className = 'orb-live ' + (clasa || '');
}
function deseneazaSubtitrari() {
  const el = $('#subtitrari');
  if (!el || el.hidden) return;
  el.innerHTML = L.transcript.slice(-10).map((t) => '<p class="' + (t.de === 'eu' ? 'eu' : 'prof') + (t.de === 'eu' && typeof t.lp === 'number' && Math.exp(t.lp) < 0.6 ? ' neclar' : '') + (t.contestat ? ' contestat' : '') + '">' + esc(t.text) + '</p>').join('');
  el.scrollTop = el.scrollHeight;
}
function adaugaReplica(de, text, lp) {
  text = String(text || '').trim();
  if (!text) return;
  const r = { de, text, ts: new Date().toISOString() };
  if (typeof lp === 'number' && isFinite(lp)) r.lp = Math.round(lp * 1000) / 1000;
  L.transcript.push(r);
  if (de === 'eu' && L.diag) {
    L.diag.segmente += 1;
    if (text.split(/\s+/).length <= 2) L.diag.scurte += 1;
    if (typeof r.lp === 'number') { L.diag.lp.push(r.lp); if (Math.exp(r.lp) < 0.6) L.diag.neclare += 1; }
  }
  deseneazaSubtitrari();
}
function lpMedie(ev) {
  const l = ev && Array.isArray(ev.logprobs) ? ev.logprobs.filter((x) => x && typeof x.logprob === 'number') : [];
  return l.length ? l.reduce((a, x) => a + x.logprob, 0) / l.length : null;
}
function costDin(u) {
  if (!u) return 0;
  const it = u.input_token_details || {}, ot = u.output_token_details || {}, cd = it.cached_tokens_details || {};
  const ain = it.audio_tokens || 0, tin = it.text_tokens || 0;
  let cA = cd.audio_tokens, cT = cd.text_tokens;
  if (cA === undefined && cT === undefined) { const c = it.cached_tokens || 0; cT = Math.min(tin, c); cA = Math.min(ain, c - cT); }
  cA = cA || 0; cT = cT || 0;
  if (L.diag) {
    const k = L.diag.tokeni;
    k.ain += ain - cA; k.ain_cache += cA; k.tin += tin - cT; k.tin_cache += cT; k.aout += ot.audio_tokens || 0; k.tout += ot.text_tokens || 0;
  }
  return ((ain - cA) * PRET.audio_in + cA * PRET.audio_in_cache + (tin - cT) * PRET.text_in + cT * PRET.text_in_cache + (ot.audio_tokens || 0) * PRET.audio_out + (ot.text_tokens || 0) * PRET.text_out) / 1e6;
}

/* --- pașii lecției */
function deseneazaPasii() {
  const el = $('#pasi-live'); if (!el || !L.plan) return;
  el.hidden = false;
  const v = L.verif || {};
  el.innerHTML = '<div class="pasi-sir">' + (L.plan.pasi || []).map((x, i) => {
    const nr = i + 1, gata = nr < L.pas || (nr === 5 && v.gata && v.trecuta);
    return '<button class="pas-chip' + (gata ? ' gata' : nr === L.pas ? ' activ' : '') + '" data-pas="' + nr + '" aria-label="Pasul ' + nr + ': ' + esc(x.nume) + '"><b>' + (gata ? ICON.bifa : nr) + '</b><span>' + esc(NUME_PAS_SCURT[i] || x.nume) + '</span></button>';
  }).join('') + '</div><p class="mic centru" id="pas-timp"></p>';
  $$('[data-pas]', el).forEach((b) => { b.onclick = () => saltLaPas(Number(b.dataset.pas)); });
  const u = $('#urmatorul');
  if (u) u.textContent = L.pas >= 5 ? (v.gata && !v.trecuta ? 'Reia verificarea' : 'Verificarea') : 'Pasul următor';
  actualizeazaTimpPas();
}
function actualizeazaTimpPas() {
  const el = $('#pas-timp'); if (!el || !L.plan) return;
  if (!L.pas) { el.textContent = 'Profesorul începe cu încălzirea'; return; }
  if (L.pas === 5 && L.verif && L.verif.gata) { el.textContent = L.verif.trecuta ? 'Lecție trecută' : 'Verificare terminată'; return; }
  const p = L.plan.pasi[L.pas - 1] || {};
  el.textContent = 'Pasul ' + L.pas + ' din 5 · ' + (p.nume || '') + ' · ' + durata((Date.now() - L.pasInceput) / 1000) + ' din ~' + (p.minute || 3) + ' min';
}
function seteazaPas(nr) {
  nr = Math.max(1, Math.min(5, parseInt(nr, 10) || 1));
  if (nr === 5 && L.verif && L.verif.gata) { // „check again”: încă o încercare, cu aceleași 5 sarcini
    L.verif.itemi = []; L.verif.gata = false; L.verif.trecuta = false; L.verif.incercari += 1; L.asteaptaFinal = false;
    anuleazaInchiderea();
    const f = $('.final-live'); if (f) f.remove();
  }
  if (nr !== L.pas) { L.pas = nr; L.pasInceput = Date.now(); if (L.diag) L.diag.pasi.push({ nr, t: secundeLive() }); }
  deseneazaPasii();
  deseneazaVerificarea();
}
function saltLaPas(nr) {
  if (!L.plan || L.faza !== 'live') return;
  if (nr === 5 && L.verif && L.verif.gata) { reiaVerificarea(); return; }
  if (nr === L.pas) return;
  notaApp('Andrei tapped step ' + nr + ' (' + (L.plan.pasi[nr - 1] || {}).cheie + ') on his screen. Go to step ' + nr + ' now: call pas with ' + nr + ' and start it.');
  toast('Trecem la: ' + (NUME_PAS_SCURT[nr - 1] || 'pasul ' + nr));
}
function pasulUrmator() {
  if (!L.plan) return;
  if (L.pas >= 5) { if (L.verif.gata && !L.verif.trecuta) reiaVerificarea(); else saltLaPas(5); return; }
  saltLaPas(Math.max(2, (L.pas || 1) + 1));
}
function reiaVerificarea() {
  notaApp('Andrei wants to retry the final check: call pas with 5 and give the same five tasks again, from the first one.');
  toast('Reiei verificarea');
}
function verificaTimpulPasului() {
  if (!L.plan || L.faza !== 'live') return;
  if (!L.pas) {
    if (secundeLive() > 180 && !L.nudge[0]) { L.nudge[0] = true; notaApp('Remember: call pas at the start of each lesson step, so his screen shows where he is. Call it now with the step you are in.'); }
    return;
  }
  if (L.pas >= 5 || L.nudge[L.pas]) return;
  const p = L.plan.pasi[L.pas - 1] || {};
  if ((Date.now() - L.pasInceput) / 1000 > (p.minute || 3) * 60 + 75) {
    L.nudge[L.pas] = true;
    notaApp('Step ' + L.pas + ' is over its time. Finish it in one sentence and move on to step ' + (L.pas + 1) + ' (call pas).');
  }
}

/* --- verificarea finală */
function deseneazaVerificarea() {
  const el = $('#verif-live'); if (!el || !L.plan || !L.verif) return;
  const t = L.plan.total || 5, v = L.verif;
  if (L.pas !== 5 && !v.itemi.length) { el.hidden = true; return; }
  el.hidden = false;
  const dupaNr = {};
  v.itemi.forEach((x) => { dupaNr[x.nr] = x; });
  const ultim = v.itemi[v.itemi.length - 1];
  const sarc = urmatoareaSarcina();
  const urm = sarc ? (L.plan.verificare || [])[sarc.nr - 1] : null;
  const final = $('.final-live');
  el.innerHTML = '<div class="rand"><span class="eticheta">Verificarea finală' + (v.incercari > 1 ? ' · încercarea ' + v.incercari : '') + '</span><span class="mic">' + v.itemi.filter((x) => x.corect).length + ' corecte · îți trebuie ' + L.plan.prag + ' din ' + t + '</span></div>' +
    '<div class="verif-puncte">' + Array.from({ length: t }, (_, i) => { const x = dupaNr[i + 1]; return '<span class="' + (x ? (x.corect ? 'ok' : 'gresit') : '') + '">' + (x ? (x.corect ? '✓' : '✗') : i + 1) + '</span>'; }).join('') + '</div>' +
    (ultim && !ultim.corect && ultim.varianta_buna ? '<p class="mic">Corect era: <b>' + esc(ultim.varianta_buna) + '</b>' + (ultim.motiv_ro ? ' · ' + esc(ultim.motiv_ro) : '') + '</p>' : '') +
    (!v.gata && urm ? '<p class="mic text-2">Sarcina ' + sarc.nr + ': ' + esc(urm.ro || urm.cerinta || '') + '</p>' : '');
  if (final) el.appendChild(final);
}
function urmatoareaSarcina() {
  if (!L.plan || !L.verif) return null;
  const facute = new Set(L.verif.itemi.map((x) => x.nr));
  for (let i = 1; i <= L.plan.total; i++) {
    if (!facute.has(i)) return { nr: i, of: L.plan.total, text: (L.plan.verificare[i - 1] || {}).cerinta || '' };
  }
  return null;
}
function gardaVerificare(a) { // 1.5.1: null = se poate nota; altfel, motivul pentru profesor
  const P = L.plan;
  if (!P || !L.verif) return { ok: false, error: 'no lesson plan in this session' };
  const v = L.verif;
  // 1.5.1: în 1.5 profesorul chema verificare și la exerciții (24.11, U1L1), iar exercițiul lua locul sarcinii; acum se respinge
  if (L.pas !== 5) {
    if (L.diag) L.diag.verif_respinse = (L.diag.verif_respinse || 0) + 1;
    return { ok: false, scored: false, error: 'Not scored: you are in step ' + (L.pas || 1) + ', which is practice. The function verificare is only for the five final-check tasks. Do not mention this to Andrei; just go on with this step. When step 4 is done, call pas with 5 and read task 1 from its result.' };
  }
  const sarc = urmatoareaSarcina();
  const nr = Math.max(1, Math.min(P.total, parseInt(a.nr, 10) || (sarc ? sarc.nr : v.itemi.length + 1)));
  if (sarc && nr !== sarc.nr && !v.itemi.some((x) => x.nr === nr)) {
    if (L.diag) L.diag.verif_respinse = (L.diag.verif_respinse || 0) + 1;
    return { ok: false, scored: false, error: 'Task ' + nr + ' has not been asked yet. The current task is ' + sarc.nr + ': "' + sarc.text + '". Ask exactly that and judge his answer to it.' };
  }
  if ((L.intrari || 0) <= (v.intrariLaSarcina || 0)) { // 1.5.1: modelul își nota singur sarcina, înainte să răspundă Andrei
    if (L.diag) L.diag.verif_respinse = (L.diag.verif_respinse || 0) + 1;
    return { ok: false, scored: false, error: 'Not scored: Andrei has not answered yet. Ask the task (if you have not) and wait for his answer; only then call verificare. Do not mention this to him.' };
  }
  a.nr = nr;
  return null;
}
function notaVerificare(a) { // după gardă, cu nota examinatorului de pe server (sau a profesorului, dacă serverul nu răspunde)
  const P = L.plan, v = L.verif, nr = a.nr;
  if (!P || !v) return { ok: false, error: 'no lesson plan in this session' };
  v.ultimNr = nr;
  v.itemi = v.itemi.filter((x) => x.nr !== nr).concat([{ nr, a_spus: String(a.a_spus || '').slice(0, 400), corect: a.corect === true, varianta_buna: String(a.varianta_buna || '').slice(0, 400), motiv_ro: String(a.motiv_ro || '').slice(0, 160), judecat: a.judecat || 'profesor' }]).sort((x, y) => x.nr - y.nr);
  const corecte = v.itemi.filter((x) => x.corect).length;
  let out;
  if (v.itemi.length >= P.total) {
    v.gata = true; v.trecuta = corecte >= P.prag;
    pastreazaIncercarea();
    L.asteaptaFinal = true;
    out = { ok: true, final_check_done: true, correct: corecte, total: P.total, passed: v.trecuta, pass_mark: P.prag,
      next: v.trecuta ? 'Tell him the score, congratulate him in a few words and say goodbye. The lesson is over.'
        : 'Tell him the score, name the one structure to review, and tell him he can say "check again" to retry the five tasks.' };
  } else {
    out = { ok: true, answered: v.itemi.length, correct_so_far: corecte, next_task: urmatoareaSarcina() };
    v.intrariLaSarcina = L.intrari || 0;
  }
  deseneazaPasii();
  deseneazaVerificarea();
  return out;
}
function pastreazaIncercarea() {
  const v = L.verif, c = v.itemi.filter((x) => x.corect).length;
  if (!v.cea_mai_buna || c > v.cea_mai_buna.itemi.filter((x) => x.corect).length) v.cea_mai_buna = { itemi: v.itemi.slice(), total: L.plan.total };
}
function verificareDeSalvat() {
  if (!L.plan || !L.verif) return undefined;
  const v = L.verif;
  const x = v.cea_mai_buna || (v.itemi.length ? { itemi: v.itemi, total: L.plan.total } : null);
  return x ? { itemi: x.itemi, total: x.total, incercari: v.incercari } : undefined;
}
function arataFinalLive() {
  const v = L.verif, el = $('#verif-live');
  if (!el || !v || L.faza !== 'live') return;
  const vechi = $('.final-live'); if (vechi) vechi.remove();
  const c = v.itemi.filter((x) => x.corect).length;
  if (v.trecuta) {
    let ramas = 25;
    el.insertAdjacentHTML('beforeend', '<div class="final-live bine"><b>' + ICON.bifa + ' Lecție trecută: ' + c + ' din ' + L.plan.total + '</b><p class="mic" id="inchide-in">Se închide singură în ' + ramas + ' s</p><div class="butoane"><button class="buton principal" id="inchide-acum">Închei acum</button><button class="buton" id="mai-vorbim">Mai vorbim</button></div></div>');
    $('#inchide-acum').onclick = () => terminaLectia(true);
    $('#mai-vorbim').onclick = () => { anuleazaInchiderea(); const f = $('.final-live'); if (f) f.remove(); };
    L.inchidere = setInterval(() => {
      ramas -= 1;
      const t = $('#inchide-in'); if (t) t.textContent = 'Se închide singură în ' + ramas + ' s';
      if (ramas <= 0) { anuleazaInchiderea(); terminaLectia(true); }
    }, 1000);
    confetti();
  } else {
    el.insertAdjacentHTML('beforeend', '<div class="final-live"><b>' + c + ' din ' + L.plan.total + ': încă nu e trecută</b><p class="mic">Îți trebuie ' + L.plan.prag + '. Spune „check again” sau apasă mai jos.</p><div class="butoane"><button class="buton principal" id="reia-verif">Reia verificarea</button></div></div>');
    $('#reia-verif').onclick = reiaVerificarea;
  }
  deseneazaPasii();
}
function anuleazaInchiderea() {
  if (!L.inchidere) return;
  clearInterval(L.inchidere); L.inchidere = null;
  const t = $('#inchide-in'); if (t) t.textContent = 'Rămânem. Termini când vrei.';
}

/* --- 1.7 (24.11): vorbești cu butonul. Pe căști, profesorul decidea singur când ai terminat și te tăia la jumătatea
   propoziției. Acum apeși, spui tot ce vrei, apeși din nou și abia atunci pleacă replica. Între apăsări microfonul e oprit. */
function ceRaspuns() { // răspunsul profesorului: acum sau imediat ce se poate (nu peste vorbitul tău și nu peste alt răspuns)
  if (L.inreg || L.poarta || L.raspunsActiv || L.judecari > 0 || !L.dc || L.dc.readyState !== 'open') { L.raspunsDatorat = true; return; }
  L.raspunsDatorat = false;
  trimiteEveniment({ type: 'response.create' });
  L.raspunsActiv = true;
}
function comutaVorbitul() {
  if (L.faza !== 'live' || L.vorbire !== 'buton') return;
  if (L.inreg) { if (!L.inreg.trimit) trimiteVorbitul(); return; }
  incepeVorbitul();
}
function incepeVorbitul() {
  if (!L.dc || L.dc.readyState !== 'open') { toast('Încă mă conectez. Apasă din nou în câteva secunde.'); return; }
  if (L.inchidere) anuleazaInchiderea();
  const peste = L.raspunsActiv || L.audioProf;
  if (L.raspunsActiv) trimiteEveniment({ type: 'response.cancel' });
  if (L.audioProf) trimiteEveniment({ type: 'output_audio_buffer.clear' });
  L.audioProf = false;
  trimiteEveniment({ type: 'input_audio_buffer.clear' });
  L.inreg = { start: Date.now(), trimit: false, nivelMax: 0, ceas: null };
  L.vorbeste = true;
  if (L.flux) L.flux.getAudioTracks().forEach((t) => { t.enabled = true; });
  if (L.diag) { L.diag.apasari += 1; if (peste) L.diag.intreruperi += 1; }
  seteazaStare('Te ascult… apasă când ai terminat', 'asculta');
  deseneazaButonVorbit();
  L.inreg.ceas = setInterval(() => {
    if (L.inreg && !L.inreg.trimit && Date.now() - L.inreg.start > 120000) { toast('Două minute: trimit ce ai spus.'); trimiteVorbitul(); return; }
    deseneazaButonVorbit();
  }, 500);
}
function trimiteVorbitul() {
  const r = L.inreg;
  if (!r || r.trimit) return;
  r.trimit = true;
  clearInterval(r.ceas);
  const sec = (Date.now() - r.start) / 1000;
  seteazaStare('Trimit…', 'gandeste');
  deseneazaButonVorbit();
  // microfonul mai ține 0,3 s (ultima silabă), apoi încă 0,25 s până ajunge sunetul la OpenAI; abia apoi pleacă replica
  setTimeout(() => {
    if (L.inreg === r && L.flux) L.flux.getAudioTracks().forEach((t) => { t.enabled = false; });
    setTimeout(() => {
      if (L.inreg !== r) return; // anulată sau legătura a căzut între timp
      L.inreg = null; L.vorbeste = false;
      if (L.faza !== 'live' || !L.dc || L.dc.readyState !== 'open') { deseneazaButonVorbit(); return; }
      if (sec < 0.8) { // atingere scăpată, nu replică
        trimiteEveniment({ type: 'input_audio_buffer.clear' });
        if (L.diag) L.diag.prea_scurte += 1;
        toast('Prea scurt. Apasă, vorbește, apoi apasă din nou.');
        seteazaStare('Rândul tău', 'asteapta');
        deseneazaButonVorbit();
        if (L.raspunsDatorat) ceRaspuns();
        setTimeout(golesteCoadaApp, 300);
        return;
      }
      trimiteEveniment({ type: 'input_audio_buffer.commit' });
      L.intrari = (L.intrari || 0) + 1;
      if (L.diag) {
        L.diag.vorbiri += 1;
        L.diag.secunde_vorbite = Math.round((L.diag.secunde_vorbite + sec) * 10) / 10;
        if (L.diag.niveluri.length < 40) L.diag.niveluri.push(Math.round((r.nivelMax || 0) * 1000) / 1000);
      }
      seteazaStare('Se gândește…', 'gandeste');
      deseneazaButonVorbit();
      pornestePoarta(); // 1.8: întâi transcrierea și examinatorul, apoi profesorul
    }, 250);
  }, 300);
}
function anuleazaVorbitul() {
  const r = L.inreg;
  if (!r || r.trimit) return;
  abandoneazaVorbitul();
  trimiteEveniment({ type: 'input_audio_buffer.clear' });
  if (L.diag) L.diag.anulate += 1;
  seteazaStare('Rândul tău', 'asteapta');
  toast('Anulat. Apasă când vrei să spui din nou.');
  if (L.raspunsDatorat) ceRaspuns();
  setTimeout(golesteCoadaApp, 300);
}
function abandoneazaVorbitul() { // fără nimic trimis (anulare sau legătură căzută)
  if (L.inreg) clearInterval(L.inreg.ceas);
  L.inreg = null; L.vorbeste = false;
  if (L.flux && L.vorbire === 'buton') L.flux.getAudioTracks().forEach((t) => { t.enabled = false; });
  deseneazaButonVorbit();
}
function deseneazaButonVorbit() {
  const b = $('#vorbit');
  if (!b) return;
  const r = L.inreg, inreg = !!(r && !r.trimit), stare = inreg ? 'inreg' : (r ? 'trimit' : 'gata');
  // conținutul se refă doar când se schimbă starea, nu la fiecare secundă: o atingere care prindea redesenarea se pierdea
  if (b.dataset.stare !== stare) {
    b.dataset.stare = stare;
    b.classList.toggle('inregistreaza', inreg);
    b.classList.toggle('principal', !inreg);
    b.disabled = stare === 'trimit';
    b.innerHTML = inreg ? '<span class="punct-rosu"></span><span class="vorbit-text"></span>' : (r ? '<span class="vorbit-text">Trimit…</span>' : ICON.mic + '<span class="vorbit-text">Apasă și vorbește</span>');
    const a = $('#vorbit-anuleaza'); if (a) a.hidden = !inreg;
  }
  if (inreg) { const t = b.querySelector('.vorbit-text'); if (t) t.textContent = 'Gata, trimite · ' + durata((Date.now() - r.start) / 1000); }
}

/* --- 1.8 (24.11): corecturile le decide examinatorul de pe Mac, din transcriere, nu profesorul din auz. Pe căști (sunet de apel)
   profesorul auzea greșit și „corecta” lucruri spuse bine; la 19:15 a „corectat” și o propoziție corectă, ca s-o aducă la exemplul
   lecției. După ce trimiți, aplicația așteaptă transcrierea (gpt-4o-transcribe), o dă examinatorului și abia apoi răspunde profesorul. */
function pornestePoarta() {
  if (L.mod === 'test' || setari.corecturi === false) { ceRaspuns(); return; }
  const p = { start: Date.now(), itemId: null, text: null, marcat: null, inLucru: false, ceas: null };
  L.poarta = p;
  p.ceas = setTimeout(() => { if (L.diag) L.diag.fara_transcriere += 1; continuaPoarta(p); }, 3000); // fără transcriere în 3 s: merge mai departe
}
function laTranscriere(ev) {
  const text = String((ev && ev.transcript) || '').trim();
  if (L.vorbire === 'buton' && text) L.ultimaTranscriere = { text, t: Date.now() };
  const p = L.poarta;
  if (!p || p.text !== null || p.inLucru) return;
  if (p.itemId && ev.item_id && ev.item_id !== p.itemId) return;
  p.text = text;
  p.marcat = textCuNeclare(ev) || text;
  continuaPoarta(p);
}
function textCuNeclare(ev) { // cuvintele prinse nesigur (sub 30%) primesc [?]: nici examinatorul, nici profesorul nu le corectează
  const l = ev && Array.isArray(ev.logprobs) ? ev.logprobs : [];
  if (!l.length) return null;
  const cuv = [];
  l.forEach((x) => {
    const tok = String((x && x.token) || '');
    const lp = x && typeof x.logprob === 'number' ? x.logprob : 0;
    if (!cuv.length || /^\s/.test(tok)) cuv.push({ t: tok.trim(), lp });
    else { const c = cuv[cuv.length - 1]; c.t += tok; c.lp = Math.min(c.lp, lp); }
  });
  return cuv.filter((c) => c.t).map((c) => c.t + (/[A-Za-z]/.test(c.t) && Math.exp(c.lp) < 0.3 ? ' [?]' : '')).join(' ');
}
function ultimaReplicaProfesor() {
  for (let i = L.transcript.length - 1; i >= 0; i--) if (L.transcript[i].de === 'profesor') return L.transcript[i].text.slice(0, 300);
  return '';
}
function asemanare(x, y) { // cât de mult seamănă două propoziții (cuvinte comune / toate cuvintele)
  const w = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean));
  const a = w(x), b = w(y);
  if (!a.size || !b.size) return 0;
  let c = 0;
  a.forEach((t) => { if (b.has(t)) c += 1; });
  return c / (a.size + b.size - c);
}
async function continuaPoarta(p) {
  if (L.poarta !== p || p.inLucru) return;
  p.inLucru = true;
  clearTimeout(p.ceas);
  const text = p.marcat || p.text || '';
  const cuvinte = (text.replace(/\[\?\]/g, '').match(/[A-Za-z']+/g) || []).length;
  const neclar = /\[\?\]/.test(text) ? ' Words marked [?] were not heard clearly: never correct them and do not ask him to repeat because of them; understand the sentence as well as you can.' : '';
  let nota = null;
  if (text && L.pas === 5 && L.plan) {
    nota = 'Speech recognition heard his answer as: «' + text + '». Judge this text, not your own hearing.' + neclar;
  } else if (text && cuvinte >= 3) {
    let v = null;
    try {
      v = await Promise.race([
        api('/api/engleza/corecteaza', { method: 'POST', body: { lectie: L.lectie || undefined, text, intrebare: ultimaReplicaProfesor() } }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('examinatorul n-a răspuns în 3,5 s')), 3500)),
      ]);
    } catch (e) { if (L.diag && L.diag.erori.length < 20) L.diag.erori.push('corecteaza: ' + String(e.message || e).slice(0, 150)); }
    if (v && v.ok) {
      if (L.diag) { L.diag.corecturi_verificate += 1; if (v.greseala) L.diag.corecturi_reale += 1; }
      nota = v.greseala
        ? 'Speech recognition heard: «' + text + '». The examiner found one real mistake: "' + v.gresit + '" should be "' + v.corect + '"' + (v.propozitia ? ' (his sentence fixed: "' + v.propozitia + '")' : '') + '. Correct only this, briefly, then go on. Do not correct anything else.'
        : 'Speech recognition heard: «' + text + '». The examiner checked it: no real mistake. Do NOT correct anything and do not offer a better or more natural version, not even the example sentence of the lesson. Respond to what he said.';
    } else {
      nota = 'Speech recognition heard: «' + text + '». Correct only a real mistake you can see in this text; if it is correct English, do not correct anything.';
    }
    nota += neclar;
  }
  if (L.poarta !== p) return; // legătura a căzut sau lecția s-a oprit între timp
  L.poarta = null;
  if (L.diag && L.diag.poarta_ms.length < 40) L.diag.poarta_ms.push(Date.now() - p.start);
  if (L.faza !== 'live') return;
  if (nota) trimiteEveniment({ type: 'conversation.item.create', item: { type: 'message', role: L.rolNote, content: [{ type: 'input_text', text: '[APP] ' + nota }] } });
  ceRaspuns();
}
function renuntaLaPoarta() { if (L.poarta) { clearTimeout(L.poarta.ceas); L.poarta = null; } }

/* --- notele aplicației către profesor, „Nu asta am zis”, oprirea profesorului */
function notaApp(text) {
  L.coadaApp.push(text);
  golesteCoadaApp();
}
function golesteCoadaApp() {
  if (!L.coadaApp.length || L.raspunsActiv || L.audioProf || L.vorbeste || L.poarta || L.judecari > 0 || !L.dc || L.dc.readyState !== 'open') return;
  const text = L.coadaApp.shift();
  trimiteEveniment({ type: 'conversation.item.create', item: { type: 'message', role: L.rolNote, content: [{ type: 'input_text', text: '[APP] ' + text }] } });
  trimiteEveniment({ type: 'response.create' });
  L.raspunsActiv = true; L.raspunsDatorat = false;
  if (L.diag) L.diag.note_app += 1;
}
function opresteProfesorul() {
  if (L.faza !== 'live' || !(L.raspunsActiv || L.audioProf)) return;
  trimiteEveniment({ type: 'response.cancel' });
  trimiteEveniment({ type: 'output_audio_buffer.clear' });
  L.audioProf = false;
  if (L.diag) L.diag.opriri += 1;
  seteazaStare(L.mut ? 'Microfonul e oprit' : 'Rândul tău', L.mut ? 'mut' : 'asteapta');
}
function nuAstaAmZis() {
  if (L.faza !== 'live') return;
  const ultim = (de) => { for (let i = L.transcript.length - 1; i >= 0; i--) if (L.transcript[i].de === de) return L.transcript[i]; return null; };
  const eu = ultim('eu'), prof = ultim('profesor');
  if (eu) eu.contestat = true;
  if (L.diag && L.diag.nu_am_zis.length < 50) L.diag.nu_am_zis.push({ t: secundeLive(), eu: eu ? eu.text.slice(0, 300) : '', prof: prof ? prof.text.slice(0, 300) : '', lp: eu ? eu.lp : null });
  opresteProfesorul();
  const v = L.verif;
  if (L.pas === 5 && v && v.ultimNr && v.itemi.some((x) => x.nr === v.ultimNr) && !(v.gata && v.trecuta)) {
    // în verificare, sarcina se reia și verdictul nou îl înlocuiește pe cel vechi (în 1.5 rămânea greșită)
    v.intrariLaSarcina = L.intrari || 0;
    notaApp('Andrei says you misheard his answer to task ' + v.ultimNr + ' of the final check. Say "Sorry." and ask him to answer task ' + v.ultimNr + ' again. Wait for his new answer; only then call verificare again with nr ' + v.ultimNr + ' (the new verdict replaces the old one), then go on with the next task.');
  } else {
    notaApp('Andrei says you misheard him: he did not say what you understood or corrected. Say "Sorry, my mistake." in a few words, drop that correction and go on. Ask him to say it again only if you really need it.');
  }
  toast('I-am spus că a auzit greșit.');
  deseneazaSubtitrari();
}

/* 1.5.1: nota o dă examinatorul de pe server (model de text). Profesorul vocal nota inconsecvent: aceleași răspunsuri, o dată 4/5, altă dată 1/5. */
async function judecaSiRaspunde(a, callId) {
  L.judecari = (L.judecari || 0) + 1;
  seteazaStare('Verific răspunsul…', 'gandeste');
  const tr = L.vorbire === 'buton' && L.ultimaTranscriere && Date.now() - L.ultimaTranscriere.t < 180000 ? L.ultimaTranscriere.text : '';
  if (tr && asemanare(tr, a.a_spus) >= 0.4) { // 1.8: transcrierea e mai sigură decât urechea profesorului
    a = Object.assign({}, a, { a_spus: tr, a_spus_profesor: a.a_spus });
    if (L.diag) L.diag.a_spus_transcriere += 1;
  }
  let j = null;
  try {
    j = await Promise.race([
      api('/api/engleza/judeca', { method: 'POST', body: { lectie: L.lectie, nr: a.nr, a_spus: a.a_spus } }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('examinatorul n-a răspuns în 10 s')), 10000)),
    ]);
  } catch (e) { if (L.diag && L.diag.erori.length < 20) L.diag.erori.push('judeca: ' + String(e.message || e).slice(0, 150)); }
  L.judecari -= 1;
  if (L.faza !== 'live' || !L.dc || L.dc.readyState !== 'open') return;
  const dinServer = !!(j && j.ok && typeof j.corect === 'boolean');
  const b = dinServer
    ? Object.assign({}, a, { corect: j.corect, varianta_buna: j.corect ? (a.a_spus || j.varianta_buna) : (j.varianta_buna || a.varianta_buna), motiv_ro: j.motiv_ro || '', judecat: 'server' })
    : Object.assign({}, a, { judecat: 'profesor' });
  if (L.diag) { L.diag.judecate_server = (L.diag.judecate_server || 0) + (dinServer ? 1 : 0); L.diag.judecate_profesor = (L.diag.judecate_profesor || 0) + (dinServer ? 0 : 1); }
  const out = notaVerificare(b);
  if (dinServer && out.ok) { out.verdict = j.corect ? 'correct' : 'not quite'; out.say = j.corect ? 'Correct.' : 'Not quite: ' + b.varianta_buna; }
  trimiteEveniment({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(out) } });
  ceRaspuns(); // dacă vorbește chiar acum (butonul), răspunsul pleacă după ce trimite
}

/* --- funcțiile apelate de profesor (doar la response.done, ca să nu pornim un răspuns peste altul) */
function laApelFunctie(nume, callId, argumente) {
  if (!callId || L.apeluri.has(callId)) return false;
  L.apeluri.add(callId);
  let a = {};
  try { a = JSON.parse(argumente || '{}') || {}; } catch (e) { a = {}; }
  let iesire = { ok: true };
  if (nume === 'raport_test') {
    L.raport = a;
    iesire = { ok: true, saved: true };
    const ss = $('#sub-stare'); if (ss) ss.textContent = 'Testul s-a încheiat. Nivelul îl calculez din tot ce ai spus, după ce închizi.';
  } else if (nume === 'pas') {
    seteazaPas(a.nr);
    iesire = { ok: true, step: L.pas };
    if (L.pas === 5 && L.plan && L.verif && !L.verif.gata) {
      const t = urmatoareaSarcina();
      if (t) { iesire.task = t; L.verif.intrariLaSarcina = L.intrari || 0; } // sarcina exactă dată de aplicație; se notează abia după ce răspunde Andrei
    }
  } else if (nume === 'verificare') {
    const garda = gardaVerificare(a);
    if (garda) iesire = garda;
    else { judecaSiRaspunde(a, callId); return false; } // nota o dă examinatorul; răspunsul pleacă după
  } else {
    iesire = { ok: false, error: 'unknown function' };
  }
  trimiteEveniment({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(iesire) } });
  return true;
}
function laEveniment(ev) {
  switch (ev.type) {
    case 'input_audio_buffer.speech_started':
      L.vorbeste = true;
      if (L.diag) L.diag.vorbiri += 1;
      if (L.inchidere) anuleazaInchiderea();
      seteazaStare('Te ascult…', 'asculta');
      break;
    case 'input_audio_buffer.speech_stopped': L.vorbeste = false; L.intrari = (L.intrari || 0) + 1; seteazaStare('Se gândește…', 'gandeste'); setTimeout(golesteCoadaApp, 400); break;
    case 'response.created': L.raspunsActiv = true; seteazaStare(L.mod === 'test' ? 'Examinatorul vorbește' : 'Profesorul vorbește', 'vorbeste'); break;
    case 'output_audio_buffer.started': L.audioProf = true; seteazaStare(L.mod === 'test' ? 'Examinatorul vorbește' : 'Profesorul vorbește', 'vorbeste'); break;
    case 'output_audio_buffer.stopped':
    case 'output_audio_buffer.cleared':
      L.audioProf = false;
      if (!L.raspunsActiv && !L.inreg) seteazaStare(L.mut ? 'Microfonul e oprit' : 'Rândul tău', L.mut ? 'mut' : 'asteapta');
      setTimeout(golesteCoadaApp, 300);
      break;
    case 'response.done': {
      L.raspunsActiv = false;
      const r = ev.response || {};
      L.cost += costDin(r.usage);
      if (L.diag) L.diag.raspunsuri += 1;
      let continua = false;
      // 1.7: un apel tăiat la jumătate (l-ai întrerupt) nu se execută; argumentele lui sunt incomplete
      (r.output || []).forEach((o) => { if (o && o.type === 'function_call' && o.status !== 'incomplete' && laApelFunctie(o.name, o.call_id, o.arguments)) continua = true; });
      if (continua || L.raspunsDatorat) ceRaspuns();
      else if (L.asteaptaFinal && r.status === 'completed') { L.asteaptaFinal = false; arataFinalLive(); }
      if (!L.raspunsActiv && !L.audioProf && !(L.judecari > 0) && !L.inreg && !L.poarta) seteazaStare(L.mut ? 'Microfonul e oprit' : 'Rândul tău', L.mut ? 'mut' : 'asteapta');
      setTimeout(golesteCoadaApp, 300);
      break;
    }
    case 'conversation.item.input_audio_transcription.completed': adaugaReplica('eu', ev.transcript, lpMedie(ev)); laTranscriere(ev); break;
    case 'conversation.item.input_audio_transcription.failed': if (L.poarta && L.poarta.text === null) { L.poarta.text = ''; continuaPoarta(L.poarta); } break;
    case 'input_audio_buffer.committed': if (L.poarta && !L.poarta.itemId) L.poarta.itemId = ev.item_id || null; break;
    case 'response.output_audio_transcript.done': adaugaReplica('profesor', ev.transcript); break;
    case 'error': {
      const m = (ev.error && ev.error.message) || 'eroare';
      if (L.diag && L.diag.erori.length < 20) L.diag.erori.push(m.slice(0, 200));
      if (/role/i.test(m) && L.rolNote === 'system') L.rolNote = 'user';
      if (/already has an active response/i.test(m)) L.raspunsActiv = true; // 1.7: nu și „no active response found”, care bloca profesorul
      if (!/cancel|no active response|already|active response/i.test(m)) toast('OpenAI: ' + m, true);
      break;
    }
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
    const vm = L.mut ? 0 : nivel(L.anMic);
    if (L.inreg && !L.inreg.trimit && vm > (L.inreg.nivelMax || 0)) L.inreg.nivelMax = vm;
    const v = Math.max(vm, nivel(L.anProf) * 1.2);
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
  const corp = { mod: L.mod, drum: S.drum || drumImplicit(), viteza: setari.viteza, rabdare: setari.rabdare, zgomot: L.zgomot, intrerupere: false, pasi: true, vorbire: L.vorbire, reluare: reluare || [] };
  if (L.saptamana !== null) corp.saptamana = L.saptamana;
  if (L.scenariu) corp.scenariu = L.scenariu;
  if (L.lectie) corp.lectie = L.lectie;
  const s = await api('/api/engleza/sesiune', { method: 'POST', body: corp });
  if (s.preturi) PRET = s.preturi;
  if (s.lectie && !L.lectie) {
    L.lectie = s.lectie; L.lectieTitlu = s.lectie_titlu || null;
    const et = $('.eticheta-live'); if (et && L.lectieTitlu) et.textContent = 'Lecția · ' + L.lectieTitlu;
  }
  if (s.plan && !L.plan) {
    L.plan = s.plan;
    L.verif = { itemi: [], gata: false, trecuta: false, incercari: 1, cea_mai_buna: null };
    const lv = $('.live'); if (lv) lv.classList.add('cu-pasi');
    deseneazaPasii();
  }
  if (L.diag) { L.diag.zgomot = s.zgomot || L.zgomot; L.diag.intrerupere = !!s.intrerupere; L.diag.cu_pasi = !!s.plan; L.diag.vorbire = s.vorbire || 'automat'; }
  const pc = new RTCPeerConnection();
  const sunet = $('#sunet');
  pc.ontrack = (e) => { sunet.srcObject = e.streams[0]; sunet.play().catch(() => {}); leagaSunetProfesor(e.streams[0]); };
  L.flux.getAudioTracks().forEach((t) => { t.enabled = L.vorbire === 'buton' ? !!(L.inreg && !L.inreg.trimit) : !L.mut; pc.addTrack(t, L.flux); });
  const dc = pc.createDataChannel('oai-events');
  dc.onmessage = (e) => { try { laEveniment(JSON.parse(e.data)); } catch (x) { /* ignor */ } };
  dc.onopen = () => {
    if (reluare && reluare.length && L.plan && L.pas) {
      dc.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: L.rolNote, content: [{ type: 'input_text', text: '[APP] The lesson was at step ' + L.pas + (L.pas === 5 && L.verif ? ' (final check, ' + L.verif.itemi.length + ' tasks answered so far)' : '') + ' when the connection dropped. Continue from there; do not call pas again for this step.' }] } }));
    }
    dc.send(JSON.stringify({ type: 'response.create' }));
    L.raspunsActiv = true;
  };
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
    L.raspunsActiv = false; L.audioProf = false; L.vorbeste = false; L.raspunsDatorat = false;
    abandoneazaVorbitul(); renuntaLaPoarta();
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
  L.raspunsActiv = true;
  adaugaReplica('eu', text);
  L.intrari = (L.intrari || 0) + 1;
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
  if (!setari.ecran) return;
  if (window.Aplicatie && window.Aplicatie.ecranAprins) { window.Aplicatie.ecranAprins(true); return; }
  if (!('wakeLock' in navigator)) return;
  try { L.wake = await navigator.wakeLock.request('screen'); } catch (e) { L.wake = null; }
}
function diagnosticDeSalvat(durataS) {
  const d = L.diag;
  if (!d) return undefined;
  const lp = d.lp || [];
  return Object.assign({}, d, { lp: undefined, lp_medie: lp.length ? Math.round(lp.reduce((a, x) => a + x, 0) / lp.length * 1000) / 1000 : null,
    procent_neclar: d.segmente ? Math.round(100 * d.neclare / d.segmente) : null, durata_s: durataS, reconectari: L.reconectari,
    cost: Math.round(L.cost * 10000) / 10000, pas_final: L.pas || null });
}
function salveazaLocal() {
  try {
    localStorage.setItem(CHEIE_LECTIE, JSON.stringify({ transcript: L.transcript, durata_s: Math.round((Date.now() - L.inceput) / 1000),
      cost_usd: Math.round(L.cost * 10000) / 10000, mod: L.mod, drum: S.drum, raport_test: L.raport, saptamana: L.saptamana, lectie: L.lectie || undefined,
      verificare: verificareDeSalvat(), diagnostic: diagnosticDeSalvat(Math.round((Date.now() - L.inceput) / 1000)) }));
  } catch (e) { /* ignor */ }
}
async function pornesteLectia(opt) {
  if (L.faza !== 'oprit') return;
  if (!window.RTCPeerConnection || !navigator.mediaDevices) { toast('Browserul ăsta nu poate face convorbiri.', true); return; }
  Object.assign(L, { faza: 'conectare', transcript: [], cost: 0, mut: false, oprireCeruta: false, reconectari: 0, raport: null, apeluri: new Set(),
    mod: (opt && opt.mod) || 'lectie', saptamana: opt && Number.isInteger(opt.saptamana) ? opt.saptamana : null,
    scenariu: (opt && opt.scenariu) || null, numeScenariu: (opt && opt.numeScenariu) || null,
    lectie: (opt && opt.lectie) || null, lectieTitlu: (opt && opt.titlu) || null,
    plan: null, pas: 0, pasInceput: 0, nudge: {}, verif: null, raspunsActiv: false, audioProf: false, vorbeste: false,
    coadaApp: [], inchidere: null, asteaptaFinal: false, rolNote: 'system', diag: diagNou(), mic: null,
    vorbire: setari.vorbire === 'automat' ? 'automat' : 'buton', inreg: null, raspunsDatorat: false, poarta: null, ultimaTranscriere: null });
  location.hash = '#/live';
  document.body.classList.add('in-lectie');
  ecranLive();
  try {
    L.flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    L.faza = 'oprit'; toast(mesajMicrofon(e), true); location.hash = '#/acasa'; return;
  }
  L.mic = infoMicrofon(L.flux);
  if (L.vorbire === 'buton') L.flux.getAudioTracks().forEach((t) => { t.enabled = false; }); // 1.7: te aude doar cât e pornit butonul
  if (L.mic.nativ && L.mic.nativ.bt) { const av = $('#aviz-casti'); if (av) { av.textContent = 'Ai căști Bluetooth: pe ele te aude ca la telefon și te prinde prost. Fără ele merge mult mai bine.'; av.hidden = false; } }
  L.zgomot = setari.zgomot === 'auto' || !setari.zgomot ? (L.mic.casti ? 'near_field' : 'far_field') : setari.zgomot;
  L.diag.microfon = L.mic;
  L.diag.setare_microfon = setari.zgomot;
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
  setTimeout(() => { try { if (L.diag && window.Aplicatie && window.Aplicatie.audio) L.diag.nativ_in_lectie = JSON.parse(window.Aplicatie.audio()); } catch (e) { /* nu e APK */ } }, 8000);
  if ('mediaSession' in navigator && window.MediaMetadata) navigator.mediaSession.metadata = new MediaMetadata({ title: L.mod === 'test' ? 'English speaking test' : 'English lesson', artist: 'English' });
  L.ceas = setInterval(() => {
    const c = $('#ceas'); if (c) c.textContent = durata((Date.now() - L.inceput) / 1000);
    const k = $('#cost'); if (k) k.textContent = dolari(L.cost);
    actualizeazaTimpPas();
    verificaTimpulPasului();
    golesteCoadaApp();
  }, 1000);
  L.salvare = setInterval(salveazaLocal, 20000);
}
function oprireTehnica() {
  if (L.inreg) { clearInterval(L.inreg.ceas); L.inreg = null; }
  renuntaLaPoarta();
  try { if (L.pc) L.pc.close(); } catch (e) { /* ignor */ }
  if (L.flux) L.flux.getTracks().forEach((t) => t.stop());
  L.pc = null; L.dc = null; L.flux = null; L.anMic = null; L.anProf = null;
  cancelAnimationFrame(L.rafId);
  clearInterval(L.ceas); clearInterval(L.salvare);
  if (L.inchidere) { clearInterval(L.inchidere); L.inchidere = null; }
  if (L.wake) { L.wake.release().catch(() => {}); L.wake = null; }
  if (window.Aplicatie && window.Aplicatie.ecranAprins) window.Aplicatie.ecranAprins(false);
  const s = $('#sunet'); if (s) s.srcObject = null;
}
function blocVerificareFinal(v, plan, lid) {
  const x = v && (v.cea_mai_buna || (v.itemi.length ? { itemi: v.itemi } : null));
  if (!x) {
    return '<div class="cefr-cerc mare gol-cerc">?</div><h2>Lecție terminată, fără verificare</h2><p class="text-2">Lecția se bifează doar după verificarea finală: minim ' + plan.prag + ' din ' + plan.total + '.</p>' +
      '<a class="buton principal" href="#/test/verificare-' + esc(lid) + '">' + ICON.fulger + ' Fă verificarea acum (2 min)</a>';
  }
  const c = x.itemi.filter((i) => i.corect).length, ok = c >= plan.prag;
  return '<div class="cefr-cerc mare' + (ok ? '' : ' slab') + '">' + c + '/' + plan.total + '</div><h2>' + (ok ? 'Lecție trecută' : x.itemi.length < plan.total ? 'Verificare neterminată' : 'Încă nu e trecută') + '</h2>' +
    (ok ? '<p class="bine">' + ICON.bifa + ' Bifată. Data viitoare începi lecția următoare.</p>' : '<p class="text-2">Îți trebuie ' + plan.prag + ' din ' + plan.total + '.</p>') +
    '<ul class="verif-lista">' + x.itemi.map((i) => '<li class="' + (i.corect ? 'ok' : 'gresit') + '"><b>' + (i.corect ? '✓' : '✗') + '</b><span>' + esc((plan.verificare[i.nr - 1] || {}).ro || 'Sarcina ' + i.nr) +
      (i.a_spus ? '<small>Ai spus: „' + esc(i.a_spus) + '”</small>' : '') + (!i.corect && i.varianta_buna ? '<small class="bine">' + esc(i.varianta_buna) + '</small>' : '') + '</span></li>').join('') + '</ul>' +
    (ok ? '' : '<a class="buton principal" href="#/test/verificare-' + esc(lid) + '">' + ICON.fulger + ' Reia verificarea (2 min)</a>');
}
async function asteaptaEvaluarea(id, n) {
  const el = $('#nivel-calcul');
  if (!el) return;
  let l = null;
  try { l = await api('/api/engleza/lectie?id=' + encodeURIComponent(id)); } catch (e) { l = null; }
  const ev = l && l.evaluare;
  if (!$('#nivel-calcul')) return;
  if (ev && ev.cefr) {
    const c = $('.final-test .cefr-cerc'); if (c) { c.textContent = ev.cefr; c.classList.remove('pulseaza', 'gol-cerc'); }
    const h = $('.final-test h2'); if (h) h.textContent = 'Nivelul tău vorbit: ' + ev.cefr;
    $('#nivel-calcul').outerHTML = blocEvaluare(ev);
    confetti();
    incarcaStare().catch(() => {});
    return;
  }
  if (ev && ev.eroare) { el.textContent = 'N-am putut calcula nivelul: ' + ev.eroare; return; }
  if (n > 60) { el.textContent = 'Durează mai mult ca de obicei. Îl găsești în Istoric când e gata.'; return; }
  setTimeout(() => asteaptaEvaluarea(id, n + 1), 5000);
}
async function terminaLectia(fortat) {
  if (L.faza !== 'live') return;
  if (!fortat && L.transcript.length && !confirm(L.mod === 'test' ? 'Oprești testul?' : 'Termini lecția?')) return;
  L.oprireCeruta = true;
  L.faza = 'final';
  const durataS = Math.round((Date.now() - L.inceput) / 1000);
  oprireTehnica();
  document.body.classList.remove('in-lectie');
  const sesiune = { transcript: L.transcript, durata_s: durataS, cost_usd: Math.round(L.cost * 10000) / 10000, mod: L.mod, drum: S.drum, raport_test: L.raport,
    verificare: verificareDeSalvat(), diagnostic: diagnosticDeSalvat(durataS) };
  if (L.saptamana !== null) sesiune.saptamana = L.saptamana;
  sesiune.unitate = L.saptamana !== null ? L.saptamana : (S.stare && S.stare.saptamana) || undefined;
  if (L.lectie) sesiune.lectie = L.lectie;
  const lectieFinal = L.lectie, planFinal = L.plan, verifFinal = L.verif, modFinal = L.mod;
  const vorbiteDeEl = L.transcript.filter((t) => t.de === 'eu').length;
  L.faza = 'oprit';
  const minuteNoi = Math.round(durataS / 60);
  const costAzi = ((S.stare && S.stare.cost_azi_usd) || 0) + L.cost;
  let sus;
  if (modFinal === 'test') {
    sus = '<div class="cefr-cerc mare gol-cerc pulseaza">…</div><h2>' + (L.raport ? 'Testul s-a încheiat' : 'Test oprit înainte de final') + '</h2>' +
      '<p class="text-2" id="nivel-calcul">' + (vorbiteDeEl >= 6 ? 'Îți calculez nivelul vorbit, strict, din tot ce ai spus. Durează 2–3 minute; dacă închizi, îl găsești în Istoric.' : 'Ai vorbit prea puțin ca să-ți calculez nivelul.') + '</p>';
  } else if (planFinal) {
    sus = blocVerificareFinal(verifFinal, planFinal, lectieFinal);
  } else {
    sus = inel(Math.min(1, minuteNoi / Math.max(5, setari.obiectiv)), durata(durataS), 'minute') + '<h2>Lecție terminată</h2>';
  }
  $('#main').innerHTML = '<div class="final-test">' + sus +
    '<p class="text-2">' + (minuteNoi ? '+' + minuteNoi + ' XP · ' : '') + durata(durataS) + ' · ' + dolari(L.cost) + ' · azi ' + dolari(costAzi) + '</p>' +
    '<p class="text-2" id="mesaj-final">Salvez…</p>' + blocFeedback(modFinal === 'test' ? 'Cum a fost testul?' : 'Cum a fost lecția?') +
    '<div class="butoane-col"><a class="buton principal" href="#/acasa">Acasă</a></div></div>';
  let idSesiune = null;
  legaFeedback(() => ({ sesiune: idSesiune || undefined, lectie: lectieFinal || undefined, ecran: modFinal === 'test' ? 'final_test' : 'final_lectie' }));
  if (modFinal !== 'test' && verifFinal && verifFinal.trecuta) confetti();
  history.replaceState(null, '', '#/acasa');
  if (!vorbiteDeEl) {
    localStorage.removeItem(CHEIE_LECTIE);
    $('#mesaj-final').textContent = 'Sesiunea a fost prea scurtă ca s-o salvez.';
    return;
  }
  try {
    const r = await api('/api/engleza/lectie', { method: 'POST', body: sesiune });
    idSesiune = r.id;
    localStorage.removeItem(CHEIE_LECTIE);
    $('#mesaj-final').innerHTML = 'Salvat. <a href="#/lectie/' + esc(r.id) + '">Vezi rezumatul</a> (gata în câteva secunde).';
    incarcaStare().catch(() => {});
    if (modFinal === 'test' && vorbiteDeEl >= 6) setTimeout(() => asteaptaEvaluarea(r.id, 0), 15000);
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

/* ------------------------------------------------------------ SIMULĂRI DE LUCRU */
async function vedereSimulari(id) {
  titlu('Simulări de lucru');
  const s = S.stare || await incarcaStare();
  if (id !== S.randare) return;
  const lista = s.scenarii || [];
  let h = '<p class="text-2">Joci o situație reală, în engleză, cu profesorul în rolul clientului sau al colegului. Rămâne în rol, îți corectează din mers o singură greșeală pe replică, iar la final face recapitularea.</p>';
  h += '<div class="scenarii">' + lista.map((x) => '<button class="scenariu" data-sc="' + esc(x.id) + '"><span class="tile-icon">' + (ICON[x.icon] || ICON.chat) + '</span><b>' + esc(x.nume) + '</b><span>' + esc(x.descriere) + '</span></button>').join('') + '</div>';
  $('#main').innerHTML = h;
  $$('[data-sc]').forEach((b) => {
    b.onclick = () => { const x = lista.find((q) => q.id === b.dataset.sc); pornesteLectia({ mod: 'lectie', scenariu: b.dataset.sc, numeScenariu: x ? x.nume : '' }); };
  });
}

/* ------------------------------------------------------------ FRAZELE SĂPTĂMÂNII (și pentru mașină) */
const F = { lista: [], redaTot: false };
function asteaptaSfarsit(a) { return new Promise((r) => { a.onended = r; a.onerror = r; }); }
async function redaSiAsteapta(text) {
  let url = Redare.cache.get(text);
  if (!url) { url = URL.createObjectURL(await apiAudioEngleza(text)); Redare.cache.set(text, url); }
  const a = new Audio(url);
  Redare.audio = a;
  const gata = asteaptaSfarsit(a);
  await a.play();
  await gata;
}
function textRedaTot() { return ICON.play + ' Redă toate, cu pauză între ele'; }
async function vedereFraze(id, arg) {
  const s = S.stare || await incarcaStare();
  const n = /^\d{1,2}$/.test(String(arg || '')) ? Number(arg) : (s.saptamana || 1);
  titlu('Frazele săptămânii');
  $('#main').innerHTML = '<div class="gol-mare"><div class="incarca-test"><span></span><span></span><span></span></div><h2>Pregătesc frazele…</h2><p class="text-2">Prima dată durează câteva secunde.</p></div>';
  const d = await api('/api/engleza/fraze?saptamana=' + n);
  if (id !== S.randare) return;
  F.lista = d.fraze || [];
  F.redaTot = false;
  let h = '<section class="card"><span class="eticheta">Săptămâna ' + n + '</span><p class="tema-foaie">' + esc(d.tema || '') + '</p>' +
    '<button class="buton principal lat" id="reda-tot">' + textRedaTot() + '</button><p class="mic centru">Bun în mașină: asculți fraza, apoi o repeți cu voce tare în pauză.</p></section>';
  h += '<div class="fraze">' + F.lista.map((f, i) => '<div class="fraza" data-i="' + i + '"><div class="fraza-text"><b>' + esc(f.en) + '</b><span>' + esc(f.ro) + '</span>' + (f.cand ? '<small>' + esc(f.cand) + '</small>' : '') + '</div>' +
    '<div class="fraza-butoane"><button class="buton-rotund mic" data-reda="' + i + '" aria-label="Ascultă">' + ICON.difuzor + '</button><button class="buton-rotund mic" data-card="' + i + '" aria-label="Adaugă la cartonașe">' + ICON.plus + '</button></div></div>').join('') + '</div>';
  $('#main').innerHTML = h;
  F.unitate = n;
  $$('[data-reda]').forEach((b) => { b.onclick = () => { reda(F.lista[Number(b.dataset.reda)].en, b); noteaza('fraza', n); }; });
  $$('[data-card]').forEach((b) => {
    b.onclick = async () => {
      const f = F.lista[Number(b.dataset.card)];
      try {
        await api('/api/engleza/carduri/adauga', { method: 'POST', body: { en: f.en, ro: f.ro } });
        b.classList.add('canta');
        b.innerHTML = ICON.bifa;
        toast('Adăugată la cartonașe.');
        incarcaStare().catch(() => {});
      } catch (e) { toast(e.message, true); }
    };
  });
  $('#reda-tot').onclick = async () => {
    const bt = $('#reda-tot');
    if (F.redaTot) { F.redaTot = false; opresteRedarea(); bt.innerHTML = textRedaTot(); return; }
    F.redaTot = true;
    bt.textContent = 'Oprește redarea';
    if (window.Aplicatie && window.Aplicatie.ecranAprins) window.Aplicatie.ecranAprins(true);
    for (let i = 0; i < F.lista.length && F.redaTot && ruta().v === 'fraze'; i++) {
      $$('.fraza').forEach((x) => x.classList.toggle('acum', Number(x.dataset.i) === i));
      const el = $('.fraza[data-i="' + i + '"]');
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      try { await redaSiAsteapta(F.lista[i].en); } catch (e) { toast(e.message || 'Nu pot reda.', true); break; }
      await new Promise((r) => setTimeout(r, 3500));
    }
    if (F.redaTot) noteaza('fraze', n);
    F.redaTot = false;
    $$('.fraza').forEach((x) => x.classList.remove('acum'));
    if (window.Aplicatie && window.Aplicatie.ecranAprins) window.Aplicatie.ecranAprins(false);
    const b2 = $('#reda-tot');
    if (b2) b2.innerHTML = textRedaTot();
  };
}

/* ------------------------------------------------------------ SETĂRI */
function foaieSetari() {
  strat('<h2>Setări</h2>' +
    '<label class="setare"><span>Obiectivul zilnic</span><select id="obiectiv">' + [15, 30, 45, 60, 90, 120].map((m) => '<option value="' + m + '"' + (setari.obiectiv === m ? ' selected' : '') + '>' + m + ' minute pe zi</option>').join('') + '</select></label>' +
    '<label class="setare"><span>Viteza profesorului <b id="viteza-val">' + setari.viteza.toFixed(2) + '×</b></span><input type="range" id="viteza" min="0.8" max="1.2" step="0.05" value="' + setari.viteza + '"></label>' +
    '<label class="setare"><span>Cum vorbești cu profesorul</span><select id="vorbire"><option value="buton"' + (setari.vorbire !== 'automat' ? ' selected' : '') + '>cu butonul (recomandat)</option><option value="automat"' + (setari.vorbire === 'automat' ? ' selected' : '') + '>automat: te ascultă tot timpul</option></select></label>' +
    '<label class="setare comutator"><input type="checkbox" id="corecturi"' + (setari.corecturi !== false ? ' checked' : '') + '><span>Corecturile le verifică examinatorul (mai sigur; cu butonul, profesorul răspunde cu ~2 s mai târziu)</span></label>' +
    '<label class="setare"><span>Doar în modul automat: te așteaptă când faci pauze</span><select id="rabdare"><option value="low"' + (setari.rabdare === 'low' ? ' selected' : '') + '>mult (recomandat)</option><option value="medium"' + (setari.rabdare === 'medium' ? ' selected' : '') + '>normal</option></select></label>' +
    '<label class="setare"><span>Microfonul</span><select id="zgomot"><option value="auto"' + (setari.zgomot === 'auto' ? ' selected' : '') + '>automat: recunosc căștile (recomandat)</option><option value="near_field"' + (setari.zgomot === 'near_field' ? ' selected' : '') + '>căști cu microfon</option><option value="far_field"' + (setari.zgomot === 'far_field' ? ' selected' : '') + '>telefonul în suport sau pe masă</option></select></label>' +
    '<div class="setare"><span>Te aude bine?</span><small class="mic">Citești o propoziție și vezi cât de clar te prinde, cu căștile și fără.</small><button class="buton mic-b" id="test-mic">' + ICON.mic + ' Testează microfonul</button></div>' +
    '<label class="setare comutator"><input type="checkbox" id="ecran"' + (setari.ecran ? ' checked' : '') + '><span>Ține ecranul aprins în timpul lecției</span></label>' +
    '<label class="setare comutator"><input type="checkbox" id="subtitrari"' + (setari.subtitrari ? ' checked' : '') + '><span>Arată textul conversației în lecție</span></label>' +
    '<label class="setare"><span>Ținta</span><select id="tinta"><option value="">automat: nivelul următor</option>' + ['B1', 'B2', 'C1'].map((t) => '<option value="' + t + '"' + (setari.tinta === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>' +
    '<div class="setare"><span>Programul de 20 de săptămâni</span><small class="mic">' + (S.stare && S.stare.program ? new Date(S.stare.program.inceput).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' }) + ' – ' + new Date(S.stare.program.sfarsit).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' }) : '') + '</small><button class="buton mic-b" id="reporneste">Repornește programul de azi</button></div>' +
    '<div class="setare"><span>Cele 100 de lecții</span><small class="mic">' + (S.stare && S.stare.curriculum && S.stare.curriculum.are_lectii ? facute(S.stare.curriculum.facute) + ' din ' + S.stare.curriculum.total + ' · potrivite pe ' + esc(nivelCurs(S.stare.curriculum.nivel)) : 'apar după testul de nivel') + '</small>' +
    (S.stare && (S.stare.are_nivel || (S.stare.curriculum && S.stare.curriculum.are_lectii)) ? '<button class="buton mic-b" id="refa-curs">Refă lecțiile pe nivelul de acum</button>' : '') + '</div>' +
    '<div class="setare"><span>Ceva nu merge cum trebuie?</span><small class="mic">Scrie-mi aici; citesc tot înainte să lucrez la aplicație.</small><button class="buton mic-b" id="parere">Spune-mi ce să îmbunătățesc</button></div>' +
    '<p class="mic">OpenAI: azi ' + dolari((S.stare && S.stare.cost_azi_usd) || 0) + ' · luna asta ' + dolari((S.stare && S.stare.cost_luna_usd) || 0) + '. Lecțiile scurte costă mai puțin pe minut: la fiecare replică, profesorul recitește toată conversația de până atunci. Modelul: ' + esc((S.stare && S.stare.model) || '') + ' · versiunea ' + VERSIUNE_APP + '.</p>' +
    '<button class="buton principal lat" id="inchide-setari">Gata</button>',
  () => {
    $('#obiectiv').onchange = (e) => { setari.obiectiv = Number(e.target.value); salveazaSetari(); };
    $('#viteza').oninput = (e) => { setari.viteza = Number(e.target.value); $('#viteza-val').textContent = setari.viteza.toFixed(2) + '×'; salveazaSetari(); };
    $('#rabdare').onchange = (e) => { setari.rabdare = e.target.value; salveazaSetari(); };
    $('#vorbire').onchange = (e) => { setari.vorbire = e.target.value; salveazaSetari(); };
    $('#corecturi').onchange = (e) => { setari.corecturi = e.target.checked; salveazaSetari(); };
    $('#zgomot').onchange = (e) => { setari.zgomot = e.target.value; salveazaSetari(); };
    $('#test-mic').onclick = () => { inchideStrat(); setTimeout(foaieTestMicrofon, 30); };
    $('#parere').onclick = () => { inchideStrat(); setTimeout(foaieFeedback, 30); };
    $('#ecran').onchange = (e) => { setari.ecran = e.target.checked; salveazaSetari(); };
    $('#subtitrari').onchange = (e) => { setari.subtitrari = e.target.checked; salveazaSetari(); };
    $('#tinta').onchange = (e) => { setari.tinta = e.target.value || undefined; salveazaSetari(); };
    $('#reporneste').onclick = async () => {
      if (!confirm('Repornești programul de 20 de săptămâni de azi? Lecțiile și progresul rămân; se schimbă doar săptămâna curentă.')) return;
      try {
        await api('/api/engleza/program', { method: 'POST', body: { inceput: 'azi' } });
        toast('Programul pornește de azi: săptămâna 1.');
        S.parcurs = null;
        await incarcaStare();
        inchideStrat();
        randeaza();
      } catch (e) { toast(e.message, true); }
    };
    const rc = $('#refa-curs');
    if (rc) rc.onclick = async () => {
      if (!confirm('Refaci lecțiile pe nivelul tău de acum? Bifele rămân pe pozițiile lor (lecția 1, 2, 3…), dar conținutul lecțiilor se schimbă.')) return;
      rc.disabled = true;
      try { await api('/api/engleza/curriculum/genereaza', { method: 'POST', body: {} }); toast('Le refac. Sunt gata în 1–2 minute.'); inchideStrat(); await incarcaStare(); randeaza(); } catch (e) { toast(e.message, true); rc.disabled = false; }
    };
    $('#inchide-setari').onclick = () => { inchideStrat(); if (ruta().v === 'acasa') randeaza(); };
  });
}

/* ------------------------------------------------------------ pornire */
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && L.faza === 'live') tineEcranul(); });
window.addEventListener('pagehide', () => { if (L.faza === 'live') salveazaLocal(); });
window.addEventListener('hashchange', randeaza);
window.addEventListener('resize', () => { if (ruta().v === 'parcurs' && S.parcurs) deseneazaHarta(S.parcurs); });

function noteaza(tip, unitate) {
  const corp = { tip };
  if (Number.isInteger(unitate)) corp.unitate = unitate;
  api('/api/engleza/activitate', { method: 'POST', body: corp }).catch(() => {});
}
function noteazaDeschiderea() {
  const azi = new Date().toLocaleDateString('sv-SE');
  try { if (localStorage.getItem('engleza.deschis') === azi) return; localStorage.setItem('engleza.deschis', azi); } catch (e) { /* ignor */ }
  noteaza('deschidere');
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && cfg) noteazaDeschiderea(); });
function legaturaPentruAplicatie() {
  try { if (cfg && window.Aplicatie && window.Aplicatie.legatura) window.Aplicatie.legatura(cfg.api, cfg.cheie); } catch (e) { /* nu e APK */ }
}
async function porneste() {
  $('#setari').onclick = foaieSetari;
  const p = citestePerechea();
  if (p) await imperecheaza(p);
  if (!cfg) return ecranNelegat();
  legaturaPentruAplicatie();
  noteazaDeschiderea();
  if (!location.hash || location.hash === '#') history.replaceState(null, '', '#/acasa');
  randeaza();
  if (ruta().v !== 'acasa') incarcaStare().catch(() => {});
  trimiteSesiuneaRamasa();
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.Aplicatie) navigator.serviceWorker.register('sw.js').catch(() => {});
}
porneste();

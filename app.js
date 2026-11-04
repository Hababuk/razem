import { t, getLang, setLang } from './i18n.js';
import { createStore, COLORS } from './store/index.js';
import { itemKey, parseQty } from './store/base.js';
import { CONFIG } from './config.js';
import * as R from './recur.js';
import { CATS, CAT_IDS, DEFAULT_LAYOUTS, guessCat, catLabel } from './cats.js';
import { parseReceipt } from './receipt.js';

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => R.ymd(new Date());
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const svg = (p, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${p}</svg>`;
const I = {
  today: svg('<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 5-5.5"/>'),
  cal: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>'),
  up: svg('<path d="m6 15 6-6 6 6"/>'), down: svg('<path d="m6 9 6 6 6-6"/>'),
  cart: svg('<path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L20.5 8H6"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 'stroke-width="2.4"'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 'stroke-width="3"'),
  left: svg('<path d="m15 6-6 6 6 6"/>'), right: svg('<path d="m9 6 6 6-6 6"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  rep: svg('<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11.5V10a4 4 0 0 1 4-4h13M7 21.5 3.5 18 7 14.5"/><path d="M20.5 12.5V14a4 4 0 0 1-4 4h-13"/>'),
  bell: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
  meal: svg('<path d="M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10M17 21V3c-2.2 0-3.5 2.5-3.5 6v4H17"/>'),
  stats: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  note: svg('<path d="M4 6h16M4 12h16M4 18h10"/>'),
};
let toastT;
function toast(msg, action) {
  const el = $('#toast'); el.textContent = msg;
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = () => { el.classList.remove('show'); action.fn(); }; el.appendChild(b); }
  el.classList.toggle('has-action', !!action); el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), action ? 4500 : 2400);
}
const fmt = (d, o) => new Intl.DateTimeFormat(getLang() === 'pl' ? 'pl-PL' : 'en-GB', o).format(R.parseYmd(d));
function dayTitle(d) {
  const td = todayStr();
  if (d === td) return t('today');
  if (d === R.addDays(td, 1)) return t('tomorrow');
  if (d === R.addDays(td, -1)) return t('yesterday');
  const s = fmt(d, { weekday: 'long' }); return s[0].toUpperCase() + s.slice(1);
}

/* ---------- state ---------- */
function weekMon(d) { const x = R.parseYmd(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return R.ymd(x); }
const ui = { view: 'today', day: todayStr(), lastToday: todayStr(), calMonth: todayStr().slice(0, 7), calDay: todayStr(),
  filter: 'all', calMode: localStorage.getItem('razem-calmode') || 'month', sumMonth: null, shopOrder: localStorage.getItem('razem-shoporder') || 'added', layoutStore: 'biedronka', mealWeek: weekMon(todayStr()), authMode: 'signIn', sheet: null, push: 'unknown', authErr: '', busy: false, pending: null };
let store, S;

const H = () => S.household || { members: [], names: {}, colors: {} };
const me = () => S.user?.uid;
const nameOf = uid => H().names?.[uid] || '?';
const colorOf = uid => H().colors?.[uid] || '#888';
const initial = uid => (nameOf(uid)[0] || '?').toUpperCase();
function avatar(a) {
  const m = H().members;
  if (!a || a === 'all') return `<span class="avatar all" title="${esc(t('both'))}" style="--c1:${colorOf(m[0])};--c2:${colorOf(m[1] || m[0])}"></span>`;
  return `<span class="avatar" title="${esc(nameOf(a))}" style="background:${colorOf(a)}">${esc(initial(a))}</span>`;
}
function repLabel(task) {
  const r = task.repeat; if (!R.isRecurring(task)) return '';
  const n = Math.max(1, parseInt(r.every) || 1);
  if (r.type === 'weekly') {
    const base = n > 1 ? t('rep_weeklyN', { n }) : t('rep_weekly');
    const days = (r.days || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    return days.length && days.length < 7 ? `${base} · ${days.map(i => t('days')[i]).join(' ')}` : base;
  }
  return n > 1 ? t(`rep_${r.type}N`, { n }) : t(`rep_${r.type}`);
}
function ring(pct, size = 76, stroke = 8) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = pct ?? 0;
  return `<svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--accent)" stroke-width="${stroke}" stroke-linecap="round"
    stroke-dasharray="${c}" stroke-dashoffset="${p >= 100 ? 0 : c * (1 - p / 100)}" ${p === 0 ? 'opacity="0"' : ''}/></svg>`;
}
const miniRing = pct => pct == null
  ? `<svg class="mini" viewBox="0 0 22 22"><circle cx="11" cy="11" r="8" fill="none" stroke="var(--line)" stroke-width="2.5" stroke-dasharray="2 3"/></svg>`
  : `<svg class="mini" viewBox="0 0 22 22" style="transform:rotate(-90deg)">${ring(pct, 22, 3.5).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>`;
const filterUid = () => ui.filter === 'all' ? null : ui.filter;

/* ---------- 24h time picker (native pickers show AM/PM on English phones) ---------- */
function timePicker(key, val, emptyLabel) {
  const [h, m] = val ? val.split(':') : ['', ''];
  const mins = Array.from({ length: 12 }, (_, i) => R.pad(i * 5));
  if (m && !mins.includes(m)) { mins.push(m); mins.sort(); }
  return `<span class="tsel" data-time="${key}"><select class="in" data-tp="h" aria-label="h">${emptyLabel != null ? `<option value="" ${!h ? 'selected' : ''}>${esc(emptyLabel)}</option>` : ''}${Array.from({ length: 24 }, (_, i) => R.pad(i)).map(x => `<option ${x === h ? 'selected' : ''}>${x}</option>`).join('')}</select><b>:</b><select class="in" data-tp="m" aria-label="min" ${!h ? 'disabled' : ''}>${mins.map(x => `<option ${x === (m || '00') ? 'selected' : ''}>${x}</option>`).join('')}</select></span>`;
}
// Native date input underneath (opens the phone's calendar), day-first label on top.
// Date order is a per-phone choice (Settings). Default follows the phone: US English -> month first.
const dateOrder = () => localStorage.getItem('razem-datefmt') || (/^en-us/i.test(navigator.language || '') ? 'mdy' : 'dmy');
const fmtDate = d => !d ? '' : dateOrder() === 'mdy' ? `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}` : `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
function datePicker(f, val, min) {
  return `<label class="dsel in"><span>${val ? esc(fmtDate(val)) + ` <small>${esc(fmt(val, { weekday: 'short' }))}</small>` : '<span class="muted">—</span>'}</span>${I.cal.replace('<svg', '<svg width="18" height="18"')}
    <input type="date" data-f="${f}" value="${val || ''}" ${min ? `min="${min}"` : ''}></label>`;
}
function readTime(w) { const h = w.querySelector('[data-tp=h]').value, m = w.querySelector('[data-tp=m]').value; return h ? `${h}:${m || '00'}` : ''; }

/* ---------- task rows ---------- */
function taskRow(task, date, { overdueRow = false, ask = false } = {}) {
  const occ = overdueRow ? task.date : date;
  const c = S.comps[R.compId(task.id, occ)];
  const done = c?.status === 'done', skip = c?.status === 'skip', missed = c?.status === 'missed';
  const meta = [];
  if (task.private) meta.push(`<span class="lockic" title="${esc(t('privateTask'))}">${I.lock}</span>`);
  if (task.time) {
    const late = !c && occ === todayStr() && R.toMin(task.time) < nowMin();
    meta.push(`<span class="time ${late ? 'late' : ''}">${esc(task.time)}</span>`);
  }
  if (overdueRow) meta.push(`<span class="late">${esc(fmt(task.date, { day: 'numeric', month: 'short' }))}</span>`);
  if (R.isRecurring(task)) meta.push(`<span>${I.rep} ${esc(repLabel(task))}</span>`);
  if (R.remindOffsets(task).length && !c) meta.push(`<span title="${esc(t('reminder'))}">${I.bell} ${esc(R.remindOffsets(task).slice().sort((a, b) => b - a).map(remLabel).join(', '))}</span>`);
  if (task.notes) meta.push(`<span>${I.note}</span>`);
  if (done && c.by) meta.push(`<span>${esc(t('doneBy', { n: nameOf(c.by), t: c.at ? new Date(c.at).toTimeString().slice(0, 5) : '' }))}</span>`);
  if (skip) meta.push(`<span>${esc(t('skippedLbl'))}</span>`);
  if (missed) meta.push(`<span class="late">${esc(t('missedLbl'))}${c.by ? ' · ' + esc(nameOf(c.by)) : ''}</span>`);
  return `<div class="task ${done ? 'done' : ''} ${skip ? 'skip' : ''} ${missed ? 'missed' : ''}">
    <button class="check" data-act="toggle" data-id="${task.id}" data-date="${occ}" aria-label="✓">${I.check}</button>
    <button class="tbody" data-act="edit" data-id="${task.id}" data-date="${occ}">
      <div class="ttitle">${esc(task.title)}</div>${meta.length ? `<div class="tmeta">${meta.join('')}</div>` : ''}${S.notes[R.compId(task.id, occ)] ? `<div class="tnote">“${esc(S.notes[R.compId(task.id, occ)].text)}”</div>` : ''}
    </button>${ask ? `<div class="ask"><button data-act="mark" data-s="missed" data-id="${task.id}" data-date="${occ}" aria-label="${esc(t('markMissed'))}">${I.x}</button><button class="ok" data-act="mark" data-s="done" data-id="${task.id}" data-date="${occ}" aria-label="${esc(t('markDone'))}">${I.check}</button></div>` : avatar(task.assignee)}</div>`;
}
function remLabel(m) { return m === 0 ? t('rAt') : m === 1440 ? t('rDay') : m === 2880 ? t('r2Day') : m % 60 === 0 ? t('rH', { h: m / 60 }) : t('rMin', { m }); }
function dayList(date) {
  const uid = filterUid();
  const items = S.tasks.filter(x => R.occursOn(x, date) && R.assignedTo(x, uid));
  const st = x => S.comps[R.compId(x.id, date)]?.status;
  const byTime = (a, b) => (a.time || '99').localeCompare(b.time || '99') || a.title.localeCompare(b.title);
  const timed = items.filter(x => !st(x) && x.time).sort(byTime);
  const any = items.filter(x => !st(x) && !x.time).sort(byTime);
  const fin = items.filter(x => st(x)).sort(byTime);
  const od = date === todayStr() ? R.overdue(S.tasks, S.comps, date, uid).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const yd = R.addDays(date, -1), unf = date === todayStr() ? R.unfinished(S.tasks, S.comps, yd, uid).sort(byTime) : [];
  let h = '';
  if (unf.length) h += `<div class="sec warn">${t('unfinishedY')}</div><div class="list">${unf.map(x => taskRow(x, yd, { ask: true })).join('')}</div>`;
  if (od.length) h += `<div class="sec warn">${t('overdue')}</div><div class="list">${od.map(x => taskRow(x, date, { overdueRow: true })).join('')}</div>`;
  if (timed.length) h += `<div class="sec">${t('scheduled')}</div><div class="list">${timed.map(x => taskRow(x, date)).join('')}</div>`;
  if (any.length) h += `<div class="sec">${t('anytime')}</div><div class="list">${any.map(x => taskRow(x, date)).join('')}</div>`;
  if (fin.length) h += `<div class="sec">${t('completed')}</div><div class="list">${fin.map(x => taskRow(x, date)).join('')}</div>`;
  if (!h) h = `<div class="empty"><div class="em">🌿</div><b>${t('nothingPlanned')}</b>${t('nothingHint')}</div>`;
  return h;
}
function filtersBar() {
  const m = H().members;
  if (m.length < 2) return '';
  return `<div class="filters"><button class="pill ${ui.filter === 'all' ? 'on' : ''}" data-act="filter" data-v="all">${t('everyone')}</button>
    ${m.map(u => `<button class="pill ${ui.filter === u ? 'on' : ''}" data-act="filter" data-v="${u}"><span class="dot" style="background:${colorOf(u)}"></span> ${esc(nameOf(u))}</button>`).join('')}</div>`;
}

/* ---------- views ---------- */
function viewToday() {
  const d = ui.day, td = todayStr(), uid = filterUid();
  const st = R.dayStats(S.tasks, S.comps, d, uid);
  const ws = R.parseYmd(d); ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7));
  let week = '';
  for (let i = 0; i < 7; i++) {
    const x = R.ymd(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i));
    const s = R.dayStats(S.tasks, S.comps, x, uid);
    week += `<button class="wd ${x === d ? 'sel' : ''} ${x === td ? 'today' : ''}" data-act="day" data-v="${x}">${t('days')[R.parseYmd(x).getDay()]}<b>${R.parseYmd(x).getDate()}</b>${x <= td ? miniRing(s.pct) : miniRing(null)}</button>`;
  }
  const people = H().members.length > 1 && ui.filter === 'all' ? `<div class="people">${H().members.map(u => {
    const s = R.dayStats(S.tasks, S.comps, d, u); return s.total ? `<span><span class="dot" style="background:${colorOf(u)}"></span>${esc(nameOf(u))} ${s.pct}%</span>` : '';
  }).join('')}</div>` : '';
  return `<div class="screen">
    <div class="topbar"><div><h1>${esc(dayTitle(d))}</h1><div class="sub">${esc(fmt(d, { day: 'numeric', month: 'long', year: 'numeric' }))}</div></div>
      <div style="display:flex">${d !== td ? `<button class="pill" data-act="day" data-v="${td}">${t('backToToday')}</button>` : ''}
      <button class="iconbtn" data-act="day" data-v="${R.addDays(d, -7)}" aria-label="prev">${I.left}</button><button class="iconbtn" data-act="day" data-v="${R.addDays(d, 7)}" aria-label="next">${I.right}</button></div></div>
    <div class="week">${week}</div>
    ${pushBanner()}
    ${st.total ? `<div class="progress"><div class="ring">${ring(st.pct)}<div class="pct">${st.pct}%</div></div>
      <div class="txt"><div class="big">${t('doneOf', { d: st.done, t: st.total })}</div>${people}</div></div>` : ''}
    ${d === td ? summaryCard() : ''}
    ${mealCard(d)}
    ${filtersBar()}
    ${dayList(d)}
  </div>`;
}
function mealCard(d) {
  const m = S.meals[d];
  if (m) return `<button class="mealcard" data-act="meal" data-v="${d}"><span class="mi">${I.meal}</span><span class="mt"><small>${t('tonight')}</small>${esc(m.name)}</span>${m.cook ? avatar(m.cook) : ''}</button>`;
  if (d < todayStr()) return '';
  return `<button class="mealcard empty-m" data-act="meal" data-v="${d}"><span class="mi">${I.meal}</span><span class="mt">${t('planDinner')}</span>${I.plus.replace('<svg', '<svg width="18" height="18"')}</button>`;
}
function pushBanner() {
  if (ui.push !== 'off' && ui.push !== 'ios') return '';
  if (localStorage.getItem('razem-banner-x')) return '';
  return `<div class="banner">${I.bell}<span>${ui.push === 'ios' ? t('notifIos') : t('notifBanner')}</span>
    ${ui.push === 'off' ? `<button data-act="push-on">${t('enable')}</button>` : ''}<button data-act="banner-x" aria-label="x" style="color:var(--ink3)">${I.x}</button></div>`;
}
function viewCalendar() { return ui.calMode === 'week' ? viewWeek() : viewMonth(); }
const sumBtn = () => `<button class="pill" data-act="summary" data-v="${(ui.calMode === 'week' ? weekMon(ui.calDay) : ui.calMonth + '-01').slice(0, 7)}">${I.stats.replace('<svg', '<svg width="14" height="14" style="vertical-align:-2px"')} ${t('monthSummary')}</button>`;
const calSeg = () => `<div class="seg" style="width:180px"><button class="${ui.calMode === 'week' ? 'on' : ''}" data-act="calmode" data-v="week">${t('week')}</button><button class="${ui.calMode === 'month' ? 'on' : ''}" data-act="calmode" data-v="month">${t('month')}</button></div>`;
function viewWeek() {
  const ws = weekMon(ui.calDay), td = todayStr(), uid = filterUid(), we = R.addDays(ws, 6);
  const title = `${fmt(ws, { day: 'numeric', month: ws.slice(5, 7) === we.slice(5, 7) ? undefined : 'short' })} – ${fmt(we, { day: 'numeric', month: 'short' })}`;
  let body = '';
  for (let i = 0; i < 7; i++) {
    const d = R.addDays(ws, i), st = R.dayStats(S.tasks, S.comps, d, uid);
    const items = S.tasks.filter(x => R.occursOn(x, d) && R.assignedTo(x, uid)).sort((a, b) => (a.time || '99').localeCompare(b.time || '99') || a.title.localeCompare(b.title));
    const meal = S.meals[d];
    body += `<div class="wk-day ${d === td ? 'today' : ''}">
      <div class="wk-h"><span><b>${esc(fmt(d, { weekday: 'short' }))}</b> ${R.parseYmd(d).getDate()}</span>${st.total && d <= td ? `<span class="wk-p">${miniRing(st.pct)} ${st.pct}%</span>` : ''}</div>
      ${meal ? `<button class="wk-meal" data-act="meal" data-v="${d}">${I.meal} ${esc(meal.name)}</button>` : ''}
      ${items.length ? `<div class="list">${items.map(x => taskRow(x, d)).join('')}</div>` : `<button class="wk-empty" data-act="newon" data-v="${d}">+</button>`}
    </div>`;
  }
  return `<div class="screen">
    <div class="topbar"><h1 style="font-size:24px">${esc(title)}</h1>
      <div style="display:flex"><button class="iconbtn" data-act="calday" data-v="${R.addDays(ws, -7)}">${I.left}</button><button class="iconbtn" data-act="calday" data-v="${R.addDays(ws, 7)}">${I.right}</button></div></div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px">${calSeg()}${ws !== weekMon(td) ? `<button class="pill" data-act="calday" data-v="${td}">${t('backToToday')}</button>` : sumBtn()}</div>
    ${filtersBar()}${body}</div>`;
}
function viewSummary() {
  const td = todayStr(), cur = td.slice(0, 7), ym = ui.sumMonth || cur, uid = filterUid();
  const opts = m => ({ uid, upTo: m === cur ? td : null });
  const st = R.monthStats(S.tasks, S.comps, ym, opts(ym));
  const pm = R.prevMonth(ym), ps = R.monthStats(S.tasks, S.comps, pm, opts(pm));
  const [y, m] = ym.split('-').map(Number), mName = mm => t('months')[+mm.slice(5) - 1];
  const delta = st.total.pct != null && ps.total.pct != null ? st.total.pct - ps.total.pct : null;
  const dTxt = (d, ref) => d == null ? '' : `<span class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '↑' : d < 0 ? '↓' : '='} ${Math.abs(d)} ${t('pts')}${ref ? ' ' + esc(t('vsMonth', { m: ref.toLowerCase() })) : ''}</span>`;
  const hist = []; for (let i = 5, k = ym; i >= 0; i--) { hist.unshift(k); k = R.prevMonth(k); }
  const bars = hist.map(k => ({ k, p: R.monthStats(S.tasks, S.comps, k, opts(k)).total.pct }));
  const anyHist = bars.filter(b => b.p != null).length > 1;
  const people = H().members.length > 1 && ui.filter === 'all' ? `<div class="people">${H().members.map(u => {
    const s2 = R.monthStats(S.tasks, S.comps, ym, { uid: u, upTo: ym === cur ? td : null }).total; return s2.pct != null ? `<span><span class="dot" style="background:${colorOf(u)}"></span>${esc(nameOf(u))} ${s2.pct}%</span>` : '';
  }).join('')}</div>` : '';
  const prevRows = Object.fromEntries(ps.rows.map(r => [r.task.id, r.pct]));
  const rows = st.rows.slice().sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101) || a.task.title.localeCompare(b.task.title));
  const T = st.total, next = ym < cur ? R.ymd(new Date(y, m, 1)).slice(0, 7) : null;
  return `<div class="screen">
    <div class="topbar"><div style="display:flex;align-items:center;gap:4px"><button class="iconbtn" data-act="view" data-v="calendar" aria-label="back">${I.left}</button>
      <div><h1 style="font-size:24px">${esc(mName(ym))} <span style="color:var(--ink3);font-weight:500">${y}</span></h1><div class="sub">${t('monthSummary')}${ym === cur ? ' · ' + t('soFar') : ''}</div></div></div>
      <div style="display:flex"><button class="iconbtn" data-act="summary" data-v="${pm}">${I.left}</button>${next ? `<button class="iconbtn" data-act="summary" data-v="${next}">${I.right}</button>` : ''}</div></div>
    ${filtersBar()}
    ${T.occ ? `<div class="progress"><div class="ring">${ring(T.pct)}<div class="pct">${T.pct ?? '–'}%</div></div>
      <div class="txt"><div class="big">${t('doneOf', { d: T.done, t: T.occ - T.skip })}</div>${dTxt(delta, mName(pm))}${people}</div></div>
    <div class="counts"><div><b>${T.done}</b>${t('completed')}</div><div><b>${T.missed}</b>${t('markMissed')}</div><div><b>${T.open}</b>${t('notMarked')}</div><div><b>${T.skip}</b>${t('skipped')}</div></div>
    ${anyHist ? `<div class="sec">${t('monthOverMonth')}</div><div class="mom">${bars.map(b => `<button class="mb ${b.k === ym ? 'sel' : ''} ${b.p == null ? 'nodata' : ''}" data-act="summary" data-v="${b.k}"><span class="mv">${b.p != null ? b.p + '%' : '–'}</span><span class="mbar"><i style="height:${b.p ?? 0}%"></i></span><span class="ml">${esc(mName(b.k).slice(0, 3))}</span></button>`).join('')}</div>` : ''}
    <div class="sec">${t('allTasks')}</div>
    <div class="list">${rows.map(r => `<div class="srow2"><div class="sr-main"><div class="ttitle">${esc(r.task.title)}</div>
        <div class="tmeta"><span>${R.isRecurring(r.task) ? `${r.done}/${r.occ - r.skip}` : esc(r.done ? t('completed') : r.missed ? t('markMissed') : r.skip ? t('skipped') : t('notMarked'))}</span>${r.missed && R.isRecurring(r.task) ? `<span class="late">✕ ${r.missed}</span>` : ''}${r.open && R.isRecurring(r.task) ? `<span>${t('notMarked').toLowerCase()} ${r.open}</span>` : ''}${prevRows[r.task.id] != null && r.pct != null ? dTxt(r.pct - prevRows[r.task.id]) : ''}</div>
        <div class="sbar"><i style="width:${r.pct ?? 0}%"></i></div></div><span class="spct">${r.pct ?? '–'}%</span>${avatar(r.task.assignee)}</div>`).join('')}</div>`
    : `<div class="empty"><div class="em">📅</div><b>${t('noTasksMonth')}</b></div>`}
  </div>`;
}
function summaryCard() { // on Today during the first week of a month, until opened or dismissed
  const td = todayStr(); if (+td.slice(8) > 7) return '';
  const pm = R.prevMonth(td.slice(0, 7)); if (localStorage.getItem('razem-sum-seen') === pm) return '';
  const st = R.monthStats(S.tasks, S.comps, pm).total; if (!st.occ || st.pct == null) return '';
  const pp = R.monthStats(S.tasks, S.comps, R.prevMonth(pm)).total.pct, d = pp != null ? st.pct - pp : null;
  return `<div class="sumcard"><button class="sc-main" data-act="summary-open" data-v="${pm}"><span class="mi">${I.stats}</span>
    <span class="mt"><small>${esc(t('summaryReady', { m: t('months')[+pm.slice(5) - 1] }))}</small>${st.pct}% ${d != null ? `<span class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '↑' : d < 0 ? '↓' : '='} ${Math.abs(d)} ${t('pts')}</span>` : ''}</span></button>
    <button class="iconbtn" data-act="summary-x" data-v="${pm}" aria-label="x">${I.x}</button></div>`;
}
function viewMonth() {
  const [y, m] = ui.calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1), td = todayStr(), uid = filterUid();
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const lastDay = new Date(y, m, 0);
  const cells = Math.ceil((((first.getDay() + 6) % 7) + lastDay.getDate()) / 7) * 7;
  let grid = '', sum = 0, cnt = 0;
  for (let i = 0; i < cells; i++) {
    const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), d = R.ymd(dt);
    const s = R.dayStats(S.tasks, S.comps, d, uid), inM = dt.getMonth() === m - 1;
    if (inM && d <= td && s.total) { sum += s.pct; cnt++; }
    const ind = !s.total ? '<div class="dots"></div>'
      : d <= td ? `<div class="bar"><i style="width:${s.pct}%"></i></div>` : `<div class="dots">${'•'.repeat(Math.min(s.total, 4))}</div>`;
    grid += `<button class="cd ${inM ? '' : 'out'} ${d === ui.calDay ? 'sel' : ''} ${d === td ? 'today' : ''}" data-act="calday" data-v="${d}"><span class="n">${dt.getDate()}</span>${ind}</button>`;
  }
  const head = [1, 2, 3, 4, 5, 6, 0].map(i => `<div>${t('days')[i]}</div>`).join('');
  const prev = R.ymd(new Date(y, m - 2, 1)).slice(0, 7), next = R.ymd(new Date(y, m, 1)).slice(0, 7);
  const ds = R.dayStats(S.tasks, S.comps, ui.calDay, uid);
  return `<div class="screen">
    <div class="topbar"><h1>${t('months')[m - 1]} <span style="color:var(--ink3);font-weight:500">${y}</span></h1>
      <div style="display:flex"><button class="iconbtn" data-act="month" data-v="${prev}">${I.left}</button><button class="iconbtn" data-act="month" data-v="${next}">${I.right}</button></div></div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px">${calSeg()}${sumBtn()}</div>
    ${filtersBar()}
    <div class="cal"><div class="cal-head">${head}</div><div class="cal-grid">${grid}</div>
      ${cnt ? `<div class="month-sum">${t('monthAvg', { p: Math.round(sum / cnt) })}</div>` : ''}</div>
    <div class="sec" style="margin-top:20px">${esc(dayTitle(ui.calDay))}, ${esc(fmt(ui.calDay, { day: 'numeric', month: 'long' }))}${ds.total && ui.calDay <= td ? ` · ${ds.pct}%` : ''}</div>
    ${dayList(ui.calDay)}
  </div>`;
}
function viewMeals() {
  const ws = ui.mealWeek, td = todayStr(), we = R.addDays(ws, 6);
  let rows = '';
  for (let i = 0; i < 7; i++) {
    const d = R.addDays(ws, i), m = S.meals[d];
    rows += `<button class="meal-row ${d === td ? 'today' : ''} ${d < td ? 'past' : ''}" data-act="meal" data-v="${d}">
      <span class="md"><b>${esc(fmt(d, { weekday: 'short' }))}</b><span>${R.parseYmd(d).getDate()}</span></span>
      <span class="mn">${m ? esc(m.name) : `<span class="muted">${d < td ? t('noMeal') : '+ ' + t('planDinner')}</span>`}</span>
      ${m?.cook ? avatar(m.cook) : ''}</button>`;
  }
  const recs = [...S.recipes].sort((a, b) => (b.uses || 0) - (a.uses || 0) || a.name.localeCompare(b.name));
  return `<div class="screen">
    <div class="topbar"><div><h1>${t('meals')}</h1><div class="sub">${esc(fmt(ws, { day: 'numeric', month: 'short' }))} – ${esc(fmt(we, { day: 'numeric', month: 'short' }))}</div></div>
      <div style="display:flex">${ws !== weekMon(td) ? `<button class="pill" data-act="mealweek" data-v="${weekMon(td)}">${t('backToToday')}</button>` : ''}
      <button class="iconbtn" data-act="mealweek" data-v="${R.addDays(ws, -7)}">${I.left}</button><button class="iconbtn" data-act="mealweek" data-v="${R.addDays(ws, 7)}">${I.right}</button></div></div>
    <div class="list">${rows}</div>
    ${recs.length ? `<div class="sec">${t('savedMeals')}</div><div class="hint" style="margin:-4px 4px 10px">${t('savedHint')}</div>
      <div class="list">${recs.map(r => `<div class="item"><button class="name" data-act="recipe" data-id="${r.id}">${esc(r.name)} <span class="muted">· ${t('ingN', { n: (r.ingredients || []).length })}</span></button>
        <button class="x" data-act="recipe-del" data-id="${r.id}" aria-label="${t('delete')}">${I.x}</button></div>`).join('')}</div>` : ''}
  </div>`;
}
const STORES = [['biedronka', 'Biedronka', 'B'], ['lidl', 'Lidl', 'L']];
const money = v => v.toLocaleString(getLang() === 'pl' ? 'pl-PL' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const priceOf = name => S.products[itemKey(name)] || null;
const catOf = name => S.products[itemKey(name)]?.cat || guessCat(parseQty(name).name);
const layoutOf = st => { const l = H().layouts?.[st]; return l && l.length ? [...l, ...CAT_IDS.filter(c => !l.includes(c))] : DEFAULT_LAYOUTS[st]; };
function priceHints(i) {
  const p = priceOf(i.name), q = parseQty(i.name).qty;
  const vals = STORES.map(([k, , ab]) => [ab, p?.[k]?.price]).filter(x => x[1] != null);
  if (!vals.length) return `<button class="pmeta add" data-act="price" data-id="${i.id}">+ ${t('price')}</button>`;
  const min = Math.min(...vals.map(v => v[1]));
  return `<button class="pmeta" data-act="price" data-id="${i.id}">${vals.map(([ab, v]) => `<span class="${vals.length > 1 && v === min ? 'cheap' : ''}">${ab} ${money(v * q)}</span>`).join('')}</button>`;
}
function shopTotals(items) {
  if (!items.length || !Object.keys(S.products).length) return '';
  const tot = STORES.map(([k, label]) => {
    let sum = 0, n = 0;
    for (const i of items) { const v = priceOf(i.name)?.[k]?.price; if (v != null) { sum += v * parseQty(i.name).qty; n++; } }
    return { label, sum, n };
  }).filter(x => x.n);
  if (!tot.length) return '';
  const full = tot.filter(x => x.n === items.length), best = full.length > 1 ? Math.min(...full.map(x => x.sum)) : null;
  return `<div class="totals">${tot.map(x => `<div class="${x.sum === best ? 'best' : ''} ${STORES.find(s => s[1] === x.label)?.[0] === ui.shopOrder ? 'sel' : ''}"><small>${x.label}</small><b>~${money(x.sum)} zł</b>${x.n < items.length ? `<small>${t('pricedN', { n: x.n, t: items.length })}</small>` : ''}</div>`).join('')}</div>`;
}
function groupedByAisle(items, row) {
  const order = layoutOf(ui.shopOrder), groups = {};
  for (const i of items) (groups[catOf(i.name)] ||= []).push(i);
  return order.filter(c => groups[c]).map(c => `<div class="sec aisle">${esc(catLabel(c, getLang()))}</div><div class="list">${groups[c].map(row).join('')}</div>`).join('');
}
// Suggestions come from the shared product memory (everything either of you has ever added), most-used first.
const normQ = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').trim();
function suggestions(q) {
  const onList = new Set(S.shopping.filter(i => !i.done).map(i => itemKey(i.name)));
  const all = Object.entries(S.products).filter(([k, p]) => p.name && !onList.has(k));
  const { qty, name } = parseQty(q || ''), nq = normQ(name);
  let list;
  if (!nq) list = all.filter(([, p]) => p.uses).sort((a, b) => (b[1].uses || 0) - (a[1].uses || 0)).slice(0, 8);
  else list = all.map(([k, p]) => { const n = normQ(p.name), i = n.indexOf(nq); return [k, p, i === 0 ? 0 : i > 0 && /[^a-z0-9]/.test(n[i - 1]) ? 1 : i > 0 ? 2 : -1]; })
    .filter(x => x[2] >= 0 && normQ(x[1].name) !== nq).sort((a, b) => a[2] - b[2] || (b[1].uses || 0) - (a[1].uses || 0)).slice(0, 6);
  return list.map(([, p]) => (qty > 1 ? `${qty}x ` : '') + p.name);
}
function suggHtml(q) {
  const list = suggestions(q);
  if (!list.length) return '';
  return q && q.trim()
    ? `<div class="ac">${list.map(n => `<button type="button" data-act="sugg" data-v="${esc(n)}"><span>${esc(catLabel(catOf(n), getLang()).split(' ')[0])}</span>${esc(n)}</button>`).join('')}</div>`
    : `<div class="sugg">${list.map(n => `<button type="button" data-act="sugg" data-v="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div>`;
}
function viewShopping() {
  const active = S.shopping.filter(i => !i.done).sort((a, b) => a.at - b.at);
  const done = S.shopping.filter(i => i.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const row = i => `<div class="item ${i.done ? 'done' : ''}" data-lp="${i.id}"><button class="check" data-act="item" data-id="${i.id}">${I.check}</button>
    <div class="iname"><button class="name" data-act="item" data-id="${i.id}">${esc(i.name)}</button>${i.done ? '' : priceHints(i)}</div><button class="x" data-act="item-del" data-id="${i.id}" aria-label="${t('delete')}">${I.x}</button></div>`;
  return `<div class="screen">
    <div class="topbar"><h1>${t('shopping')}</h1><button class="iconbtn" data-act="receipt" aria-label="${esc(t('scanReceipt'))}" title="${esc(t('scanReceipt'))}">${I.camera}</button></div>
    <input type="file" id="receipt-in" accept="image/*" hidden>
    <form class="add-row" data-form="shop"><input id="shop-in" autocomplete="off" autocorrect="off" enterkeyhint="done" placeholder="${esc(t('addItem'))}" value="${esc(ui.shopQ || '')}"><button type="submit" aria-label="+">${I.plus}</button></form>
    <div id="shop-sugg">${suggHtml(ui.shopQ)}</div>
    ${shopTotals(active)}
    ${active.length > 1 ? `<div class="seg" style="margin-bottom:12px"><button class="${ui.shopOrder === 'added' ? 'on' : ''}" data-act="shoporder" data-v="added">${t('orderAdded')}</button>${STORES.map(([k, label]) => `<button class="${ui.shopOrder === k ? 'on' : ''}" data-act="shoporder" data-v="${k}">${label}</button>`).join('')}</div>` : ''}
    ${active.length ? (ui.shopOrder === 'added' ? `<div class="list">${active.map(row).join('')}</div>` : groupedByAisle(active, row)) : `<div class="empty"><div class="em">🧺</div><b>${t('emptyList')}</b>${t('emptyListHint')}</div>`}
    ${done.length ? `<div class="sec">${t('inCart')} <button class="linkbtn" data-act="clear-cart">${t('clearCart')}</button></div><div class="list">${done.map(row).join('')}</div>` : ''}
  </div>`;
}
function viewSettings() {
  const h = H(), uid = me();
  const pushTxt = { on: t('notifOn'), off: t('notifOff'), ios: t('notifIos'), denied: t('notifDenied'), unsupported: t('notifUnsupported'), unknown: '…' }[ui.push];
  const timeSel = (key, val) => timePicker(key, val, t('offOpt'));
  return `<div class="screen">
    <div class="topbar"><h1>${t('settings')}</h1></div>
    ${store.demo ? `<div class="demo-note">${t('demo')} <button class="linkbtn" data-act="reset-demo">${t('resetDemo')}</button></div>` : ''}
    <div class="card"><h3>${t('household')}</h3>
      <div class="field"><label>${t('yourName')}</label><input class="in" id="my-name" value="${esc(nameOf(uid))}" maxlength="24"></div>
      <div class="lbl">${t('yourColor')}</div>
      <div class="swatches">${COLORS.map(c => `<button class="sw ${colorOf(uid) === c ? 'on' : ''}" style="background:${c}" data-act="color" data-v="${c}"></button>`).join('')}</div>
      <div style="margin-top:16px" class="lbl">${t('invite')}</div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="code">${esc(h.id)}</span>
        <button class="pill" data-act="copy-code">${t('copy')}</button>${navigator.share ? `<button class="pill" data-act="share-code">${t('share')}</button>` : ''}</div>
      <div class="hint">${t('inviteHint')}</div>
      <div class="people" style="margin-top:10px">${h.members.map(u => `<span><span class="dot" style="background:${colorOf(u)}"></span>${esc(nameOf(u))}</span>`).join('')}</div>
    </div>
    <div class="card"><h3>${t('notifications')}</h3>
      <div class="muted" style="margin-bottom:10px">${esc(pushTxt)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${ui.push === 'off' ? `<button class="btn primary" data-act="push-on">${t('enable')}</button>` : ''}
        ${ui.push === 'on' ? `<button class="btn ghost" data-act="push-off">${t('disable')}</button><button class="btn ghost" data-act="push-test">${t('test')}</button>` : ''}
      </div>
      ${!CONFIG.vapidPublicKey && !store.demo ? `<div class="hint">${t('notifNoKey')}</div>` : ''}
      <div class="srow" style="margin-top:12px;border-top:1px solid var(--line)"><span>${t('morning')}</span>${timeSel('morningAt', h.morningAt)}</div>
      <div class="srow"><span>${t('evening')}</span>${timeSel('eveningAt', h.eveningAt)}</div>
    </div>
    <div class="card"><h3>${t('storeLayout')}</h3><div class="muted" style="margin-bottom:10px">${t('storeLayoutHint')}</div>
      <div class="seg" style="margin-bottom:10px">${STORES.map(([k, l]) => `<button class="${ui.layoutStore === k ? 'on' : ''}" data-act="layoutstore" data-v="${k}">${l}</button>`).join('')}</div>
      ${layoutOf(ui.layoutStore).map((c, i, a) => `<div class="srow"><span><span class="muted" style="display:inline-block;width:22px">${i + 1}.</span>${esc(catLabel(c, getLang()))}</span>
        <span style="display:flex"><button class="iconbtn" data-act="aisle" data-c="${c}" data-v="-1" ${i === 0 ? 'disabled style="opacity:.25"' : ''}>${I.up}</button><button class="iconbtn" data-act="aisle" data-c="${c}" data-v="1" ${i === a.length - 1 ? 'disabled style="opacity:.25"' : ''}>${I.down}</button></span></div>`).join('')}
      <button class="linkbtn" style="margin-top:8px" data-act="aisle-reset">${t('resetLayout')}</button></div>
    <div class="card"><h3>${t('data')}</h3><div class="muted" style="margin-bottom:10px">${t('exportHint')}</div>
      <button class="btn ghost" data-act="export">${t('export')}</button></div>
    <div class="card"><h3>${t('dateFormat')}</h3>
      <div class="seg">${[['mdy', '11/04/2026'], ['dmy', '04.11.2026']].map(([v, l]) => `<button class="${dateOrder() === v ? 'on' : ''}" data-act="datefmt" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="hint">${t('dateFormatHint')}</div></div>
    <div class="card"><h3>${t('language')}</h3>
      <div class="seg"><button class="${getLang() === 'pl' ? 'on' : ''}" data-act="lang" data-v="pl">Polski</button><button class="${getLang() === 'en' ? 'on' : ''}" data-act="lang" data-v="en">English</button></div>
    </div>
    ${store.demo ? '' : `<div class="card"><h3>${t('account')}</h3><div class="muted" style="margin-bottom:10px">${esc(S.user?.email)}</div>
      <button class="btn ghost" data-act="sign-out">${t('signOut')}</button></div>`}
  </div>`;
}
function viewAuth() {
  const up = ui.authMode === 'signUp';
  return `<div class="auth"><div class="langsw">${['pl', 'en'].map(l => `<button class="${getLang() === l ? 'on' : ''}" data-act="lang" data-v="${l}">${l.toUpperCase()}</button>`).join('')}</div><img class="logo" src="icons/icon-192.png" alt=""><h1>${t('welcome')}</h1><p class="lead">${t('welcomeHint')}</p>
    <form data-form="auth">
      <div class="field"><label>${t('email')}</label><input class="in" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label>${t('password')}</label><input class="in" name="pw" type="password" minlength="6" autocomplete="${up ? 'new-password' : 'current-password'}" required></div>
      <div class="err">${esc(ui.authErr)}</div>
      <button class="btn primary block" ${ui.busy ? 'disabled' : ''}>${up ? t('signUp') : t('signIn')}</button>
    </form>
    <div style="display:flex;justify-content:space-between;margin-top:16px">
      <button class="linkbtn" data-act="auth-mode">${up ? t('haveAccount') : t('noAccount')}</button>
      ${up ? '' : `<button class="linkbtn" style="color:var(--ink2)" data-act="forgot">${t('forgot')}</button>`}</div></div>`;
}
function viewOnboard() {
  return `<div class="auth"><div class="langsw">${['pl', 'en'].map(l => `<button class="${getLang() === l ? 'on' : ''}" data-act="lang" data-v="${l}">${l.toUpperCase()}</button>`).join('')}</div><img class="logo" src="icons/icon-192.png" alt=""><h1>${t('welcome')}</h1><p class="lead">${t('welcomeHint')}</p>
    <div class="field"><label>${t('yourName')}</label><input class="in" id="ob-name" maxlength="24"></div>
    <div class="err">${esc(ui.authErr)}</div>
    <button class="btn primary block" data-act="create-home" ${ui.busy ? 'disabled' : ''}>${t('createHome')}</button>
    <div class="or">— ${t('joinHome').toLowerCase()} —</div>
    <div class="row"><input class="in code" id="ob-code" placeholder="${t('code')}" autocapitalize="characters" maxlength="8" style="font-size:18px">
      <button class="btn ghost" style="flex:none" data-act="join-home" ${ui.busy ? 'disabled' : ''}>${t('join')}</button></div>
    <div style="margin-top:28px;text-align:center"><button class="linkbtn" style="color:var(--ink2)" data-act="sign-out">${t('signOut')}</button></div></div>`;
}
function nav() {
  const n = S.shopping.filter(i => !i.done).length;
  const b = (v, icon, label, badge = '') => `<button class="${ui.view === v || (v === 'calendar' && ui.view === 'summary') ? 'on' : ''}" data-act="view" data-v="${v}">${icon}<span>${label}</span>${badge}</button>`;
  return `<nav class="nav"><div class="nav-in">${b('today', I.today, t('today'))}${b('calendar', I.cal, t('calendar'))}${b('meals', I.meal, t('meals'))}
    ${b('shopping', I.cart, t('shopping'), n ? `<span class="badge">${n}</span>` : '')}${b('settings', I.gear, t('settings'))}</div></nav>
    ${ui.view === 'today' || ui.view === 'calendar' ? `<button class="fab" data-act="new" aria-label="${t('newTask')}">${I.plus}</button>` : ''}`;
}

/* ---------- render ---------- */
function render() {
  document.documentElement.lang = getLang();
  const app = $('#app');
  const a = document.activeElement, keep = a && a.id && app.contains(a) ? { id: a.id, v: a.value, s: a.selectionStart } : null;
  if (S.phase === 'loading') app.innerHTML = '<div class="boot"><div class="spinner"></div></div>';
  else if (S.phase === 'signedOut') app.innerHTML = viewAuth();
  else if (S.phase === 'noHousehold') app.innerHTML = viewOnboard();
  else app.innerHTML = { today: viewToday, calendar: viewCalendar, meals: viewMeals, shopping: viewShopping, settings: viewSettings, summary: viewSummary }[ui.view]() + nav();
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.value = keep.v; el.focus(); try { el.setSelectionRange(keep.s, keep.s); } catch { } } }
}

/* ---------- task sheet ---------- */
function openTask(task, ctxDate, onDate) {
  const base = onDate || (ui.view === 'calendar' ? ui.calDay : ui.day);
  const draft = task ? structuredClone(task) : {
    title: '', notes: '', date: base < todayStr() ? todayStr() : base, time: '', repeat: { type: 'none', every: 1, days: [] }, until: '',
    assignee: me(), remind: R.defaultRemind(false)
  };
  draft.repeat ||= { type: 'none', every: 1, days: [] }; draft.repeat.days ||= [];
  draft.remind = { ...R.defaultRemind(R.isRecurring(draft)), ...(draft.remind || {}) };
  if (!Array.isArray(draft.remind.offsets)) draft.remind.offsets = [draft.remind.before || 0];
  draft._remTouched = !!task;
  draft.time ||= ''; draft.until ||= ''; draft.notes ||= '';
  ui.sheet = { kind: 'task', draft, ctxDate: ctxDate || null, isNew: !task, dayNote: task && ctxDate ? (S.notes[R.compId(task.id, ctxDate)]?.text || '') : '', focusNote: false };
  renderSheet(true);
}
function closeSheet() { ui.sheet = null; $('#sheet-root').innerHTML = ''; }
function renderSheet(first) {
  const root = $('#sheet-root'); if (!ui.sheet) { root.innerHTML = ''; return; }
  if (ui.sheet.kind === 'meal') return renderMealSheet(first);
  if (ui.sheet.kind === 'price') return renderPriceSheet(first);
  if (ui.sheet.kind === 'receipt') return renderReceiptSheet(first);
  const { draft: d, ctxDate, isNew } = ui.sheet, r = d.repeat;
  const scroll = $('.sheet-b', root)?.scrollTop || 0;
  const seg = (k, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" class="${String(cur) === String(v) ? 'on' : ''}" data-sact="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const unit = { daily: t('unitDay'), weekly: t('unitWeek'), monthly: t('unitMonth') }[r.type];
  const m = H().members;
  const comp = ctxDate ? S.comps[R.compId(d.id, ctxDate)] : null;
  const opt = (v, l, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`;
  root.innerHTML = `<div class="scrim" data-sact="close"></div>
  <div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>
    <div class="sheet-h"><h2>${isNew ? t('newTask') : t('editTask')}</h2><button class="iconbtn" data-sact="close" aria-label="${t('cancel')}">${I.x}</button></div>
    <div class="sheet-b">
      <div class="field"><input class="in title" id="f-title" data-f="title" value="${esc(d.title)}" placeholder="${esc(t('title'))}" maxlength="120" enterkeyhint="done"></div>
      ${m.length > 1 ? `<button type="button" class="privtog ${d.private ? 'on' : ''}" data-sact="private">${I.lock}<span><b>${t('privateTask')}</b><small>${t(d.private ? 'privateOn' : 'privateOff')}</small></span><i class="sw2"></i></button>` : ''}
      <div class="row field"><div><label>${t('date')}</label>${datePicker('date', d.date)}</div>
        <div><label>${t('time')}${d.time ? ` · <button type="button" class="linkbtn" data-sact="clear-time">${t('clear')}</button>` : ''}</label>${timePicker('task', d.time, '—')}</div></div>
      <div class="field"><label>${t('repeat')}</label>
        ${seg('rtype', [['none', t('rNone')], ['daily', t('rDaily')], ['weekly', t('rWeekly')], ['monthly', t('rMonthly')]], r.type)}
        ${r.type === 'weekly' ? `<div class="chips" style="margin-top:10px">${[1, 2, 3, 4, 5, 6, 0].map(i => `<button type="button" class="chip day ${r.days.includes(i) ? 'on' : ''}" data-sact="wday" data-v="${i}">${t('days')[i]}</button>`).join('')}</div>` : ''}
        ${r.type !== 'none' ? `<div class="inline-every">${t('every')} <input class="in" type="number" min="1" max="99" inputmode="numeric" data-f="every" value="${r.every || 1}"> ${unit}</div>
          <div style="margin-top:10px"><label class="lbl">${t('ends')}</label>${datePicker('until', d.until, d.date)}</div>` : ''}
      </div>
      ${m.length > 1 && !d.private ? `<div class="field"><label>${t('who')}</label><div class="chips">
        <button type="button" class="chip ${d.assignee === 'all' ? 'on' : ''}" data-sact="who" data-v="all">${t('both')}</button>
        ${m.map(u => `<button type="button" class="chip ${d.assignee === u ? 'on' : ''}" data-sact="who" data-v="${u}"><span class="dot" style="background:${colorOf(u)}"></span>${esc(nameOf(u))}</button>`).join('')}</div></div>` : ''}
      <div class="field"><label>${t('remindBefore')}</label>
        ${d.time ? `<div class="chips">${[0, 5, 15, 30, 60, 120, 1440, 2880].map(v => `<button type="button" class="chip ${d.remind.on && d.remind.offsets.includes(v) ? 'on' : ''}" data-sact="off" data-v="${v}">${esc(remLabel(v))}</button>`).join('')}</div>
          <div style="margin-top:12px"><label class="lbl">${t('followUp')}</label><select class="in" data-f="nag">${[[0, t('fuOff')], [-30, t('fuOnce', { m: 30 })], [-60, t('fuOnce', { m: 60 })], [15, t('fuEvery', { m: 15 })], [30, t('fuEvery', { m: 30 })], [60, t('fuEvery', { m: 60 })], [120, t('fuEvery', { m: 120 })]].map(([v, l]) => opt(v, l, d.remind.nag || 0)).join('')}</select>
          <div class="hint">${t('remHint')}</div></div>`
          : `<div class="hint" style="margin-top:0">${t('nagNeedsTime')}</div>`}
      </div>
      ${ctxDate && !isNew ? `<div class="field"><label>${esc(t('dayNote', { d: dayTitle(ctxDate).toLowerCase() === t('today').toLowerCase() ? t('today').toLowerCase() : fmtDate(ctxDate) }))}</label><textarea class="in" id="f-daynote" data-f="dayNote" rows="2" placeholder="${esc(t('dayNoteHint'))}">${esc(ui.sheet.dayNote)}</textarea></div>` : ''}
      <div class="field"><label>${t('taskNote')}</label><textarea class="in" data-f="notes" placeholder="${esc(t('notes'))}" rows="2">${esc(d.notes)}</textarea></div>
      ${!isNew ? `<div style="display:flex;gap:8px;flex-wrap:wrap">
        ${ctxDate && comp?.status !== 'missed' ? `<button type="button" class="btn ghost" data-sact="missed">${t('notDoneBtn')}</button>` : ''}
        ${ctxDate && R.isRecurring(d) ? `<button type="button" class="btn ghost" data-sact="skip">${comp?.status === 'skip' ? t('unskipDay') : t('skipDay')}</button>` : ''}
        <button type="button" class="btn danger" data-sact="delete">${t('delete')}</button></div>` : ''}
    </div>
    <div class="sheet-f"><button type="button" class="btn ghost" data-sact="close">${t('cancel')}</button><button type="button" class="btn primary" data-sact="save">${t('save')}</button></div>
  </div>`;
  const b = $('.sheet-b', root); if (b) b.scrollTop = scroll;
  if (first && isNew) setTimeout(() => $('#f-title')?.focus(), 60);
  if (first && ui.sheet.focusNote) setTimeout(() => { const n = $('#f-daynote'); if (n) { n.scrollIntoView({ block: 'center' }); n.focus(); } }, 120);
}
function sheetInput(el) {
  const d = ui.sheet.draft, f = el.dataset.f, v = el.value;
  if (f === 'dayNote') { ui.sheet.dayNote = v; return; }
  if (f === 'every') d.repeat.every = Math.max(1, parseInt(v) || 1);
  else if (f === 'nag') { d.remind.nag = parseInt(v); d._remTouched = true; }
  else if (f === 'time') { const had = !!d.time; d.time = v; if (had !== !!v) renderSheet(); }
  else if (f === 'date') { d.date = v; return renderSheet(); }
  else { d[f] = v; if (f === 'until') return renderSheet(); }
}
function flushDayNote() {
  const s = ui.sheet; if (!s || s.kind !== 'task' || !s.ctxDate || !s.draft.id) return;
  const old = S.notes[R.compId(s.draft.id, s.ctxDate)]?.text || '', v = (s.dayNote || '').trim();
  if (v !== old) store.setNote(s.draft.id, s.ctxDate, v).catch(() => { });
}
function sheetAct(act, v) {
  if (act.startsWith('m-')) return mealAct(act, v);
  if (act.startsWith('r-')) return receiptAct(act, v);
  if (act === 'p-del') { store.deleteItem(ui.sheet.itemId).catch(() => { }); return closeSheet(); }
  if (act === 'p-save') {
    const s = ui.sheet, patch = {};
    if (s.itemId) {   // renamed in the long-press editor: update the list entry and carry the product memory over
      const nn = s.nameInput.trim();
      if (!nn) { $('#p-name')?.focus(); return; }
      if (nn !== s.fullName) {
        store.updateItem(s.itemId, { name: nn }).catch(() => { });
        const nk = itemKey(nn);
        if (nk !== s.key) {
          const old = S.products[s.key], ex = S.products[nk];
          if (old && !ex) { const { name: _n, ...rest } = old; Object.assign(patch, rest); }
          s.key = nk; s.name = ex?.name || parseQty(nn).name; s.catWas = ex?.cat ?? (old && !ex ? old.cat ?? null : null);
        }
      }
    }
    for (const [k] of STORES) {
      const raw = s.vals[k].trim().replace(',', '.'), num = raw === '' ? null : Math.round(parseFloat(raw) * 100) / 100;
      if (raw !== '' && !(num >= 0)) { toast(t('badPrice')); return; }
      const old = S.products[s.key]?.[k]?.price ?? null;
      if (num !== old) patch[k] = num == null ? null : { price: num, at: Date.now() };
    }
    if (s.cat !== s.catWas) patch.cat = s.cat;
    if (Object.keys(patch).length) store.updateProduct(s.key, { name: s.name, ...patch }).catch(() => { });
    return closeSheet();
  }
  const s = ui.sheet; if (!s && act !== 'close') return; const d = s?.draft;
  switch (act) {
    case 'close': return closeSheet();
    case 'clear-time': d.time = ''; return renderSheet();
    case 'rtype': if (!d._remTouched && (v === 'none') !== (d.repeat.type === 'none')) d.remind = R.defaultRemind(v !== 'none');
      d.repeat.type = v; if (v === 'weekly' && !d.repeat.days.length) d.repeat.days = [R.parseYmd(d.date || todayStr()).getDay()]; return renderSheet();
    case 'wday': { const i = +v, a = d.repeat.days; d.repeat.days = a.includes(i) ? a.filter(x => x !== i) : [...a, i]; return renderSheet(); }
    case 'who': d.assignee = v; return renderSheet();
    case 'private': d.private = !d.private; if (d.private) d.assignee = me(); return renderSheet();
    case 'off': { const n = +v, a = d.remind.offsets; d.remind.offsets = a.includes(n) ? a.filter(x => x !== n) : [...a, n]; d.remind.on = d.remind.offsets.length > 0; d._remTouched = true; return renderSheet(); }
    case 'missed': flushDayNote(); setComp(d.id, s.ctxDate, 'missed'); return closeSheet();
    case 'skip': {
      flushDayNote();
      const c = S.comps[R.compId(d.id, s.ctxDate)];
      setComp(d.id, s.ctxDate, c?.status === 'skip' ? null : 'skip'); return closeSheet();
    }
    case 'delete': {
      const td = todayStr();
      if (R.isRecurring(d) && d.date < td) { if (!confirm(t('deleteSeriesQ'))) return; store.saveTask({ id: d.id, until: R.addDays(td, -1), endDate: R.addDays(td, -1) }).catch(() => { }); }
      else { if (!confirm(t('deleteQ'))) return; store.deleteTask(d.id).catch(() => { }); }
      return closeSheet();
    }
    case 'save': {
      d.title = d.title.trim();
      if (!d.title) { toast(t('titleRequired')); $('#f-title')?.focus(); return; }
      if (!d.date) d.date = todayStr();
      const rec = d.repeat.type !== 'none';
      if (rec && d.repeat.type === 'weekly' && !d.repeat.days.length) d.repeat.days = [R.parseYmd(d.date).getDay()];
      const task = {
        title: d.title, notes: d.notes.trim(), date: d.date, time: d.time || null,
        repeat: rec ? { type: d.repeat.type, every: d.repeat.every || 1, ...(d.repeat.type === 'weekly' ? { days: d.repeat.days } : {}) } : { type: 'none' },
        until: rec && d.until ? d.until : null, assignee: d.private ? me() : (d.assignee || 'all'), private: !!d.private,
        remind: { on: d.remind.offsets.length > 0, offsets: [...d.remind.offsets].sort((a, b) => b - a), nag: d.remind.nag || 0 },
      };
      // fields that let the reminder server read only relevant tasks
      task.endDate = rec ? (task.until || '9999-12-31') : task.date;
      if (!rec) task.closed = !!(d.id && S.comps[R.compId(d.id, task.date)]);
      if (d.id) task.id = d.id;
      flushDayNote();
      store.saveTask(task).catch(() => { });
      return closeSheet();
    }
  }
}

/* ---------- price sheet ---------- */
function openPrice(item, editName = false) {
  const p = priceOf(item.name) || {};
  ui.sheet = { kind: 'price', itemId: editName ? item.id : null, fullName: item.name, nameInput: item.name, name: p.name || parseQty(item.name).name, key: itemKey(item.name), cat: catOf(item.name), catWas: p.cat || null, vals: Object.fromEntries(STORES.map(([k]) => [k, p[k]?.price != null ? String(p[k].price).replace('.', getLang() === 'pl' ? ',' : '.') : ''])), at: Object.fromEntries(STORES.map(([k]) => [k, p[k]?.at || 0])) };
  renderSheet(true);
}
function renderPriceSheet(first) {
  const s = ui.sheet;
  $('#sheet-root').innerHTML = `<div class="scrim" data-sact="close"></div>
  <div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>
    <div class="sheet-h"><h2>${esc(s.itemId ? t('editItem') : s.name)}</h2><button class="iconbtn" data-sact="close">${I.x}</button></div>
    <div class="sheet-b">
      ${s.itemId ? `<div class="field"><label>${t('itemName')}</label><input class="in title" id="p-name" data-pname value="${esc(s.nameInput)}" maxlength="80" autocomplete="off" enterkeyhint="done"></div>` : ''}
      <div class="field"><label>${t('category')}</label><select class="in" data-pcat>${CAT_IDS.map(c => `<option value="${c}" ${s.cat === c ? 'selected' : ''}>${esc(catLabel(c, getLang()))}</option>`).join('')}</select></div>
      ${STORES.map(([k, label]) => `<div class="field"><label>${label}${s.at[k] ? ` <span class="muted" style="font-weight:400">· ${esc(fmtDate(R.ymd(new Date(s.at[k]))))}</span>` : ''}</label>
        <div class="row" style="align-items:center"><input class="in" inputmode="decimal" data-pf="${k}" value="${esc(s.vals[k])}" placeholder="0,00"><span style="flex:none;color:var(--ink2)">zł</span></div></div>`).join('')}
      <div class="hint">${t('priceHint')}</div>
      ${s.itemId ? `<button type="button" class="btn danger" style="margin-top:12px" data-sact="p-del">${t('delete')}</button>` : ''}
    </div>
    <div class="sheet-f"><button type="button" class="btn ghost" data-sact="close">${t('cancel')}</button><button type="button" class="btn primary" data-sact="p-save">${t('save')}</button></div>
  </div>`;
  if (first) setTimeout(() => (s.itemId ? $('#p-name') : $('[data-pf]'))?.focus(), 60);
}

/* ---------- receipt scanning (on-device OCR, no API key) ---------- */
const stripD = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
function matchProduct(raw) {
  const r = raw.toLowerCase();
  for (const [, p] of Object.entries(S.products)) if (p.aliases?.includes(r)) return p.name;
  const sr = stripD(raw), names = new Set([...Object.values(S.products).map(p => p.name), ...S.shopping.map(i => parseQty(i.name).name)].filter(Boolean));
  let best = null;
  for (const n of names) {
    const w = stripD(n).split(/\s+/)[0]; if (w.length < 3) continue;
    if (new RegExp(`(^|[^a-z])${w.slice(0, Math.max(4, w.length - 2)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(sr) && (!best || n.length > best.length)) best = n;
  }
  return best;
}
async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'; sc.crossOrigin = 'anonymous'; sc.onload = res; sc.onerror = () => rej(new Error(t('ocrOffline'))); document.head.appendChild(sc); });
  return window.Tesseract;
}
async function prepImage(file) { // shrink + greyscale: faster and usually more accurate on thermal paper
  try {
    const bmp = await createImageBitmap(file), sc = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = bmp.width * sc; c.height = bmp.height * sc;
    const x = c.getContext('2d'); x.filter = 'grayscale(1) contrast(1.4)'; x.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, 'image/png'));
  } catch { return file; }
}
async function scanReceipt(file) {
  ui.sheet = { kind: 'receipt', phase: 'ocr', progress: 0 }; renderSheet(true);
  try {
    const T = await loadTesseract();
    const worker = await T.createWorker('pol', 1, { logger: m => { if (m.status === 'recognizing text' && ui.sheet?.kind === 'receipt') { ui.sheet.progress = m.progress; const b = $('#ocr-bar'); if (b) b.style.width = Math.round(m.progress * 100) + '%'; } } });
    const { data: { text } } = await worker.recognize(await prepImage(file));
    await worker.terminate();
    if (ui.sheet?.kind !== 'receipt') return;
    const { store: st, items } = parseReceipt(text);
    ui.sheet = { kind: 'receipt', phase: 'review', store: st || (ui.shopOrder !== 'added' ? ui.shopOrder : 'biedronka'), detected: !!st,
      rows: items.map(i => ({ raw: i.raw, name: matchProduct(i.raw) || i.name, unit: i.unit, qty: i.qty, on: true })) };
  } catch (e) { ui.sheet = { kind: 'receipt', phase: 'error', msg: e.message }; }
  renderSheet();
}
function renderReceiptSheet() {
  const s = ui.sheet, root = $('#sheet-root');
  let body, foot = `<button type="button" class="btn ghost" data-sact="close">${t('cancel')}</button>`;
  if (s.phase === 'ocr') body = `<div class="empty"><div class="em">🧾</div><b>${t('ocrReading')}</b>${t('ocrFirst')}<div class="ocr-track"><i id="ocr-bar" style="width:${Math.round(s.progress * 100)}%"></i></div></div>`;
  else if (s.phase === 'error') body = `<div class="empty"><div class="em">⚠️</div><b>${esc(s.msg)}</b></div>`;
  else if (!s.rows.length) body = `<div class="empty"><div class="em">🤔</div><b>${t('ocrNothing')}</b>${t('ocrTips')}</div>`;
  else {
    body = `<div class="field"><label>${t('whichStore')}${s.detected ? ' · ' + t('detected') : ''}</label><div class="seg">${STORES.map(([k, l]) => `<button type="button" class="${s.store === k ? 'on' : ''}" data-sact="r-store" data-v="${k}">${l}</button>`).join('')}</div></div>
      <div class="hint" style="margin:-4px 2px 10px">${t('ocrReview')}</div>
      <datalist id="prod-dl">${Object.values(S.products).map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>
      <div class="list">${s.rows.map((r, i) => `<div class="rrow ${r.on ? '' : 'off'}">
        <button type="button" class="check" style="--c:var(--accent)" data-sact="r-toggle" data-v="${i}">${I.check}</button>
        <div class="rmain"><input class="in" list="prod-dl" data-rf="${i}" value="${esc(r.name)}"><small>${esc(r.raw)}${r.qty !== 1 ? ` · ${String(r.qty).replace('.', ',')} ×` : ''}</small></div>
        <span class="rprice">${money(r.unit)}</span></div>`).join('')}</div>`;
    foot += `<button type="button" class="btn primary" data-sact="r-save">${t('savePrices', { n: s.rows.filter(r => r.on).length })}</button>`;
  }
  root.innerHTML = `<div class="scrim" data-sact="close"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>
    <div class="sheet-h"><h2>${t('scanReceipt')}</h2><button class="iconbtn" data-sact="close">${I.x}</button></div>
    <div class="sheet-b">${body}</div><div class="sheet-f">${foot}</div></div>`;
}
function receiptAct(act, v) {
  const s = ui.sheet;
  if (act === 'r-store') { s.store = v; return renderSheet(); }
  if (act === 'r-toggle') { s.rows[+v].on = !s.rows[+v].on; return renderSheet(); }
  if (act === 'r-save') {
    let n = 0;
    for (const r of s.rows) {
      const name = r.name.trim(); if (!r.on || !name) continue;
      const key = itemKey(name), ex = S.products[key] || {};
      const aliases = [...new Set([...(ex.aliases || []), r.raw.toLowerCase()])].slice(-10);
      store.updateProduct(key, { name: ex.name || name, cat: ex.cat || guessCat(name), aliases, [s.store]: { price: r.unit, at: Date.now() } }).catch(() => { });
      n++;
    }
    toast(t('pricesSaved', { n })); return closeSheet();
  }
}

/* ---------- meal sheet ---------- */
function openMeal(date, preset) {
  const m = S.meals[date];
  const draft = preset ? { name: preset.name, ingredients: (preset.ingredients || []).join('\n'), cook: m?.cook || '', notes: m?.notes || '', recipeId: preset.id }
    : { name: m?.name || '', ingredients: (m?.ingredients || []).join('\n'), cook: m?.cook || '', notes: m?.notes || '', recipeId: m?.recipeId || null };
  ui.sheet = { kind: 'meal', date, draft, exists: !!m }; renderSheet(true);
}
function renderMealSheet(first) {
  const root = $('#sheet-root'), { date, draft: d, exists } = ui.sheet, m = H().members;
  const recs = S.recipes.filter(r => r.name.toLowerCase() !== d.name.trim().toLowerCase()).sort((a, b) => (b.uses || 0) - (a.uses || 0)).slice(0, 8);
  root.innerHTML = `<div class="scrim" data-sact="close"></div>
  <div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>
    <div class="sheet-h"><h2>${esc(t('mealFor', { d: dayTitle(date) + ', ' + fmt(date, { day: 'numeric', month: 'short' }) }))}</h2><button class="iconbtn" data-sact="close">${I.x}</button></div>
    <div class="sheet-b">
      <div class="field"><input class="in title" id="m-name" data-mf="name" list="rec-dl" value="${esc(d.name)}" placeholder="${esc(t('mealName'))}" maxlength="80" autocomplete="off"></div>
      <datalist id="rec-dl">${S.recipes.map(r => `<option value="${esc(r.name)}">`).join('')}</datalist>
      ${!d.name && recs.length ? `<div class="sugg" style="margin:-4px 0 14px">${recs.map(r => `<button type="button" data-sact="m-pick" data-v="${r.id}">${esc(r.name)}</button>`).join('')}</div>` : ''}
      ${m.length > 1 ? `<div class="field"><label>${t('cook')}</label><div class="chips">
        <button type="button" class="chip ${!d.cook ? 'on' : ''}" data-sact="m-cook" data-v="">${t('nobodyCook')}</button>
        ${m.map(u => `<button type="button" class="chip ${d.cook === u ? 'on' : ''}" data-sact="m-cook" data-v="${u}"><span class="dot" style="background:${colorOf(u)}"></span>${esc(nameOf(u))}</button>`).join('')}
        <button type="button" class="chip ${d.cook === 'all' ? 'on' : ''}" data-sact="m-cook" data-v="all">${t('both')}</button></div></div>` : ''}
      <div class="field"><label>${t('ingredients')}</label><textarea class="in" rows="5" data-mf="ingredients">${esc(d.ingredients)}</textarea>
        <button type="button" class="btn ghost block" style="margin-top:8px;height:44px" data-sact="m-shop">${I.cart.replace('<svg', '<svg width="20" height="20"')} ${t('toShopping')}</button></div>
      <div class="field"><textarea class="in" data-mf="notes" rows="2" placeholder="${esc(t('notes'))}">${esc(d.notes)}</textarea></div>
      ${exists ? `<button type="button" class="btn danger" data-sact="m-del">${t('removeMeal')}</button>` : ''}
    </div>
    <div class="sheet-f"><button type="button" class="btn ghost" data-sact="close">${t('cancel')}</button><button type="button" class="btn primary" data-sact="m-save">${t('save')}</button></div>
  </div>`;
  if (first && !exists) setTimeout(() => $('#m-name')?.focus(), 60);
}
const lines = s => s.split('\n').map(x => x.trim()).filter(Boolean);
function mealAct(act, v) {
  const s = ui.sheet; if (!s) return; const d = s.draft;
  switch (act) {
    case 'm-cook': d.cook = v; return renderSheet();
    case 'm-pick': { const r = S.recipes.find(x => x.id === v); if (r) { d.name = r.name; d.ingredients = (r.ingredients || []).join('\n'); d.recipeId = r.id; } return renderSheet(); }
    case 'm-shop': {
      const have = new Set(S.shopping.filter(i => !i.done).map(i => i.name.toLowerCase()));
      const add = lines(d.ingredients).filter(x => !have.has(x.toLowerCase()));
      if (!add.length) return toast(t('allOnList'));
      add.forEach(rememberProduct);
      store.addItems(add).catch(() => { }); return toast(t('addedN', { n: add.length }));
    }
    case 'm-del': store.setMeal(s.date, null).catch(() => { }); return closeSheet();
    case 'm-save': {
      const name = d.name.trim(); if (!name) { $('#m-name')?.focus(); return; }
      const ingredients = lines(d.ingredients);
      let rec = S.recipes.find(r => r.id === d.recipeId && r.name.toLowerCase() === name.toLowerCase()) || S.recipes.find(r => r.name.toLowerCase() === name.toLowerCase());
      const prev = S.meals[s.date];
      const isNewUse = !prev || prev.name.toLowerCase() !== name.toLowerCase();
      store.saveRecipe({ ...(rec ? { id: rec.id } : {}), name, ingredients, uses: (rec?.uses || 0) + (isNewUse ? 1 : 0) }).catch(() => { });
      store.setMeal(s.date, { name, ingredients, cook: d.cook || '', notes: d.notes.trim(), recipeId: rec?.id || null }).catch(() => { });
      return closeSheet();
    }
  }
}

/* ---------- completions ---------- */
function setComp(taskId, date, status) {
  store.setCompletion(taskId, date, status).catch(() => { });
  const tk = S.tasks.find(x => x.id === taskId);
  if (tk && !R.isRecurring(tk) && date === tk.date && tk.closed !== !!status) store.saveTask({ id: taskId, closed: !!status }).catch(() => { });
}

/* ---------- push ---------- */
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
async function refreshPush() {
  let st;
  if (!('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) st = isIos && !standalone ? 'ios' : 'unsupported';
  else if (Notification.permission === 'denied') st = 'denied';
  else if (store.demo) st = Notification.permission === 'granted' && localStorage.getItem('razem-demo-push') ? 'on' : 'off';
  else {
    try {
      const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
      st = sub ? 'on' : 'off';
      if (sub && S.phase === 'ready') store.savePushSub(sub.toJSON()).catch(() => { }); // keep it linked to this user/home
    } catch { st = 'off'; }
  }
  if (st !== ui.push) { ui.push = st; render(); }
}
const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
async function pushOn() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return refreshPush();
  if (store.demo) { localStorage.setItem('razem-demo-push', '1'); pushTest(); return refreshPush(); }
  if (!CONFIG.vapidPublicKey) { toast(t('notifNoKey')); return; }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(CONFIG.vapidPublicKey) });
    await store.savePushSub(sub.toJSON());
    pushTest();
  } catch (e) { toast(t('saveError', { e: e.message })); }
  refreshPush();
}
async function pushOff() {
  ui.push = 'off'; render();                       // instant feedback; cleanup continues in the background
  if (store.demo) { localStorage.removeItem('razem-demo-push'); return; }
  const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
  if (sub) { const ep = sub.endpoint; await sub.unsubscribe().catch(() => { }); store.removePushSub(ep).catch(() => { }); }
  refreshPush();
}
async function pushTest() {
  if (Notification.permission !== 'granted') { toast(t('notifDenied')); return refreshPush(); }
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification(t('testTitle'), { body: t('testBody') + ' ' + new Date().toTimeString().slice(0, 5), icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: 'test-' + Date.now() });
  toast(t('testSent'));
}

/* ---------- deep links from notifications ---------- */
function handleOpen(p) {
  if (p.summary) { if (S?.phase !== 'ready') { ui.pending = p; return; } ui.pending = null; localStorage.setItem('razem-sum-seen', p.summary); ui.view = 'summary'; ui.sumMonth = p.summary; render(); return; }
  if (!p.task || S.phase !== 'ready') { ui.pending = p.task ? p : null; return; }
  const task = S.tasks.find(x => x.id === p.task);
  if (!task) return; // tasks may not be loaded yet
  ui.pending = null;
  const date = p.date || todayStr();
  if (p.act && !S.comps[R.compId(task.id, date)]) { setComp(task.id, date, p.act); toast(`${t(p.act === 'done' ? 'markedDone' : 'markedMissed')}: ${task.title}`); }
  ui.view = 'today'; ui.day = date; render();
}

/* ---------- events ---------- */
document.addEventListener('click', async e => {
  const sEl = e.target.closest('[data-sact]');
  if (sEl) { e.preventDefault(); return sheetAct(sEl.dataset.sact, sEl.dataset.v); }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const { act, v, id, date } = el.dataset;
  switch (act) {
    case 'view': ui.view = v; if (v === 'settings') refreshPush(); window.scrollTo(0, 0); return render();
    case 'day': ui.day = v; return render();
    case 'calday': ui.calDay = v; if (v.slice(0, 7) !== ui.calMonth) ui.calMonth = v.slice(0, 7); return render();
    case 'month': ui.calMonth = v; ui.calDay = v === todayStr().slice(0, 7) ? todayStr() : v + '-01'; return render();
    case 'filter': ui.filter = v; return render();
    case 'datefmt': localStorage.setItem('razem-datefmt', v); return render();
    case 'summary': ui.view = 'summary'; ui.sumMonth = v; window.scrollTo(0, 0); return render();
    case 'summary-open': localStorage.setItem('razem-sum-seen', v); ui.view = 'summary'; ui.sumMonth = v; window.scrollTo(0, 0); return render();
    case 'summary-x': localStorage.setItem('razem-sum-seen', v); return render();
    case 'calmode': ui.calMode = v; localStorage.setItem('razem-calmode', v); return render();
    case 'newon': return openTask(null, null, v);
    case 'meal': return openMeal(v);
    case 'mealweek': ui.mealWeek = v; return render();
    case 'recipe': { const r = S.recipes.find(x => x.id === id); if (!r) return; const td = todayStr(); let d = ui.mealWeek < weekMon(td) ? ui.mealWeek : td; for (let i = 0; i < 14 && S.meals[d]; i++) d = R.addDays(d, 1); return openMeal(d, r); }
    case 'recipe-del': if (confirm(t('deleteQ'))) store.deleteRecipe(id).catch(() => { }); return;
    case 'mark': {
      const tk = S.tasks.find(x => x.id === id);
      setComp(id, date, el.dataset.s);
      if (tk) toast(`${t(el.dataset.s === 'done' ? 'markedDone' : 'markedMissed')}: ${tk.title}`); return;
    }
    case 'new': return openTask(null);
    case 'edit': { const tk = S.tasks.find(x => x.id === id); if (tk) openTask(tk, date); return; }
    case 'toggle': {
      const c = S.comps[R.compId(id, date)];
      if (navigator.vibrate && c?.status !== 'done') navigator.vibrate(8);
      setComp(id, date, c?.status === 'done' ? null : 'done'); // not done / skipped → done
      const tk = S.tasks.find(x => x.id === id);
      if (tk && c?.status !== 'done') toast(`${t('markedDone')}: ${tk.title}`, { label: t('addNote'), fn: () => { openTask(tk, date); ui.sheet.focusNote = true; renderSheet(true); } });
      return;
    }
    case 'item': { const it = S.shopping.find(x => x.id === id); if (it) store.toggleItem(it).catch(() => { }); return; }
    case 'item-del': store.deleteItem(id).catch(() => { }); return;
    case 'receipt': $('#receipt-in').click(); return;
    case 'shoporder': ui.shopOrder = v; localStorage.setItem('razem-shoporder', v); return render();
    case 'layoutstore': ui.layoutStore = v; return render();
    case 'aisle': {
      const st = ui.layoutStore, l = layoutOf(st).slice(), i = l.indexOf(el.dataset.c), j = i + (+v);
      if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]];
      store.updateHousehold({ [`layouts.${st}`]: l }).catch(() => { }); return;
    }
    case 'aisle-reset': store.updateHousehold({ [`layouts.${ui.layoutStore}`]: DEFAULT_LAYOUTS[ui.layoutStore] }).catch(() => { }); return;
    case 'price': { const it = S.shopping.find(x => x.id === id); if (it) openPrice(it); return; }
    case 'export': {
      const blob = new Blob([JSON.stringify(store.exportData(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `razem-${todayStr()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000); return;
    }
    case 'sugg': addItem(v); { const i = $('#shop-in'); if (i) { i.value = ''; $('#shop-sugg').innerHTML = suggHtml(''); if (e.target.closest('.ac')) i.focus(); } } return;
    case 'clear-cart': store.clearDone().catch(() => { }); return;
    case 'color': store.updateHousehold({ [`colors.${me()}`]: v }).catch(() => { }); return;
    case 'lang': setLang(v); if (S.phase === 'ready') store.updateHousehold({ lang: v }).catch(() => { }); render(); return;
    case 'copy-code': navigator.clipboard?.writeText(H().id).then(() => toast(t('copied'))); return;
    case 'share-code': navigator.share?.({ title: 'Razem', text: `${t('invite')}: ${H().id}\n${location.origin + location.pathname}` }).catch(() => { }); return;
    case 'push-on': return pushOn();
    case 'push-off': return pushOff();
    case 'push-test': return pushTest();
    case 'banner-x': localStorage.setItem('razem-banner-x', '1'); return render();
    case 'reset-demo': store.reset(); return;
    case 'sign-out': await pushOff().catch(() => { }); store.signOut(); return;
    case 'auth-mode': ui.authMode = ui.authMode === 'signUp' ? 'signIn' : 'signUp'; ui.authErr = ''; return render();
    case 'forgot': {
      const em = $('[name=email]')?.value; if (!em) { ui.authErr = t('email') + '?'; return render(); }
      store.resetPassword(em).then(() => toast(t('resetSent'))).catch(err => { ui.authErr = authMsg(err); render(); }); return;
    }
    case 'create-home': case 'join-home': {
      const name = $('#ob-name').value.trim(), code = $('#ob-code').value.trim();
      if (!name) { ui.authErr = t('nameRequired'); return render(); }
      if (act === 'join-home' && !code) { $('#ob-code').focus(); return; }
      ui.busy = true; ui.authErr = ''; render(); $('#ob-name').value = name; $('#ob-code').value = code;
      try { act === 'create-home' ? await store.createHousehold(name) : await store.joinHousehold(code, name); }
      catch (err) { ui.authErr = err.message === 'badCode' ? t('badCode') : (err.code || err.message); }
      ui.busy = false; render(); return;
    }
  }
});
function rememberProduct(full) {
  const n = parseQty(full).name, key = itemKey(full), ex = S.products[key];
  store.updateProduct(key, { name: ex?.name || n, uses: (ex?.uses || 0) + 1, lastAt: Date.now(), ...(ex?.cat ? {} : { cat: guessCat(n) }) }).catch(() => { });
}
function addItem(name) {
  name = name.trim(); if (!name) return;
  const { qty } = parseQty(name), ex = S.products[itemKey(name)];
  const display = ex?.name ? (qty > 1 ? `${qty}x ${ex.name}` : ex.name) : name;   // keep one spelling for the same product
  rememberProduct(name);
  store.addItem(display).catch(() => { });
  ui.shopQ = '';
}
const authMsg = e => ({ 'auth/invalid-credential': '✕ ' + t('email') + ' / ' + t('password'), 'auth/email-already-in-use': 'E-mail już używany / already in use',
  'auth/weak-password': 'Min. 6', 'auth/invalid-email': t('email') + '?' }[e.code] || e.code || e.message);
document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target.dataset.form;
  if (f === 'shop') { const i = $('#shop-in'); addItem(i.value); i.value = ''; i.focus(); $('#shop-sugg').innerHTML = suggHtml(''); }
  if (f === 'auth') {
    const fd = new FormData(e.target), em = fd.get('email'), pw = fd.get('pw');
    ui.busy = true; ui.authErr = ''; render();
    try { ui.authMode === 'signUp' ? await store.signUp(em, pw) : await store.signIn(em, pw); }
    catch (err) { ui.authErr = authMsg(err); ui.busy = false; render(); $('[name=email]').value = em; return; }
    ui.busy = false;
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'shop-in') { ui.shopQ = e.target.value; $('#shop-sugg').innerHTML = suggHtml(ui.shopQ); return; }
  if (e.target.dataset.f && ui.sheet) sheetInput(e.target);
  if (e.target.dataset.pf && ui.sheet?.kind === 'price') ui.sheet.vals[e.target.dataset.pf] = e.target.value;
  if (e.target.dataset.rf && ui.sheet?.kind === 'receipt') ui.sheet.rows[+e.target.dataset.rf].name = e.target.value;
  if (e.target.matches('[data-pcat]') && ui.sheet?.kind === 'price') ui.sheet.cat = e.target.value;
  if (e.target.matches('[data-pname]') && ui.sheet?.kind === 'price') ui.sheet.nameInput = e.target.value;
  const mf = e.target.dataset.mf;
  if (mf && ui.sheet?.kind === 'meal') {
    const d = ui.sheet.draft; d[mf] = e.target.value;
    if (mf === 'name') { // picked/typed an existing dinner → fill its ingredients
      const r = S.recipes.find(x => x.name.toLowerCase() === e.target.value.trim().toLowerCase());
      if (r && !d.ingredients.trim()) { d.ingredients = (r.ingredients || []).join('\n'); d.recipeId = r.id; renderSheet(); $('#m-name').focus(); }
    }
  }
});
document.addEventListener('change', e => {
  const tw = e.target.closest('[data-time]');
  if (tw) {
    const key = tw.dataset.time, v = readTime(tw);
    if (key === 'task' && ui.sheet?.kind === 'task') { ui.sheet.draft.time = v; renderSheet(); }
    else if (key !== 'task') store.updateHousehold({ [key]: v }).catch(() => { });
    return;
  }
  if (e.target.id === 'receipt-in' && e.target.files[0]) { scanReceipt(e.target.files[0]); e.target.value = ''; return; }
  if (e.target.matches('[data-pcat]') && ui.sheet?.kind === 'price') ui.sheet.cat = e.target.value;
  const k = e.target.dataset.hset;
  if (k) store.updateHousehold({ [k]: e.target.value || '' }).catch(() => { });
  if (e.target.id === 'my-name' && e.target.value.trim()) store.updateHousehold({ [`names.${me()}`]: e.target.value.trim() }).catch(() => { });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && ui.sheet) closeSheet();
  if (e.key === 'Enter' && e.target.id === 'f-title') { e.preventDefault(); sheetAct('save'); }
  if (e.key === 'Enter' && e.target.id === 'p-name') { e.preventDefault(); sheetAct('p-save'); }
  if (e.key === 'Enter' && e.target.id === 'm-name') { e.preventDefault(); mealAct('m-save'); }
});
// day rollover while the app stays open
function rollover() {
  const td = todayStr();
  if (td !== ui.lastToday) { if (ui.day === ui.lastToday) ui.day = td; if (ui.calDay === ui.lastToday) { ui.calDay = td; ui.calMonth = td.slice(0, 7); } ui.lastToday = td; }
  if (S?.phase === 'ready') render();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { rollover(); refreshPush(); } });
setInterval(rollover, 60000);

/* ---------- long-press on a shopping entry = edit (a short tap still ticks it) ---------- */
let lp = null, lpFired = false;
document.addEventListener('pointerdown', e => {
  const row = e.target.closest('[data-lp]'); if (!row || e.target.closest('.x')) return;
  lpFired = false; const x0 = e.clientX, y0 = e.clientY;
  lp = { x0, y0, timer: setTimeout(() => {
    const it = S.shopping.find(i => i.id === row.dataset.lp); if (!it) return;
    lpFired = true; navigator.vibrate?.(15); row.classList.add('pressed'); setTimeout(() => row.classList.remove('pressed'), 200);
    openPrice(it, true);
  }, 480) };
});
const lpCancel = () => { if (lp) { clearTimeout(lp.timer); lp = null; } };
document.addEventListener('pointermove', e => { if (lp && Math.hypot(e.clientX - lp.x0, e.clientY - lp.y0) > 10) lpCancel(); });
document.addEventListener('pointerup', lpCancel); document.addEventListener('pointercancel', lpCancel);
document.addEventListener('click', e => { if (lpFired && e.target.closest('[data-lp]')) { e.stopPropagation(); e.preventDefault(); lpFired = false; } }, true);
document.addEventListener('contextmenu', e => { if (e.target.closest('[data-lp]')) e.preventDefault(); });

/* ---------- boot ---------- */
(async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
    navigator.serviceWorker.addEventListener('message', ev => { if (ev.data?.type === 'open') handleOpen(ev.data); });
  }
  const q = new URLSearchParams(location.search);
  if (q.get('summary')) { ui.pending = { summary: q.get('summary') }; history.replaceState(null, '', location.pathname + (q.has('demo') ? '?demo' : '')); }
  if (q.get('task')) { ui.pending = { task: q.get('task'), date: q.get('date'), act: ['done', 'missed'].includes(q.get('act')) ? q.get('act') : null }; history.replaceState(null, '', location.pathname + (q.has('demo') ? '?demo' : '')); }
  try { store = await createStore(); }
  catch (e) { $('#app').innerHTML = `<div class="auth"><h1>⚠️</h1><p>${esc(e.message)}</p></div>`; return; }
  store.onError = e => toast(t('saveError', { e: e.code || e.message }));
  store.on(s => {
    S = s;
    if (s.phase === 'ready' && !store.demo) for (const tk of s.tasks) {
      const rec = R.isRecurring(tk), end = rec ? (tk.until || '9999-12-31') : tk.date;
      if (tk.endDate !== end || (!rec && typeof tk.closed !== 'boolean')) {
        store.saveTask({ id: tk.id, endDate: end, ...(rec ? {} : { closed: !!s.comps[R.compId(tk.id, tk.date)] }) }).catch(() => { });
      }
    }
    render();
    if (ui.pending && s.phase === 'ready' && (s.tasks.length || ui.pending.summary)) handleOpen(ui.pending);
  });
  refreshPush();
})();

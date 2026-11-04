// Reminder rules — pure functions, no database code.
// Any backend (the Firestore runner in remind.mjs today, a Pi/PocketBase server later) feeds data in and gets messages out.
import { occursOn, compId, toMin, isRecurring, assignedTo, addDays, remindOffsets, unfinished } from '../recur.js';

export const WINDOW = 90;     // still send a reminder up to 90 min after its moment (worker may run late)
export const LOOKAHEAD = 3;   // days ahead to check (offsets go up to 2 days)
export const LATE = 30;       // GitHub's scheduler can be late: still send a missed 'before' reminder up to 30 min after the time

const fmtOff = m => m >= 60 ? `${m / 60} h` : `${m} min`;
export const MSG = {
  pl: {
    pre: (off, tm, k) => k === 0 ? (off ? `Za ${fmtOff(off)} · ${tm}` : `Teraz · ${tm}`) : k === 1 ? `Jutro o ${tm}` : `Za ${k} dni, o ${tm}`,
    fu: tm => `Było na ${tm} — zrobione?`, done: '✓ Zrobione', missed: '✕ Nie zrobione',
    mTitle: 'Dzień dobry ☀️', mBody: (n, list) => `Dziś ${n} ${n === 1 ? 'zadanie' : n < 5 ? 'zadania' : 'zadań'}: ${list}`,
    yday: n => `Wczoraj niezamknięte: ${n}`, dinner: n => `Obiad: ${n}`,
    eTitle: 'Zostało na dziś', eBody: (d, tot, list) => `${tot ? `${d}/${tot} zrobione (${Math.round(d * 100 / tot)}%). ` : ''}Do zrobienia: ${list}`,
  },
  en: {
    pre: (off, tm, k) => k === 0 ? (off ? `In ${fmtOff(off)} · ${tm}` : `Now · ${tm}`) : k === 1 ? `Tomorrow at ${tm}` : `In ${k} days, at ${tm}`,
    fu: tm => `Was due at ${tm} — done?`, done: '✓ Done', missed: '✕ Not done',
    mTitle: 'Good morning ☀️', mBody: (n, list) => `${n} task${n === 1 ? '' : 's'} today: ${list}`,
    yday: n => `Not closed yesterday: ${n}`, dinner: n => `Dinner: ${n}`,
    eTitle: 'Left for today', eBody: (d, tot, list) => `${tot ? `${d}/${tot} done (${Math.round(d * 100 / tot)}%). ` : ''}Still to do: ${list}`,
  },
};
const short = arr => arr.slice(0, 4).map(t => t.title).join(', ') + (arr.length > 4 ? ` +${arr.length - 4}` : '');

/**
 * Step 1 — what *could* be due right now, from tasks + household settings only (no completions needed).
 * `tasks` = active tasks (endDate >= yesterday) plus one-off tasks not yet closed.
 * Returns [] most of the time, so the runner can stop without further reads.
 */
export function candidates({ household: H, tasks, date, minutes }) {
  const out = [];
  for (const t of tasks) {
    if (!t.time) continue;
    for (let k = 0; k <= LOOKAHEAD; k++) {
      const occ = addDays(date, k);
      if (!occursOn(t, occ)) continue;
      const at = k * 1440 + toMin(t.time);
      for (const off of remindOffsets(t)) {
        const fire = at - off;
        if (minutes >= fire && minutes - fire <= WINDOW && minutes <= at + LATE) out.push({ kind: 'pre', key: `${t.id}@${occ}@${off}`, task: t, occ, off, k, late: minutes > at });
      }
    }
    const nag = t.remind?.nag || 0;
    if (nag && t.remind?.on !== false && occursOn(t, date) && minutes - toMin(t.time) >= Math.abs(nag))
      out.push({ kind: 'fu', key: `${t.id}@${date}@fu`, task: t, occ: date, nag });
  }
  if (H.morningAt && minutes >= toMin(H.morningAt) && minutes - toMin(H.morningAt) <= 180) out.push({ kind: 'morning', key: `_morning@${date}` });
  if (H.eveningAt && minutes >= toMin(H.eveningAt)) out.push({ kind: 'evening', key: `_evening@${date}` });
  return out;
}

/** Drop candidates already handled (sent = merged notify state of today + yesterday). */
export function pending(cands, sent, minutes) {
  return cands.filter(c => {
    const st = sent[c.key];
    if (c.kind !== 'fu') return !st;
    if (!st) return true;
    return c.nag > 0 && st.n < 10 && minutes - st.last >= c.nag;
  });
}

/** Which completion docs step 3 needs (so the runner can fetch exactly those). */
export function neededCompletions(cands, date) {
  const ids = new Set(), days = new Set();
  for (const c of cands) {
    if (c.task) ids.add(compId(c.task.id, c.occ));
    if (c.kind === 'morning') { days.add(date); days.add(addDays(date, -1)); }
    if (c.kind === 'evening') days.add(date);
  }
  return { ids: [...ids], days: [...days] };
}

/**
 * Step 3 — build the messages.
 * comps: map compId -> completion (at least the ones neededCompletions asked for)
 * meal: tonight's dinner name or null
 */
export function build({ household: H, tasks, cands, sent, comps, meal, date, minutes }) {
  const M = MSG[H.lang] || MSG.pl, members = H.members || [];
  const to = t => (!t.assignee || t.assignee === 'all') ? members : [t.assignee];
  const actions = [{ action: 'done', title: M.done }, { action: 'missed', title: M.missed }];
  const outbox = [], changed = {};
  for (const c of cands) {
    if (c.task && comps[compId(c.task.id, c.occ)]) continue;      // already done / not done / skipped
    const t = c.task;
    if (c.kind === 'pre') {
      outbox.push({ uids: to(t), payload: { title: t.title, body: c.late ? M.fu(t.time) : M.pre(c.off, t.time, c.k), tag: `${t.id}_${c.occ}`, data: { task: t.id, date: c.occ }, actions: c.k === 0 ? actions : [] } });
      changed[c.key] = minutes;
    } else if (c.kind === 'fu') {
      outbox.push({ uids: to(t), payload: { title: t.title, body: M.fu(t.time), tag: `${t.id}_${date}`, data: { task: t.id, date }, actions } });
      changed[c.key] = { n: (sent[c.key]?.n || 0) + 1, last: minutes };
    } else {
      const open = uid => tasks.filter(x => occursOn(x, date) && assignedTo(x, uid) && !comps[compId(x.id, date)])
        .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
      for (const uid of members) {
        if (c.kind === 'morning') {
          const o = open(uid), unf = unfinished(tasks, comps, addDays(date, -1), uid).length;
          const parts = [o.length ? M.mBody(o.length, short(o)) : '', unf ? M.yday(unf) : '', meal ? M.dinner(meal) : ''].filter(Boolean);
          if (parts.length) outbox.push({ uids: [uid], payload: { title: M.mTitle, body: parts.join('\n'), tag: `morning_${date}`, data: { date } } });
        } else {
          const all = tasks.filter(x => occursOn(x, date) && assignedTo(x, uid) && comps[compId(x.id, date)]?.status !== 'skip');
          const done = all.filter(x => comps[compId(x.id, date)]?.status === 'done').length;
          const overdue = tasks.filter(x => !isRecurring(x) && x.date < date && x.closed === false && assignedTo(x, uid));
          const o = open(uid).concat(overdue);
          if (o.length) outbox.push({ uids: [uid], payload: { title: M.eTitle, body: M.eBody(done, all.length, short(o)), tag: `evening_${date}`, data: { date } } });
        }
      }
      changed[c.key] = minutes;
    }
  }
  return { outbox, changed };
}

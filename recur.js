// Shared date / recurrence logic — used by the app AND the reminder server.
export const DAY = 86400000;
export const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
export const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const dayDiff = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / DAY);
function weekStart(d) { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }

export const isRecurring = t => !!(t.repeat && t.repeat.type && t.repeat.type !== 'none');
export const compId = (taskId, date) => `${taskId}_${date}`;

/** Does task occur on date (YYYY-MM-DD)? */
export function occursOn(task, date) {
  if (!task || !task.date || date < task.date) return false;
  if (task.until && date > task.until) return false;
  const r = task.repeat || { type: 'none' };
  const every = Math.max(1, parseInt(r.every) || 1);
  const s = parseYmd(task.date), d = parseYmd(date);
  switch (r.type) {
    case 'daily': return dayDiff(task.date, date) % every === 0;
    case 'weekly': {
      const days = r.days && r.days.length ? r.days : [s.getDay()];
      if (!days.includes(d.getDay())) return false;
      return Math.round((weekStart(d) - weekStart(s)) / (7 * DAY)) % every === 0;
    }
    case 'monthly': {
      const months = (d.getFullYear() - s.getFullYear()) * 12 + d.getMonth() - s.getMonth();
      if (months % every !== 0) return false;
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return d.getDate() === Math.min(s.getDate(), last);
    }
    default: return date === task.date;
  }
}

export const assignedTo = (t, uid) => !uid || !t.assignee || t.assignee === 'all' || t.assignee === uid;

/** % completion for a day. Skipped occurrences are left out of the total. */
export function dayStats(tasks, comps, date, uid) {
  let total = 0, done = 0;
  for (const t of tasks) {
    if (!occursOn(t, date) || !assignedTo(t, uid)) continue;
    const c = comps[compId(t.id, date)];
    if (c && c.status === 'skip') continue;
    total++;
    if (c && c.status === 'done') done++;
  }
  return { total, done, pct: total ? Math.round(done * 100 / total) : null };
}

/** One-off tasks from before `date` that were never completed. */
export function overdue(tasks, comps, date, uid) {
  return tasks.filter(t => !isRecurring(t) && t.date < date && assignedTo(t, uid) && !comps[compId(t.id, t.date)]);
}

/** Current date + minutes-since-midnight in a time zone. */
export function nowInTz(tz, now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: parseInt(p.hour) * 60 + parseInt(p.minute) };
}

/** Reminder offsets (minutes before the task time). Recurring: 5 min before. One-off: day before + 2 h before. */
export const defaultRemind = recurring => recurring ? { on: true, offsets: [5], nag: 30 } : { on: true, offsets: [1440, 120], nag: 60 };
export function remindOffsets(task) {
  const r = task.remind; if (!r || r.on === false || !task.time) return [];
  if (Array.isArray(r.offsets)) return r.offsets;
  return [r.before || 0]; // older format
}

/** Recurring occurrences on `date` that nobody marked (done / not done / skipped). */
export function unfinished(tasks, comps, date, uid) {
  return tasks.filter(t => isRecurring(t) && occursOn(t, date) && assignedTo(t, uid) && !comps[compId(t.id, date)]);
}

// Firestore runner for the reminder rules in core.mjs — run by GitHub Actions every ~5 minutes.
// Reads as little as possible: tasks first; everything else only if something might be due.
import admin from 'firebase-admin';
import webpush from 'web-push';
import { nowInTz, addDays } from '../recur.js';
import { candidates, pending, neededCompletions, build } from './core.mjs';

const DRY = process.argv.includes('--dry');
let sa;
try { sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || ''); if (!sa.private_key || !sa.client_email) throw new Error('missing fields'); }
catch (e) {
  const v = process.env.FIREBASE_SERVICE_ACCOUNT || '';
  console.error(`FIREBASE_SERVICE_ACCOUNT secret is not the service-account JSON (${e.message}). It is ${v.length} characters long and starts with "${v.trim()[0] || '(empty)'}"; it must be the whole downloaded .json file, starting with { and containing "private_key".`);
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:razem@example.com', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);

async function handle(hdoc, idx) {
  const H = hdoc.data(), ref = hdoc.ref;
  const { date, minutes } = nowInTz(H.tz || 'Europe/Warsaw');
  const yday = addDays(date, -1);

  // active tasks + one-offs nobody has closed yet (old finished one-offs are never read)
  const [actS, openS] = await Promise.all([
    ref.collection('tasks').where('endDate', '>=', yday).get(),
    ref.collection('tasks').where('closed', '==', false).get(),
  ]);
  const byId = new Map(); [...actS.docs, ...openS.docs].forEach(d => byId.set(d.id, { id: d.id, ...d.data() }));
  const tasks = [...byId.values()];

  const tag = `home#${idx}`;
  if (process.env.RAZEM_DIAG || process.argv.includes('--diag')) {   // counts only — nothing private
    const n = async c => (await ref.collection(c).count().get()).data().count;
    console.log(`${tag} stored: tasks=${await n('tasks')} completions=${await n('completions')} shopping=${await n('shopping')} meals=${await n('meals')} products=${await n('products')} phones=${await n('pushSubs')} members=${(H.members || []).length}`);
  } // never log the household id: it is the invite code, and Actions logs of a public repo are public
  let cands = candidates({ household: H, tasks, date, minutes });
  console.log(`${tag} ${date} ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} tasks=${tasks.length} timed=${tasks.filter(t => t.time).length} due-now=${cands.length}`);
  if (!cands.length) return;
  const [stT, stY] = await Promise.all([ref.collection('notify').doc(date).get(), ref.collection('notify').doc(yday).get()]);
  const sent = { ...(stY.data() || {}), ...(stT.data() || {}) };
  cands = pending(cands, sent, minutes);
  console.log(`${tag} not-yet-sent=${cands.length}`);
  if (!cands.length) return;

  const need = neededCompletions(cands, date);
  const [byIdS, subsS, mealS, ...dayS] = await Promise.all([
    need.ids.length ? db.getAll(...need.ids.map(id => ref.collection('completions').doc(id))) : [],
    ref.collection('pushSubs').get(),
    cands.some(c => c.kind === 'morning') ? ref.collection('meals').doc(date).get() : null,
    ...need.days.map(d => ref.collection('completions').where('date', '==', d).get()),
  ]);
  const comps = {};
  byIdS.forEach(d => { if (d.exists) comps[d.id] = d.data(); });
  dayS.forEach(s => s.forEach(d => { comps[d.id] = d.data(); }));

  const { outbox, changed } = build({ household: H, tasks, cands, sent, comps, meal: mealS?.exists ? mealS.data().name : null, date, minutes });

  const subs = subsS.docs.map(d => ({ ref: d.ref, ...d.data() }));
  console.log(`${tag} messages=${outbox.length} phones=${subs.length}`);
  for (const { uids, payload } of outbox) {
    for (const s of subs.filter(s => !s.dead && uids.includes(s.uid))) {
      if (DRY) { console.log(`${tag} (dry) would send to phone ${subs.indexOf(s) + 1}`); continue; }
      try { await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 3600, urgency: 'high' }); console.log(`${tag} sent to phone ${subs.indexOf(s) + 1}`); }
      catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) { s.dead = true; await s.ref.delete(); console.log('  removed expired subscription'); }
        else console.error('  push failed', e.statusCode, e.body);
      }
    }
  }
  if (Object.keys(changed).length && !DRY) {
    await ref.collection('notify').doc(date).set(changed, { merge: true });
    if (changed[`_evening@${date}`]) await ref.collection('notify').doc(addDays(date, -7)).delete().catch(() => { });
  }
}

const hs = await db.collection('households').get();
for (const [i, h] of hs.docs.entries()) await handle(h, i + 1).catch(e => console.error(`home#${i + 1}`, e.message));
console.log(`checked ${hs.size} household(s)`);

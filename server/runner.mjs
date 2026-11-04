// Reminder runner that needs nothing but fetch() and WebCrypto, so the SAME code runs
//  - on Cloudflare Workers today (cloudflare-worker.js is this file bundled), and
//  - on a home server later (node server/node-entry.mjs).
// It signs in to Google with the Firebase service account, talks to Firestore over its REST API,
// applies the rules from core.mjs and sends Web Push (VAPID + aes128gcm, RFC 8291/8292).
import { nowInTz, addDays, monthRange, prevMonth } from '../recur.js';
import { candidates, pending, neededCompletions, build } from './core.mjs';

const te = new TextEncoder();
const b64uEnc = buf => { let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64uDec = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); s += '==='.slice((s.length + 3) % 4); return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const concat = (...a) => { const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a) { out.set(x, o); o += x.length; } return out; };

/* ---------- Google sign-in with the service account (OAuth JWT bearer) ---------- */
let tokenCache = null;
async function googleToken(sa) {
  if (tokenCache && tokenCache.email === sa.client_email && tokenCache.exp > Date.now() + 120000) return tokenCache.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64uEnc(te.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = b64uEnc(te.encode(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })));
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, te.encode(`${head}.${claims}`));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${head}.${claims}.${b64uEnc(sig)}`,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Google sign-in failed (${j.error_description || j.error || r.status})`);
  tokenCache = { email: sa.client_email, token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return j.access_token;
}

/* ---------- Firestore REST ---------- */
const OPS = { '==': 'EQUAL', '>=': 'GREATER_THAN_OR_EQUAL', '<=': 'LESS_THAN_OR_EQUAL' };
function fromV(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromV);
  return null;
}
const fromFields = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, fromV(v)]));
function toV(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === 'string') return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(toV) } };
  return { mapValue: { fields: toFields(x) } };
}
const toFields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toV(v)]));
const fieldPath = k => /^[A-Za-z_][A-Za-z_0-9]*$/.test(k) ? k : '`' + k.replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`';

function firestore(projectId, token, counter) {
  const root = `projects/${projectId}/databases/(default)/documents`;
  const call = async (path, body) => {
    counter.calls++;
    const r = await fetch(`https://firestore.googleapis.com/v1/${path}`, {
      method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Firestore ${r.status} ${(Array.isArray(j) ? j[0]?.error?.message : j.error?.message) || ''}`.trim());
    return j;
  };
  const rel = name => name.slice(root.length + 1);
  const doc = d => ({ id: d.name.split('/').pop(), path: rel(d.name), ...fromFields(d.fields) });
  return {
    async list(coll) {
      const out = []; let pt = '';
      do {
        const j = await call(`${root}/${coll}?pageSize=300${pt ? `&pageToken=${encodeURIComponent(pt)}` : ''}`);
        (j.documents || []).forEach(d => out.push(doc(d))); pt = j.nextPageToken || '';
      } while (pt);
      return out;
    },
    async query(parent, coll, filters) {
      const f = filters.map(([field, op, value]) => ({ fieldFilter: { field: { fieldPath: field }, op: OPS[op], value: toV(value) } }));
      const where = f.length === 1 ? f[0] : { compositeFilter: { op: 'AND', filters: f } };
      const j = await call(`${root}/${parent}:runQuery`, { structuredQuery: { from: [{ collectionId: coll }], where } });
      return j.filter(x => x.document).map(x => doc(x.document));
    },
    async getMany(paths) {
      if (!paths.length) return [];
      const j = await call(`${root}:batchGet`, { documents: paths.map(p => `${root}/${p}`) });
      const m = new Map(j.map(x => x.found ? [rel(x.found.name), doc(x.found)] : [rel(x.missing), null]));
      return paths.map(p => m.get(p) ?? null);
    },
    async merge(path, data) {
      await call(`${root}:commit`, { writes: [{ update: { name: `${root}/${path}`, fields: toFields(data) }, updateMask: { fieldPaths: Object.keys(data).map(fieldPath) } }] });
    },
    async remove(path) { await call(`${root}:commit`, { writes: [{ delete: `${root}/${path}` }] }).catch(() => { }); },
  };
}
const plain = d => { if (!d) return d; const { path: _p, ...rest } = d; return rest; };

/* ---------- Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) ---------- */
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}
export async function encryptPayload(sub, text, opts = {}) {
  const ua = b64uDec(sub.keys.p256dh), auth = b64uDec(sub.keys.auth);
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  const kp = opts.keyPair || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, kp.privateKey, 256));
  const ikm = await hkdf(auth, ecdh, concat(te.encode('WebPush: info\0'), ua, asPub), 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(te.encode(text), new Uint8Array([2]))));
  const head = new Uint8Array(21); head.set(salt, 0); new DataView(head.buffer).setUint32(16, 4096); head[20] = 65;
  return concat(head, asPub, ct);
}
const vapidKeys = new Map();
export async function vapidAuth(endpoint, pubB64, privB64, subject) {
  let key = vapidKeys.get(privB64);
  if (!key) {
    const pub = b64uDec(pubB64);
    key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: privB64, x: b64uEnc(pub.slice(1, 33)), y: b64uEnc(pub.slice(33, 65)), ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    vapidKeys.set(privB64, key);
  }
  const h = b64uEnc(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const c = b64uEnc(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject || 'mailto:razem@example.com' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(`${h}.${c}`));
  return `vapid t=${h}.${c}.${b64uEnc(sig)}, k=${pubB64}`;
}
async function sendPush(sub, payload, env) {
  const body = await encryptPayload(sub, JSON.stringify(payload));
  const r = await fetch(sub.endpoint, {
    method: 'POST', body,
    headers: { authorization: await vapidAuth(sub.endpoint, env.VAPID_PUBLIC, env.VAPID_PRIVATE, env.VAPID_SUBJECT),
      'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '3600', urgency: 'high' },
  });
  return r.status;
}

/* ---------- task list cache: tasks change rarely, so they are re-read only when the app bumps tasksRev ---------- */
const memCache = new Map();

/* ---------- the run ---------- */
export async function runOnce(env, { diag = false, log = console.log } = {}) {
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT || '{}');
  if (!sa.private_key || !sa.client_email) throw new Error('FIREBASE_SERVICE_ACCOUNT is not the service-account JSON');
  const counter = { calls: 0 };
  const db = firestore(sa.project_id, await googleToken(sa), counter);
  const homes = await db.list('households');
  for (const [i, h] of homes.entries()) {
    await handle(db, h, i + 1, env, { diag, log }).catch(e => log(`home#${i + 1} error: ${e.message}`));
  }
  log(`checked ${homes.length} household(s), ${counter.calls} database calls`);
}

async function handle(db, H, idx, env, { diag, log }) {
  const tag = `home#${idx}`; // never log the household id: it is the invite code
  const hp = `households/${H.id}`, members = H.members || [];
  const { date, minutes } = nowInTz(H.tz || 'Europe/Warsaw');
  const yday = addDays(date, -1);

  // tasks: shared + each member's private ones (users/{uid}/ptasks; the other member can't read those)
  const users = await db.getMany(members.map(u => `users/${u}`));
  const ck = `${H.id}|${date}|${H.tasksRev || 0}|${users.map(u => u?.tasksRev || 0).join(',')}`;
  let tasks = memCache.get(ck);
  if (!tasks) {
    const lists = await Promise.all([
      db.query(hp, 'tasks', [['endDate', '>=', yday]]), db.query(hp, 'tasks', [['closed', '==', false]]),
      ...members.flatMap(u => [db.query(`users/${u}`, 'ptasks', [['endDate', '>=', yday]]), db.query(`users/${u}`, 'ptasks', [['closed', '==', false]])]),
    ]);
    const byId = new Map();
    lists.forEach((l, i) => {
      const owner = i < 2 ? null : members[Math.floor((i - 2) / 2)];
      l.forEach(d => byId.set(d.id, owner ? { ...plain(d), private: true, _owner: owner, assignee: owner } : plain(d)));
    });
    tasks = [...byId.values()];
    memCache.clear(); memCache.set(ck, tasks);
  }
  const ownerOf = new Map(tasks.filter(t => t._owner).map(t => [t.id, t._owner]));
  const compPath = id => { const o = ownerOf.get(id.slice(0, id.lastIndexOf('_'))); return o ? `users/${o}/pcomps/${id}` : `${hp}/completions/${id}`; };

  let cands = candidates({ household: H, tasks, date, minutes });
  log(`${tag} ${date} ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} tasks=${tasks.length} timed=${tasks.filter(t => t.time).length} due-now=${cands.length}`);
  if (!cands.length && !diag) return;
  const [stT, stY] = await db.getMany([`${hp}/notify/${date}`, `${hp}/notify/${yday}`]);
  const sent = { ...(plain(stY) || {}), ...(plain(stT) || {}) };
  delete sent.id;
  cands = pending(cands, sent, minutes);
  if (diag) log(`${tag} not-yet-sent=${cands.length} members=${members.length}`);
  if (!cands.length) return;

  const need = neededCompletions(cands, date);
  const [byId, subs, meal, ...days] = await Promise.all([
    db.getMany(need.ids.map(compPath)),
    db.list(`${hp}/pushSubs`),
    cands.some(c => c.kind === 'morning') ? db.getMany([`${hp}/meals/${date}`]).then(r => r[0]) : null,
    ...need.days.flatMap(d => [db.query(hp, 'completions', [['date', '==', d]]), ...members.map(u => db.query(`users/${u}`, 'pcomps', [['date', '==', d]]))]),
  ]);
  const comps = {};
  byId.forEach((d, i) => { if (d) comps[need.ids[i]] = plain(d); });
  days.forEach(l => l.forEach(d => { comps[d.id] = plain(d); }));

  let monthData = null;
  const mc = cands.find(c => c.kind === 'month');
  if (mc) {
    const ym = mc.key.split('@')[1], from = monthRange(prevMonth(ym)).first, to = monthRange(ym).last;
    const range = [['date', '>=', from], ['date', '<=', to]];
    const [mt, mcs, ...pv] = await Promise.all([
      db.query(hp, 'tasks', [['endDate', '>=', from]]), db.query(hp, 'completions', range),
      ...members.flatMap(u => [db.query(`users/${u}`, 'ptasks', [['endDate', '>=', from]]), db.query(`users/${u}`, 'pcomps', range)]),
    ]);
    const mtasks = mt.map(plain), mcomps = Object.fromEntries(mcs.map(d => [d.id, plain(d)]));
    members.forEach((u, i) => {
      pv[2 * i].forEach(d => mtasks.push({ ...plain(d), private: true, _owner: u, assignee: u }));
      pv[2 * i + 1].forEach(d => { mcomps[d.id] = plain(d); });
    });
    monthData = { tasks: mtasks, comps: mcomps };
  }

  const { outbox, changed } = build({ household: H, tasks, cands, sent, comps, meal: meal?.name || null, date, minutes, monthData });
  log(`${tag} messages=${outbox.length} phones=${subs.length}`);
  for (const { uids, payload } of outbox) {
    for (const s of subs.filter(s => !s.dead && uids.includes(s.uid))) {
      try {
        const st = await sendPush(s.sub, payload, env);
        if (st === 404 || st === 410) { s.dead = true; await db.remove(s.path); log(`${tag} removed an expired phone`); }
        else log(`${tag} sent to phone ${subs.indexOf(s) + 1} (${st})`);
      } catch (e) { log(`${tag} push failed: ${e.message}`); }
    }
  }
  if (Object.keys(changed).length) {
    await db.merge(`${hp}/notify/${date}`, changed);
    if (changed[`_evening@${date}`]) await db.remove(`${hp}/notify/${addDays(date, -7)}`);
  }
}

/** Sends a test notification to every registered phone (used by the worker's test link). */
export async function sendTest(env, { log = console.log } = {}) {
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT || '{}');
  const db = firestore(sa.project_id, await googleToken(sa), { calls: 0 });
  for (const [i, h] of (await db.list('households')).entries()) {
    const subs = await db.list(`households/${h.id}/pushSubs`);
    for (const [k, s] of subs.entries()) {
      const st = await sendPush(s.sub, { title: 'Razem', body: 'Test z serwera przypomnień ✓', tag: 'server-test' }, env).catch(e => e.message);
      log(`home#${i + 1} phone ${k + 1}: ${st}`);
    }
  }
}

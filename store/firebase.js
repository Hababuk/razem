// Firebase adapter: Firebase Auth (email/password) + Firestore with offline cache.
import { Base, COLORS, rid, today } from './base.js';
import { compId, addDays } from '../recur.js';

export async function createFirebaseStore(config) {
  const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const [{ initializeApp }, A, F] = await Promise.all([
    import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
  return new FireStore(initializeApp(config), A, F);
}

class FireStore extends Base {
  constructor(app, A, F) {
    super(); this.A = A; this.F = F; this.demo = false;
    this.auth = A.getAuth(app);
    try { this.db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
    catch { this.db = F.getFirestore(app); }
    this.uUnsubs = []; this.hUnsubs = [];
    A.onAuthStateChanged(this.auth, u => this._onUser(u));
  }
  _stopH() { this.hUnsubs.forEach(f => f()); this.hUnsubs = []; this.hid = undefined; }
  _onUser(u) {
    this.uUnsubs.forEach(f => f()); this.uUnsubs = []; this._stopH();
    if (!u) return this.emit({ phase: 'signedOut', user: null, household: null, tasks: [], comps: {}, shopping: [], meals: {}, recipes: [], products: {}, notes: {} });
    const user = { uid: u.uid, email: u.email };
    this.emit({ user });
    const { doc, onSnapshot } = this.F;
    this.uUnsubs.push(onSnapshot(doc(this.db, 'users', u.uid), s => {
      const hid = s.data()?.hid || null;
      if (hid === this.hid) return;
      this._stopH(); this.hid = hid;
      if (hid) this._listen(hid); else this.emit({ phase: 'noHousehold', household: null });
    }, () => this.emit({ phase: 'noHousehold' })));
  }
  _listen(hid) {
    const { doc, collection, onSnapshot, query, where } = this.F;
    const h = doc(this.db, 'households', hid);
    const err = e => console.warn(e);
    this.hUnsubs = [
      onSnapshot(h, s => {
        if (!s.exists() || !s.data().members?.includes(this.state.user.uid)) return this.emit({ phase: 'noHousehold', household: null });
        this.emit({ household: { id: hid, ...s.data() }, phase: 'ready' });
      }, () => this.emit({ phase: 'noHousehold', household: null })),
      onSnapshot(collection(h, 'tasks'), s => this.emit({ tasks: s.docs.map(d => ({ id: d.id, ...d.data() })) }), err),
      onSnapshot(query(collection(h, 'completions'), where('date', '>=', addDays(today(), -400))), s => {
        const m = {}; s.forEach(d => { m[d.id] = d.data(); }); this.emit({ comps: m });
      }, err),
      onSnapshot(collection(h, 'shopping'), s => this.emit({ shopping: s.docs.map(d => ({ id: d.id, ...d.data() })) }), err),
      onSnapshot(query(collection(h, 'meals'), where('date', '>=', addDays(today(), -60))), s => {
        const m = {}; s.forEach(d => { m[d.id] = d.data(); }); this.emit({ meals: m });
      }, err),
      onSnapshot(collection(h, 'recipes'), s => this.emit({ recipes: s.docs.map(d => ({ id: d.id, ...d.data() })) }), err),
      onSnapshot(query(collection(h, 'notes'), where('date', '>=', addDays(today(), -400))), s => {
        const m = {}; s.forEach(d => { m[d.id] = d.data(); }); this.emit({ notes: m });
      }, err),
      onSnapshot(collection(h, 'products'), s => { const m = {}; s.forEach(d => { m[d.id] = d.data(); }); this.emit({ products: m }); }, err),
    ];
  }
  hRef(...p) { return this.F.doc(this.db, 'households', this.hid, ...p); }
  // writes resolve when the server acks; the UI updates instantly from the local cache, so don't block on them
  _w(p) { return p.catch(e => { this.onError?.(e); throw e; }); }

  signIn(e, p) { return this.A.signInWithEmailAndPassword(this.auth, e, p); }
  signUp(e, p) { return this.A.createUserWithEmailAndPassword(this.auth, e, p); }
  resetPassword(e) { return this.A.sendPasswordResetEmail(this.auth, e); }
  signOut() { return this.A.signOut(this.auth); }

  async createHousehold(name) {
    const { setDoc, doc, serverTimestamp } = this.F, uid = this.state.user.uid, hid = rid(8);
    await setDoc(doc(this.db, 'households', hid), {
      members: [uid], names: { [uid]: name }, colors: { [uid]: COLORS[0] },
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw',
      morningAt: '08:00', eveningAt: '20:00', createdAt: serverTimestamp()
    });
    await setDoc(doc(this.db, 'users', uid), { hid });
  }
  async joinHousehold(code, name) {
    const { getDoc, updateDoc, setDoc, doc, arrayUnion } = this.F, uid = this.state.user.uid, hid = code.trim().toUpperCase();
    const ref = doc(this.db, 'households', hid);
    const s = await getDoc(ref).catch(() => null);
    if (!s || !s.exists()) throw new Error('badCode');
    const used = Object.values(s.data().colors || {});
    await updateDoc(ref, { members: arrayUnion(uid), [`names.${uid}`]: name, [`colors.${uid}`]: COLORS.find(c => !used.includes(c)) || COLORS[1] });
    await setDoc(doc(this.db, 'users', uid), { hid });
  }
  updateHousehold(patch) { return this._w(this.F.updateDoc(this.hRef(), patch)); }

  saveTask(task) {
    const { setDoc, collection, doc, serverTimestamp } = this.F;
    const { id, ...data } = task;
    const ref = id ? this.hRef('tasks', id) : doc(collection(this.db, 'households', this.hid, 'tasks'));
    if (!id) { data.createdBy = this.state.user.uid; data.createdAt = serverTimestamp(); }
    return this._w(setDoc(ref, data, { merge: true }));
  }
  deleteTask(id) { return this._w(this.F.deleteDoc(this.hRef('tasks', id))); }
  setCompletion(taskId, date, status) {
    const ref = this.hRef('completions', compId(taskId, date));
    if (!status) return this._w(this.F.deleteDoc(ref));
    return this._w(this.F.setDoc(ref, { taskId, date, status, by: this.state.user.uid, at: Date.now() }));
  }
  /** Note for one day of a task ("walked 20 min, he was limping"). Empty text = remove. */
  setNote(taskId, date, text) {
    const ref = this.hRef('notes', compId(taskId, date));
    return this._w(text ? this.F.setDoc(ref, { taskId, date, text, by: this.state.user.uid, at: Date.now() }) : this.F.deleteDoc(ref));
  }
  addItem(name) {
    const { setDoc, collection, doc } = this.F;
    return this._w(setDoc(doc(collection(this.db, 'households', this.hid, 'shopping')), { name, done: false, by: this.state.user.uid, at: Date.now() }));
  }
  addItems(names) {
    const { writeBatch, collection, doc } = this.F, b = writeBatch(this.db), now = Date.now();
    names.forEach((name, i) => b.set(doc(collection(this.db, 'households', this.hid, 'shopping')), { name, done: false, by: this.state.user.uid, at: now + i }));
    return this._w(b.commit());
  }
  setMeal(date, meal) {
    const ref = this.hRef('meals', date);
    return this._w(meal ? this.F.setDoc(ref, { ...meal, date, by: this.state.user.uid }) : this.F.deleteDoc(ref));
  }
  saveRecipe(r) {
    const { setDoc, collection, doc } = this.F, { id, ...data } = r;
    return this._w(setDoc(id ? this.hRef('recipes', id) : doc(collection(this.db, 'households', this.hid, 'recipes')), data, { merge: true }));
  }
  /** Product memory: { name, cat, biedronka: {price, at}, lidl: {...}, aliases: [receipt names] }. null value = remove field. */
  updateProduct(key, patch) {
    const data = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v == null ? this.F.deleteField() : v]));
    return this._w(this.F.setDoc(this.hRef('products', key), data, { merge: true }));
  }
  deleteRecipe(id) { return this._w(this.F.deleteDoc(this.hRef('recipes', id))); }
  toggleItem(item) { return this._w(this.F.updateDoc(this.hRef('shopping', item.id), { done: !item.done, doneAt: Date.now() })); }
  deleteItem(id) { return this._w(this.F.deleteDoc(this.hRef('shopping', id))); }
  clearDone() {
    const b = this.F.writeBatch(this.db);
    this.state.shopping.filter(i => i.done).forEach(i => b.delete(this.hRef('shopping', i.id)));
    return this._w(b.commit());
  }
  async savePushSub(sub) {
    const id = await subId(sub.endpoint);
    return this.F.setDoc(this.hRef('pushSubs', id), { uid: this.state.user.uid, sub, ua: navigator.userAgent, at: Date.now() });
  }
  async removePushSub(endpoint) { return this.F.deleteDoc(this.hRef('pushSubs', await subId(endpoint))); }
}

async function subId(endpoint) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(h).slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
}

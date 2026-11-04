// Demo adapter: everything in localStorage on this device.
import { Base, COLORS, rid, today } from './base.js';
import { compId, addDays } from '../recur.js';
import { guessCat } from '../cats.js';

export function createLocalStore() { return new LocalStore(); }

const KEY = 'razem-demo-v5';
class LocalStore extends Base {
  constructor() {
    super(); this.demo = true;
    let d = null; try { d = JSON.parse(localStorage.getItem(KEY)); } catch { }
    if (d && !d.products) d = null; // old demo data
    this.d = d || seed();
    this._sync();
  }
  _sync() {
    try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch { }
    this.emit({ phase: 'ready', user: { uid: 'me', email: 'demo@razem.app' }, household: this.d.household,
      tasks: [...this.d.tasks], comps: { ...this.d.comps }, shopping: [...this.d.shopping], meals: { ...this.d.meals }, recipes: [...this.d.recipes], products: structuredClone(this.d.products), notes: { ...(this.d.notes || {}) } });
  }
  reset() { this.d = seed(); this._sync(); }
  signOut() { }
  updateHousehold(patch) {
    const h = structuredClone(this.d.household);
    for (const [k, v] of Object.entries(patch)) { const p = k.split('.'); let o = h; while (p.length > 1) { const k = p.shift(); o = o[k] ||= {}; } o[p[0]] = v; }
    this.d.household = h; this._sync(); return Promise.resolve();
  }
  saveTask(task) {
    if (task.id) { const i = this.d.tasks.findIndex(x => x.id === task.id); this.d.tasks[i] = { ...this.d.tasks[i], ...task }; }
    else this.d.tasks.push({ ...task, id: rid(), createdBy: 'me' });
    this._sync(); return Promise.resolve();
  }
  deleteTask(id) { this.d.tasks = this.d.tasks.filter(x => x.id !== id); this._sync(); return Promise.resolve(); }
  setCompletion(taskId, date, status) {
    const k = compId(taskId, date);
    if (status) this.d.comps[k] = { taskId, date, status, by: 'me', at: Date.now() }; else delete this.d.comps[k];
    this._sync(); return Promise.resolve();
  }
  setNote(taskId, date, text) {
    this.d.notes ||= {}; const k = compId(taskId, date);
    if (text) this.d.notes[k] = { taskId, date, text, by: 'me', at: Date.now() }; else delete this.d.notes[k];
    this._sync(); return Promise.resolve();
  }
  addItem(name) { this.d.shopping.push({ id: rid(), name, done: false, by: 'me', at: Date.now() }); this._sync(); return Promise.resolve(); }
  addItems(names) { names.forEach((name, k) => this.d.shopping.push({ id: rid(), name, done: false, by: 'me', at: Date.now() + k })); this._sync(); return Promise.resolve(); }
  setMeal(date, meal) { if (meal) this.d.meals[date] = { ...meal, date, by: 'me' }; else delete this.d.meals[date]; this._sync(); return Promise.resolve(); }
  saveRecipe(r) {
    if (r.id) { const i = this.d.recipes.findIndex(x => x.id === r.id); this.d.recipes[i] = { ...this.d.recipes[i], ...r }; }
    else this.d.recipes.push({ ...r, id: rid() });
    this._sync(); return Promise.resolve();
  }
  updateProduct(key, patch) {
    const p = this.d.products[key] ||= {};
    for (const [k, v] of Object.entries(patch)) { if (v == null) delete p[k]; else p[k] = v; }
    this._sync(); return Promise.resolve();
  }
  deleteRecipe(id) { this.d.recipes = this.d.recipes.filter(x => x.id !== id); this._sync(); return Promise.resolve(); }
  updateItem(id, patch) { const i = this.d.shopping.find(x => x.id === id); if (i) Object.assign(i, patch); this._sync(); return Promise.resolve(); }
  toggleItem(item) { const i = this.d.shopping.find(x => x.id === item.id); i.done = !i.done; i.doneAt = Date.now(); this._sync(); return Promise.resolve(); }
  deleteItem(id) { this.d.shopping = this.d.shopping.filter(x => x.id !== id); this._sync(); return Promise.resolve(); }
  clearDone() { this.d.shopping = this.d.shopping.filter(x => !x.done); this._sync(); return Promise.resolve(); }
  savePushSub() { return Promise.resolve(); }
  removePushSub() { return Promise.resolve(); }
}

function seed() {
  const pl = (localStorage.getItem('razem-lang') || navigator.language || 'pl').toLowerCase().startsWith('pl');
  const T = pl ? ['Spacer z psem', 'Tabletki', 'Bieżnia 30 min', 'Wynieść śmieci', 'Odkurzanie', 'Zadzwonić do mamy', 'Wieczorny spacer z psem', 'Podlać kwiaty', 'Fryzjer']
               : ['Walk the dog', 'Take pills', 'Treadmill 30 min', 'Take out the trash', 'Vacuum', 'Call mom', 'Evening dog walk', 'Water the plants', 'Hairdresser'];
  const t0 = today(), start = addDays(t0, -45), rem = (offsets = [5], nag = 30) => ({ on: true, offsets, nag });
  const tasks = [
    { id: 'a', title: T[0], date: start, time: '07:00', repeat: { type: 'daily', every: 1 }, assignee: 'all', remind: rem() },
    { id: 'b', title: T[1], date: start, time: '08:30', repeat: { type: 'daily', every: 1 }, assignee: 'me', remind: rem([5], 15) },
    { id: 'c', title: T[2], date: start, time: '18:00', repeat: { type: 'weekly', every: 1, days: [1, 3, 5] }, assignee: 'me', remind: rem([15], 0) },
    { id: 'd', title: T[3], date: start, time: null, repeat: { type: 'weekly', every: 1, days: [2] }, assignee: 'partner', remind: rem() },
    { id: 'e', title: T[4], date: start, time: null, repeat: { type: 'weekly', every: 1, days: [6] }, assignee: 'all', remind: rem() },
    { id: 'f', title: T[5], date: t0, time: '17:00', repeat: { type: 'none' }, assignee: 'partner', remind: rem([1440, 120], 60) },
    { id: 'i', title: T[8], date: addDays(t0, 2), time: '10:30', repeat: { type: 'none' }, assignee: 'me', remind: rem([1440, 120], 60) },
    { id: 'g', title: T[6], date: start, time: '20:30', repeat: { type: 'daily', every: 1 }, assignee: 'all', remind: rem() },
    { id: 'h', title: T[7], date: start, time: null, repeat: { type: 'daily', every: 3 }, assignee: 'partner', remind: rem() },
  ];
  // fake history so the calendar has something to show
  const comps = {}; let x = 7;
  const rnd = () => (x = (x * 9301 + 49297) % 233280) / 233280;
  for (let i = 45; i >= 1; i--) {
    const day = addDays(t0, -i);
    for (const tk of tasks) {
      if (tk.repeat.type === 'none') continue;
      // reuse occurrence logic lazily to avoid an import cycle
      if (rnd() < 0.82) comps[compId(tk.id, day)] = { taskId: tk.id, date: day, status: 'done', by: rnd() < .5 ? 'me' : 'partner', at: 0 };
    }
  }
  comps[compId('a', t0)] = { taskId: 'a', date: t0, status: 'done', by: 'partner', at: new Date().setHours(7, 12) };
  const R = pl ? [['Spaghetti bolognese', 'makaron spaghetti\nmięso mielone 500 g\npassata\ncebula\nczosnek\nparmezan'],
    ['Kurczak curry z ryżem', 'filet z kurczaka\nmleko kokosowe\npasta curry\nryż\npapryka'], ['Pierogi ruskie', 'pierogi ruskie\ncebula\nśmietana'],
    ['Zupa pomidorowa', 'passata\nbulion\nmakaron\nśmietana'], ['Łosoś z warzywami', 'łosoś\nbrokuły\nziemniaki\ncytryna']]
    : [['Spaghetti bolognese', 'spaghetti\nminced beef 500 g\npassata\nonion\ngarlic\nparmesan'], ['Chicken curry with rice', 'chicken breast\ncoconut milk\ncurry paste\nrice\npepper'],
    ['Pierogi', 'pierogi\nonion\nsour cream'], ['Tomato soup', 'passata\nstock\npasta\ncream'], ['Salmon & veg', 'salmon\nbroccoli\npotatoes\nlemon']];
  const recipes = R.map(([name, ing], i) => ({ id: 'r' + i, name, ingredients: ing.split('\n'), uses: 5 - i }));
  const meals = {};
  [[-1, 2, 'partner'], [0, 0, 'me'], [1, 1, 'partner'], [3, 3, 'all']].forEach(([o, r, cook]) => {
    const d = addDays(t0, o); meals[d] = { date: d, name: recipes[r].name, ingredients: recipes[r].ingredients, cook, notes: '', recipeId: recipes[r].id };
  });
  return {
    household: { id: 'DEMO1234', members: ['me', 'partner'], names: { me: 'D', partner: 'E' },
      colors: { me: COLORS[0], partner: COLORS[1] }, tz: 'Europe/Warsaw', morningAt: '08:00', eveningAt: '20:00' },
    tasks, comps, meals, recipes, products: Object.fromEntries(Object.entries(pl
      ? { 'mleko': ['Mleko', 3.49, 3.29], 'chleb': ['Chleb', 4.99, 4.79], 'karma-dla-psa': ['Karma dla psa', 24.99, null], 'jajka': ['Jajka', 11.99, 10.99], 'pomidory': ['Pomidory', 9.99, 8.49] }
      : { 'milk': ['Milk', 3.49, 3.29], 'bread': ['Bread', 4.99, 4.79], 'dog-food': ['Dog food', 24.99, null], 'eggs': ['Eggs', 11.99, 10.99], 'tomatoes': ['Tomatoes', 9.99, 8.49] })
      .concat((pl ? ['Masło', 'Banany', 'Ser żółty', 'Jogurt naturalny', 'Kawa', 'Papier toaletowy', 'Makaron', 'Ogórki', 'Kurczak', 'Woda gazowana'] : ['Butter', 'Bananas', 'Cheese', 'Yogurt', 'Coffee', 'Toilet paper', 'Pasta', 'Cucumbers', 'Chicken', 'Sparkling water'])
        .map(n => [n.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-'), [n, null, null]]))
      .map(([k, [name, b, l]], i) => [k, { name, cat: guessCat(name), uses: 12 - (i % 12), ...(b ? { biedronka: { price: b, at: 0 } } : {}), ...(l ? { lidl: { price: l, at: 0 } } : {}) }])),
    shopping: (pl ? ['Mleko', 'Chleb', 'Karma dla psa', 'Jajka', 'Pomidory'] : ['Milk', 'Bread', 'Dog food', 'Eggs', 'Tomatoes'])
      .map((name, i) => ({ id: 's' + i, name, done: i === 4, by: i % 2 ? 'partner' : 'me', at: i })),
  };
}

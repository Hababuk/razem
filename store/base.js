// Shared pieces for every backend adapter.
import { ymd } from '../recur.js';
export const COLORS = ['#5b7fa6', '#c27a5c', '#6b8f71', '#8a72ad', '#b08f45', '#4f949c']; // muted, to sit with the green accent
export const rid = (n = 20, abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => abc[b % abc.length]).join('');
export const today = () => ymd(new Date());
/** Normalised key for a product, e.g. "2x Mleko 2%" -> "mleko-2" (used for remembered category, prices, receipt names). */
export const itemKey = name => parseQty(name).name.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 80) || 'item';
/** "2x mleko" / "mleko x2" -> { qty: 2, name: "mleko" } */
export function parseQty(s) {
  let m = s.trim().match(/^(\d+)\s*[x×*]\s*(.+)$/i) || s.trim().match(/^(.+?)\s*[x×*]\s*(\d+)$/i);
  if (!m) return { qty: 1, name: s.trim() };
  return /^\d+$/.test(m[1]) ? { qty: +m[1], name: m[2].trim() } : { qty: +m[2], name: m[1].trim() };
}

export const EMPTY = { phase: 'loading', user: null, household: null, tasks: [], comps: {}, shopping: [], meals: {}, recipes: [], products: {}, notes: {} };
export class Base {
  constructor() { this.state = { ...EMPTY }; this.subs = new Set(); }
  on(cb) { this.subs.add(cb); cb(this.state); return () => this.subs.delete(cb); }
  emit(patch) { Object.assign(this.state, patch); this.subs.forEach(f => f(this.state)); }

  /** Everything in the household as plain JSON — for backups and moving to another backend. */
  exportData() {
    const { household, tasks, comps, shopping, meals, recipes, products, notes } = this.state;
    return { format: 'razem-export', version: 1, exportedAt: new Date().toISOString(), household, tasks,
      completions: Object.values(comps), shopping, meals: Object.values(meals), recipes, products: Object.entries(products).map(([id, p]) => ({ id, ...p })), notes: Object.values(notes) };
  }
}

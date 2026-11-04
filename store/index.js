// Picks the backend adapter. Every adapter implements the same interface (same methods in every adapter),
// so the UI never talks to Firebase directly — moving to a self-hosted server = adding one adapter file.
import { CONFIG } from '../config.js';
export { COLORS } from './base.js';

export const backendName = () => new URLSearchParams(location.search).has('demo') ? 'demo'
  : CONFIG.backend || (CONFIG.firebase?.apiKey ? 'firebase' : 'demo');
export const isDemo = () => backendName() === 'demo';

export async function createStore() {
  switch (backendName()) {
    case 'firebase': return (await import('./firebase.js')).createFirebaseStore(CONFIG.firebase);
    // case 'pocketbase': return (await import('./pocketbase.js')).createPocketBaseStore(CONFIG.pocketbase);
    default: return (await import('./local.js')).createLocalStore();
  }
}

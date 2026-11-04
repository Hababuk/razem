// Home-server entry (Node 22+): the same reminder code as the Cloudflare Worker.
// Usage:  FIREBASE_SERVICE_ACCOUNT='…json…' VAPID_PUBLIC=… VAPID_PRIVATE=… VAPID_SUBJECT=mailto:… node server/node-entry.mjs
// Add --once to run a single check (with counts) and exit; without it, it checks every minute.
import { runOnce } from './runner.mjs';
const env = process.env, once = process.argv.includes('--once');
const tick = () => runOnce(env, { diag: once }).catch(e => console.error(`reminder run failed: ${e.message}`));
if (once) await tick();
else { await tick(); setInterval(tick, 60_000); }

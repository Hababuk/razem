// Cloudflare Worker entry. The cron trigger runs the reminder check; the URL only answers with
// ?token=<RUN_TOKEN> (a password you choose): ?token=… runs a check and shows counts, ?token=…&test sends a test push.
import { runOnce, sendTest } from './runner.mjs';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runOnce(env).catch(e => console.log(`reminder run failed: ${e.message}`)));
  },
  async fetch(request, env) {
    const u = new URL(request.url);
    if (!env.RUN_TOKEN || u.searchParams.get('token') !== env.RUN_TOKEN) return new Response('Razem reminders are running.\n', { status: 200 });
    const lines = [], log = s => lines.push(s);
    try { u.searchParams.has('test') ? await sendTest(env, { log }) : await runOnce(env, { diag: true, log }); }
    catch (e) { lines.push(`error: ${e.message}`); }
    return new Response(lines.join('\n') + '\n', { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  },
};

// POST {confirm: true}: sends every email Arjun has decided on and not yet sent.
// Candidates without a decision are never emailed. Each send is recorded and never repeated.
import { authorized, json, recordEvent } from '../lib/store.js';
import { buildState } from '../lib/state.js';
import { sendEmail } from '../lib/mail.js';

export async function POST(request) {
  if (!authorized(request)) return json({ error: 'unauthorized' }, 401);
  const { confirm } = await request.json();
  if (confirm !== true) return json({ error: 'confirm required' }, 400);
  const queue = (await buildState()).candidates.filter(c => c.decision && !c.sent && c.email);
  const results = [];
  for (const c of queue) {
    const d = c.drafts[c.decision];
    const res = await sendEmail({ to: c.email, subject: d.subject, body: d.body, idempotencyKey: `kargo-${c.id}-${c.decision}` });
    Object.assign(res, { kind: c.decision, at: new Date().toISOString(), subject: d.subject });
    if (res.status !== 'error') await recordEvent(c.id, 'sent', res);
    results.push({ id: c.id, name: c.name, ...res });
    await new Promise(r => setTimeout(r, 600)); // Resend free-tier rate limit
  }
  return json({ results });
}

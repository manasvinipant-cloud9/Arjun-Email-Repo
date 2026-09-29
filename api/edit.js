// POST {id, kind, subject, body}: Arjun edits a draft before sending.
import { authorized, json, recordEvent, validId } from '../lib/store.js';
import { buildState } from '../lib/state.js';

export async function POST(request) {
  if (!authorized(request)) return json({ error: 'unauthorized' }, 401);
  const { id, kind, subject = '', body = '' } = await request.json();
  if (!validId(id) || !['invite', 'rejection'].includes(kind)) return json({ error: 'bad request' }, 400);
  const c = (await buildState()).candidates.find(x => x.id === id);
  if (!c) return json({ error: 'not found' }, 404);
  if (c.sent) return json({ error: 'Email already sent' }, 409);
  await recordEvent(id, `edit-${kind}`, { subject: String(subject).slice(0, 300), body: String(body).slice(0, 10000) });
  return json({ ok: true });
}

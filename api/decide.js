// POST {id, decision: 'invite'|'rejection'|null}: Arjun's call. Locked once the email is sent.
import { authorized, json, recordEvent, validId } from '../lib/store.js';
import { buildState } from '../lib/state.js';

export async function POST(request) {
  if (!authorized(request)) return json({ error: 'unauthorized' }, 401);
  const { id, decision = null } = await request.json();
  if (!validId(id) || !['invite', 'rejection', null].includes(decision)) return json({ error: 'bad request' }, 400);
  const c = (await buildState()).candidates.find(x => x.id === id);
  if (!c) return json({ error: 'not found' }, 404);
  if (c.sent) return json({ error: 'Email already sent, decision is locked' }, 409);
  await recordEvent(id, `decision-${decision || 'none'}`);
  return json({ ok: true });
}

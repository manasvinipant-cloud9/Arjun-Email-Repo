// POST {id}: delete a screened candidate (e.g. uploaded by mistake). Not allowed after an email was sent.
import { authorized, json, removeCandidate, validId } from '../lib/store.js';
import { buildState } from '../lib/state.js';

export async function POST(request) {
  if (!authorized(request)) return json({ error: 'unauthorized' }, 401);
  const { id } = await request.json();
  if (!validId(id)) return json({ error: 'bad request' }, 400);
  const c = (await buildState()).candidates.find(x => x.id === id);
  if (c?.sent) return json({ error: 'Email already sent, keep the record' }, 409);
  await removeCandidate(id);
  return json({ ok: true });
}

import { authorized, json } from '../lib/store.js';
import { buildState } from '../lib/state.js';

export async function GET(request) {
  if (!authorized(request)) return json({ error: 'unauthorized' }, 401);
  return json(await buildState());
}

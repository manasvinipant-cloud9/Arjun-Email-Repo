// Storage for the web app: a PRIVATE Vercel Blob store used as an append-only log.
//   candidates/<id>.json               one screened CV: contact (private) + scores
//   events/<id>/<ts>-decision-<kind>   Arjun's call: invite | rejection | none
//   events/<id>/<ts>-edit-<kind>.json  edited email draft {subject, body}
//   events/<id>/<ts>-sent.json         send result; once present the candidate is locked
// Events always get a fresh pathname, so reads are never stale and nothing is overwritten.
import { del, get, list, put } from '@vercel/blob';
import { timingSafeEqual } from 'node:crypto';

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// Every API route calls this first. The password lives only in the DASHBOARD_PASSWORD env var.
export function authorized(request) {
  const expected = process.env.DASHBOARD_PASSWORD || '';
  const given = request.headers.get('x-kargo-key') || '';
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export const validId = id => /^K-[0-9A-F]{8}$/.test(id);
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

async function listAll(prefix) {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

async function readJSON(pathname) {
  const r = await get(pathname, { access: 'private' });
  if (!r || r.statusCode !== 200) return null;
  return JSON.parse(await new Response(r.stream).text());
}

async function writeJSON(pathname, data, overwrite = false) {
  await put(pathname, JSON.stringify(data), {
    access: 'private', addRandomSuffix: false, allowOverwrite: overwrite, contentType: 'application/json',
  });
}

export async function saveCandidate(record) {
  await writeJSON(`candidates/${record.id}.json`, record, true);
}

export async function candidateExists(id) {
  return (await list({ prefix: `candidates/${id}.json`, limit: 1 })).blobs.length > 0;
}

export async function removeCandidate(id) {
  const blobs = [...await listAll(`candidates/${id}.json`), ...await listAll(`events/${id}/`)];
  if (blobs.length) await del(blobs.map(b => b.url));
}

export async function recordEvent(id, type, data = {}) {
  if (!validId(id)) throw new Error('bad id');
  await writeJSON(`events/${id}/${stamp()}-${type}.json`, data);
}

// Everything the dashboard needs, merged in memory. Candidate files are small; 60 CVs ≈ 60 reads.
export async function loadAll() {
  const [cblobs, events] = await Promise.all([listAll('candidates/'), listAll('events/')]);
  const byId = {};
  for (const b of events.sort((a, b) => a.pathname.localeCompare(b.pathname))) {
    const [, id, file] = b.pathname.split('/');
    const m = file.match(/^(.+?)-(decision-(?:invite|rejection|none)|edit-(?:invite|rejection)|sent)\.json$/);
    if (!m) continue;
    const s = (byId[id] ||= { edits: {} });
    const type = m[2];
    if (type.startsWith('decision-')) { const d = type.slice(9); s.decision = d === 'none' ? null : d; s.decided_at = b.uploadedAt; }
    else if (type.startsWith('edit-')) s.edits[type.slice(5)] = b.pathname;
    else s.sentPath = b.pathname;
  }
  const reads = cblobs.map(b => readJSON(b.pathname));
  for (const s of Object.values(byId)) {
    for (const k of Object.keys(s.edits)) reads.push(readJSON(s.edits[k]).then(v => { s.edits[k] = v; }));
    if (s.sentPath) reads.push(readJSON(s.sentPath).then(v => { s.sent = v; }));
  }
  const results = await Promise.all(reads);
  const candidates = results.slice(0, cblobs.length).filter(Boolean);
  return { candidates, stateById: byId };
}

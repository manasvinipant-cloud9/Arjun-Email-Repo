// POST {filename, text, role_hint} -> extract + redact -> score -> store. One CV per request.
import { createHash } from 'node:crypto';
import { authorized, json, saveCandidate, candidateExists } from '../lib/store.js';
import { extract, scrub, score } from '../lib/llm.js';
import { computeScores } from '../lib/rubric.js';

export async function POST(request) {
  if (!authorized(request)) return json({ error: 'unauthorized' }, 401);
  const { filename = 'cv', text = '', role_hint = 'UNSPECIFIED', force = false } = await request.json();
  if (text.trim().length < 200) return json({ error: 'Could not read enough text from this file (scanned image?)' }, 422);
  if (text.length > 60000) return json({ error: 'CV text is too long (over 60,000 characters)' }, 413);
  const hint = ['PM', 'SPM'].includes(role_hint) ? role_hint : 'UNSPECIFIED';
  const id = 'K-' + createHash('sha1').update(text).digest('hex').slice(0, 8).toUpperCase();
  if (!force && await candidateExists(id)) return json({ id, status: 'duplicate' });

  try {
    const ex = await extract(text);
    const name = ex.name.trim();
    const contact = { name, first_name: name.split(/\s+/)[0] || 'there', email: ex.email.trim(), phone: ex.phone.trim() };
    const redacted = scrub(ex.redacted_text, contact);
    const scored = computeScores(await score(redacted, hint));
    if (!contact.email) scored.flags.push('No email address found in CV — cannot be emailed');
    await saveCandidate({ id, source_file: String(filename).slice(0, 200), role_hint: hint, contact,
                          redacted_text: redacted, screened_at: new Date().toISOString(), ...scored });
    return json({ id, status: 'screened', name, role: scored.role_applied, recommendation: scored.recommendation });
  } catch (e) {
    return json({ error: String(e.message || e).slice(0, 300) }, 502);
  }
}

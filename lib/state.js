// Builds the dashboard view: candidates + Arjun's decisions/edits/sends, ranked.
import { loadAll } from './store.js';
import { rank } from './rubric.js';
import { mailConfig } from './mail.js';

const fill = (text, first) => String(text || '').replaceAll('{{first_name}}', first || 'there');

export async function buildState() {
  const { candidates, stateById } = await loadAll();
  const out = candidates.map(c => {
    const s = stateById[c.id] || { edits: {} };
    const { contact, redacted_text, ...rest } = c;
    const drafts = {};
    for (const k of ['invite', 'rejection']) {
      drafts[k] = s.edits[k] || { subject: fill(c[`email_${k}`].subject, contact.first_name),
                                  body: fill(c[`email_${k}`].body, contact.first_name) };
    }
    return { ...rest, name: contact.name, email: contact.email, has_email: Boolean(contact.email), drafts,
             decision: s.decision || null, decided_at: s.decided_at || null, sent: s.sent || null };
  });
  const cfg = mailConfig();
  return { candidates: rank(out), mode: cfg.live ? 'live' : 'dry_run',
           config: { from: cfg.from, arjun_email: cfg.arjun_email, redirect_all_to: cfg.redirect_all_to } };
}

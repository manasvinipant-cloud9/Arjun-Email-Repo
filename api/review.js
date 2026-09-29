// POST: emails Arjun a digest of the ranked shortlist with a link back to the dashboard.
import { authorized, json } from '../lib/store.js';
import { buildState } from '../lib/state.js';
import { mailConfig, sendEmail } from '../lib/mail.js';

const ROLE = { PM: 'Product Manager', SPM: 'Senior Product Manager' };

export async function POST(request) {
  if (!authorized(request)) return json({ error: 'unauthorized' }, 401);
  const to = mailConfig().arjun_email;
  if (!to) return json({ error: 'Set the ARJUN_EMAIL environment variable first' }, 400);
  const s = (await buildState()).candidates;
  const lines = [`${s.length} applications screened against the PM/SPM rubric and Kargo's success pattern.`, ''];
  for (const role of ['SPM', 'PM']) {
    const g = s.filter(c => c.role_applied === role);
    lines.push(`${ROLE[role]}: ${g.length} applicants, ${g.filter(c => c.recommendation !== 'pass').length} recommended to advance`);
    for (const c of g.slice(0, 5)) {
      lines.push(`  #${c.rank} ${c.name}: success ${c.success_profile_score}/10, role fit ${c.role_fit_score}/10 (${c.recommendation.replace('_', ' + ')})`);
      lines.push(`      ${c.headline}`);
    }
    lines.push('');
  }
  const pending = s.filter(c => !c.decision && !c.sent).length;
  lines.push(`${pending} candidates are waiting on your decision. Nothing goes to candidates until you decide and press Send.`);
  lines.push('', `Open the dashboard: ${new URL(request.url).origin}`);
  return json(await sendEmail({ to, subject: `Kargo hiring: ${s.length} ranked, ${pending} awaiting your call`, body: lines.join('\n') }));
}

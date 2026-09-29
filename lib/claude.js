// The two Claude calls per CV.
//   1. extract(): pull contact details out and return the CV text with personal details removed.
//   2. score():   score ONLY the redacted text against the rubric + JDs (never sees the name/email).
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { WEIGHTS } from './rubric.js';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY
const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5';
// Server-side refusal fallback: a declined request is re-run on Anthropic's recommended fallback model.
const FALLBACK = { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } };

const ref = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const GUIDE = ref('pipeline/SCORING_GUIDE.md');
const RUBRIC = ref('reference/rubric.md');
const JD_PM = ref('reference/jd_pm.txt');
const JD_SPM = ref('reference/jd_spm.txt');

const str = { type: 'string' };
const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const criteria = keys => ({ type: 'array', items: obj({ key: { type: 'string', enum: keys }, score: { type: 'integer' }, evidence: str }) });
const email = obj({ subject: str, body: str });

const EXTRACT_SCHEMA = obj({ name: str, email: str, phone: str, redacted_text: str });
const SCORE_SCHEMA = obj({
  role_applied: { type: 'string', enum: ['PM', 'SPM'] },
  role_inferred: { type: 'boolean' },
  role_inference_note: str,
  is_pm_application: { type: 'boolean' },
  years_pm_experience: { type: 'number' },
  years_total_experience: { type: 'number' },
  location_signal: str,
  headline: str,
  profile_summary: str,
  role_fit: criteria([...new Set([...Object.keys(WEIGHTS.PM), ...Object.keys(WEIGHTS.SPM)])]),
  success_profile: criteria(Object.keys(WEIGHTS.SUCCESS)),
  strengths: { type: 'array', items: str },
  gaps: { type: 'array', items: str },
  flags: { type: 'array', items: str },
  interview_brief: obj({
    why_ranked_here: str,
    probe_questions: { type: 'array', items: obj({ question: str, why: str }) },
    risk_to_test: str,
  }),
  email_invite: email,
  email_rejection: email,
});

async function structured({ system, user, schema, effort, maxTokens }) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    fallbacks: 'default',
    output_config: { effort, format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: user }],
  }, FALLBACK);
  if (res.stop_reason === 'refusal') throw new Error('Claude declined to process this CV');
  if (res.stop_reason === 'max_tokens') throw new Error('Response was cut off (max_tokens)');
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return JSON.parse(text);
}

export async function extract(cvText) {
  const out = await structured({
    effort: 'low',
    maxTokens: 16000,
    schema: EXTRACT_SCHEMA,
    system: `You prepare CVs for blind screening. Return the candidate's name, email and phone exactly as written (empty string if absent).
Then return redacted_text: the full CV text, unchanged except that you replace
- the candidate's name (every occurrence, any casing) with [CANDIDATE]
- emails, phone numbers, street addresses, profile URLs and social handles with [CONTACT]
- names of schools, colleges, universities and institutes with [INSTITUTION]
- date of birth, age, gender, marital status, religion, caste, nationality, photo references with [PERSONAL]
- gendered pronouns and titles (he/she/his/her/Mr/Ms...) with neutral forms (they/their)
Keep the city/location of current work (needed for the in-office requirement), company names, job titles, dates and all achievements verbatim. Do not summarise or shorten.`,
    user: `<cv>\n${cvText}\n</cv>`,
  });
  return out;
}

// Deterministic safety net on top of Claude's redaction.
export function scrub(text, { name, email, phone }) {
  let t = text;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (email) t = t.replaceAll(email, '[CONTACT]');
  t = t.replace(/[A-Za-z0-9_.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z]{2,})+/g, '[CONTACT]');
  t = t.replace(/\+?\d[\d\s-]{8,}\d/g, m => (m.replace(/\D/g, '').length >= 10 ? '[CONTACT]' : m));
  if (phone) t = t.replaceAll(phone, '[CONTACT]');
  for (const tok of String(name || '').split(/\s+/).filter(w => w.length >= 3)) {
    t = t.replace(new RegExp(`(?<![A-Za-z])${esc(tok)}(?![a-z])`, 'gi'), '[CANDIDATE]');
  }
  return t;
}

export async function score(redactedText, roleHint) {
  return structured({
    effort: 'high',
    maxTokens: 16000,
    schema: SCORE_SCHEMA,
    system: [{
      type: 'text',
      text: `${GUIDE}\n\n<rubric>\n${RUBRIC}\n</rubric>\n\n<jd role="PM">\n${JD_PM}\n</jd>\n\n<jd role="SPM">\n${JD_SPM}\n</jd>\n\n` +
        `For role_fit, use exactly the six keys for the role you score against. Output only the JSON object; ` +
        `the "id" field from the guide's schema is added by code, omit it.`,
      cache_control: { type: 'ephemeral' },
    }],
    user: `role_hint: ${roleHint}\n\n<redacted_cv>\n${redactedText}\n</redacted_cv>`,
  });
}

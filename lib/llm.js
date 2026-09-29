// The two model calls per CV, via the Gemini API.
//   1. extract(): pull contact details out and return the CV text with personal details removed.
//   2. score():   score ONLY the redacted text against the rubric + JDs (never sees the name/email).
import { readFileSync } from 'node:fs';
import { WEIGHTS } from './rubric.js';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const ref = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const GUIDE = ref('pipeline/SCORING_GUIDE.md');
const RUBRIC = ref('reference/rubric.md');
const JD_PM = ref('reference/jd_pm.txt');
const JD_SPM = ref('reference/jd_spm.txt');

// Gemini responseSchema (OpenAPI subset)
const STR = { type: 'STRING' };
const obj = properties => ({ type: 'OBJECT', properties, required: Object.keys(properties), propertyOrdering: Object.keys(properties) });
const arr = items => ({ type: 'ARRAY', items });
const criteria = keys => arr(obj({ key: { type: 'STRING', enum: keys }, score: { type: 'INTEGER' }, evidence: STR }));
const email = obj({ subject: STR, body: STR });

const EXTRACT_SCHEMA = obj({ name: STR, email: STR, phone: STR, redacted_text: STR });
const SCORE_SCHEMA = obj({
  role_applied: { type: 'STRING', enum: ['PM', 'SPM'] },
  role_inferred: { type: 'BOOLEAN' },
  role_inference_note: STR,
  is_pm_application: { type: 'BOOLEAN' },
  years_pm_experience: { type: 'NUMBER' },
  years_total_experience: { type: 'NUMBER' },
  location_signal: STR,
  headline: STR,
  profile_summary: STR,
  role_fit: criteria([...new Set([...Object.keys(WEIGHTS.PM), ...Object.keys(WEIGHTS.SPM)])]),
  success_profile: criteria(Object.keys(WEIGHTS.SUCCESS)),
  strengths: arr(STR),
  gaps: arr(STR),
  flags: arr(STR),
  interview_brief: obj({ why_ranked_here: STR, probe_questions: arr(obj({ question: STR, why: STR })), risk_to_test: STR }),
  email_invite: email,
  email_rejection: email,
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function structured({ system, user, schema, maxTokens }) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set on the server');
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens: maxTokens, temperature: 0.2 },
  };
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${URL_BASE}/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify(body),
    });
    // Free-tier rate limits and transient overloads: back off and retry
    if ((r.status === 429 || r.status >= 500) && attempt < 4) { await sleep(4000 * 2 ** attempt); continue; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${j.error?.message || 'request failed'}`);
    const cand = j.candidates?.[0];
    if (!cand) throw new Error(`Gemini returned no answer (${j.promptFeedback?.blockReason || 'unknown reason'})`);
    if (cand.finishReason === 'MAX_TOKENS') throw new Error('Response was cut off (max tokens)');
    if (cand.finishReason && cand.finishReason !== 'STOP') throw new Error(`Gemini stopped: ${cand.finishReason}`);
    const text = (cand.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
    return JSON.parse(text);
  }
}

export async function extract(cvText) {
  return structured({
    maxTokens: 32768,
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
}

// Deterministic safety net on top of the model's redaction.
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
    maxTokens: 32768,
    schema: SCORE_SCHEMA,
    system: `${GUIDE}\n\n<rubric>\n${RUBRIC}\n</rubric>\n\n<jd role="PM">\n${JD_PM}\n</jd>\n\n<jd role="SPM">\n${JD_SPM}\n</jd>\n\n` +
      `For role_fit, use exactly the six keys for the role you score against. Return only the JSON object; ` +
      `the "id" field from the guide's schema is added by code, omit it.`,
    user: `role_hint: ${roleHint}\n\n<redacted_cv>\n${redactedText}\n</redacted_cv>`,
  });
}

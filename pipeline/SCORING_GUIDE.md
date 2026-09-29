# Scoring guide — Step 2 (Claude scores, code does the maths)

You are scoring one redacted CV for Kargo (Series A freight-tech SaaS, Mumbai, 40 → 70 people).
Read `reference/rubric.md`, `reference/jd_pm.txt`, `reference/jd_spm.txt` first.

Input: `work/redacted/<ID>.txt` (+ its `role_hint` from `work/manifest.json`).
Output: `work/scores/<ID>.json` — exactly the schema below, valid JSON, nothing else.

## Hard rules
1. **Only use the redacted text.** Never open `applications/` or `private/`. You do not know the candidate's name, gender, or school, and must not guess.
2. **Excluded from scoring (rubric exclusion clause):** institution/pedigree, gendered language, age, "culture fit". If a CV leans on them, ignore them. If you notice you were tempted to use one, add a flag `"Excluded signal present: <what> — not scored"`.
3. **Evidence or it didn't happen.** Every criterion score needs an `evidence` string that paraphrases or quotes a specific line from the CV. No evidence → score 2 and evidence `"No evidence in CV"`. Score 1 only for *counter*-evidence (e.g. "decisions sat with a senior PM").
4. **Do not compute weighted totals.** Give 1–5 per criterion; `pipeline/rank.py` does the weighting, rescaling, 2×2 quadrant and recommendation deterministically.
5. **Role:** `role_hint` PM or SPM → score against that JD. `UNSPECIFIED` → infer (title says Senior PM, or ≥5 yrs of PM experience → SPM; otherwise PM), set `role_inferred: true`, explain in `role_inference_note`.
6. `is_pm_application: false` if the CV has no product-management experience or intent at all (e.g. pure marketing/events/strategy). Still score it against PM.
7. Axis B calibration: a Vikram/Rahul-like profile (solid, competent, assigned work done well) is **3**, not low. 4–5 needs *self-initiated* action, *unescalated* ownership, or *voluntary* adoption by others — stated in the CV.

## Criterion keys (use exactly these)
PM role_fit: `shipped_and_killed`, `comfort_without_structure`, `ops_curiosity`, `company_stage_fit`, `location_fit`, `yoe_band`
SPM role_fit: `owned_area_solo`, `integration_complexity`, `ambiguous_calls`, `early_stage`, `ops_domain`, `yoe_band`
success_profile (both roles): `acted_before_asked`, `owned_crisis`, `adopted_without_mandate`, `named_cause`, `senior_most_comfort`

Location: Mumbai-based or explicit relocation = 4–5; elsewhere in India with no signal = 2; unclear = 3.
YoE: count *product management* years (APM counts; internships and adjacent roles don't).

## Schema
```json
{
  "id": "K-XXXXXX",
  "role_applied": "PM | SPM",
  "role_inferred": false,
  "role_inference_note": "",
  "is_pm_application": true,
  "years_pm_experience": 3.5,
  "years_total_experience": 6,
  "location_signal": "Mumbai | relocation | other-India | abroad | unknown",
  "headline": "≤10 words, e.g. 'Freight-tech PM, ex-3PL ops, sole PM at 35-person startup'",
  "profile_summary": "2–3 sentences. No name, no institution, no gendered words.",
  "role_fit": [{"key": "shipped_and_killed", "score": 4, "evidence": "..."}],
  "success_profile": [{"key": "acted_before_asked", "score": 3, "evidence": "..."}],
  "strengths": ["...", "..."],
  "gaps": ["...", "..."],
  "flags": ["..."],
  "interview_brief": {
    "why_ranked_here": "2–3 sentences naming the specific evidence that drove both axis scores.",
    "probe_questions": [
      {"question": "Walk me through the 3 features you killed at <company> — what data told you, and who disagreed?", "why": "Tests shipped_and_killed claim depth"}
    ],
    "risk_to_test": "The one thing that would make this hire fail at Kargo, and how to test it in 45 minutes."
  },
  "email_invite": {"subject": "...", "body": "..."},
  "email_rejection": {"subject": "...", "body": "..."}
}
```
3–4 probe questions, each tied to a gap, a flag, or a claim that needs depth.

## Emails (both are always drafted — Arjun may overrule the recommendation)
- Open with `Hi {{first_name}},` (the placeholder is filled from private contacts at build time). Sign off `Arjun Mehta\nFounder, Kargo`.
- Name the role correctly ("Product Manager" / "Senior Product Manager").
- **Invite** (≤150 words): reference 1–2 *specific* things from their CV that caught attention; propose a 45-minute conversation with Arjun this week or next (in person in Mumbai or video); ask them to reply with 2–3 slots; mention the role is in-office in Mumbai (relocation support if they're elsewhere).
- **Rejection** (≤130 words): warm, direct, decided — not "we'll keep you on file" filler. Thank them, say clearly we're not moving forward for this role, give one honest, kind, *role-level* reason (e.g. "we're prioritising people who've owned an integration layer end-to-end") — never scores, rubric language, or anything about education, age, gender, or location beyond the in-office requirement. Acknowledge one genuine strength from their CV. Apologise for the slow response (applications have been open since July).
- No em-dash overload, no "I hope this email finds you well", no exclamation marks in rejections.

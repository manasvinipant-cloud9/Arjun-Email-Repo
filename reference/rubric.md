# Kargo PM / SPM scoring rubric

Two independent axes, never combined into a single score. Axis A is role-specific (built from the two JDs). Axis B is role-agnostic (extracted from Kargo's 8 past hires, across all functions). Every candidate gets both scores plus a reconciling read — see the combination logic at the end.

---

## Axis A — Role Fit Rubric

### Product Manager (2–4 yrs) — scored 1–5 per criterion

| Criterion | Weight | 1–2 (Weak) | 3 (Adequate) | 4–5 (Strong) | JD anchor |
|---|---|---|---|---|---|
| Shipped and killed track record | 25% | Talks about roadmaps, no named features shipped or killed | 1–2 features shipped, outcome unclear | Multiple features shipped *and* killed, stated reason, short cycle | "Evidence that you've shipped things, killed things, and learned from both — preferably in short cycles" |
| Comfort without structure | 20% | Only worked inside an existing PM process/template | Adapted an existing process | Built a process, template, or framework from nothing, unprompted | "No PM handbook, no design system, no sprint template. You'll build those" |
| Ground-level ops curiosity | 20% | No evidence of contact with end users/operations | Occasional user interviews | Repeated, self-initiated time with operations/end users, specific findings named | "What does a freight forwarder's morning actually look like? What breaks?" |
| Company-stage fit | 15% | Only large/mature company experience | Mixed | First-time-building, early-stage company | "Ideally at a company building for the first time rather than maintaining what already exists" |
| Location fit | 10% | Not Mumbai-based, no relocation signal | Ambiguous | Mumbai-based or explicit relocation willingness | "Mumbai-based or willing to relocate. This role is in-office" |
| Years-of-experience band | 10% | <1.5 or >5 yrs | 1.5–2 or 4–5 yrs | Squarely 2–4 yrs | "2–4 years of product management experience" |

### Senior Product Manager (5–8 yrs) — scored 1–5 per criterion

| Criterion | Weight | 1–2 (Weak) | 3 (Adequate) | 4–5 (Strong) | JD anchor |
|---|---|---|---|---|---|
| Owned a product area solo | 25% | Always had a senior PM/lead above them | Partial ownership, shared calls | Full ownership, no PM layer above, named decisions | "Owning a product area without a layer of senior PMs above you making the calls" |
| Integration / platform complexity | 25% | Consumer-facing or simple CRUD features only | Some API/integration exposure | Owned integration layer — ERP, carrier systems, data quality at stake | "Platform products, integration layers, or products that have to work inside complex existing technical environments" |
| Ambiguous, consequential calls | 20% | Decisions reviewed/approved by committee | Made calls, some pushback/reversal | Made and defended calls with lasting consequences, no committee | "There is no committee that approves product decisions" |
| Early-stage / no-rulebook experience | 15% | Only large-company tenure | Mixed | Early-stage tenure, built practices from scratch | "Operated in environments where the rules were not written yet" |
| Ops-heavy domain familiarity | 10% | None | Adjacent industry | Direct logistics/supply chain/freight exposure | "Familiarity with... logistics, supply chain, or adjacent domains — a genuine advantage" |
| Years-of-experience band | 5% | <4 or >9 yrs | 4–5 or 8–9 | Squarely 5–8 yrs | "5–8 years of product management experience" |

`role_fit_score` = weighted sum, rescaled to 1–10.

---

## Axis B — Kargo Success Profile Rubric

Extracted from the 8 past hires (per the Phase 1 pipeline), applies identically regardless of which role the candidate applied for. Grounded directly in evidence — five hires rated **Exceeds** (Rohan Desai, Sunita Krishnamurthy, Aditya Shetty, Meghna Tiwari, Lavanya Iyer), two rated **Meets** (Vikram Nair, Rahul Bose), one rated **Below** (Preetham Rao — profile not available to this analysis, treated as an open gap rather than assumed).

| Trait | Weight | High-signal evidence pattern | Low-signal / absent |
|---|---|---|---|
| Acted before being asked | 25% | Rohan built a Bill-of-Lading verification module unprompted over a weekend; Lavanya redirected sprint capacity after her own usage-data read, without waiting for direction | Only executed assigned tasks; no self-initiated build or fix anywhere in the history |
| Owned a crisis without escalating upward | 25% | Meghna resolved a customs hold at 7pm through the night before the client even knew; Sunita independently redesigned a team's intake workflow over a weekend after a vendor changed formats without notice | Escalated immediately on the first sign of trouble, or evidence of freezing under pressure |
| Work got adopted by others without being mandated | 20% | Rohan's module was in voluntary use by 30 colleagues within a month; Sunita's onboarding framework became the standard used by the wider team | Work stayed siloed to them; no downstream adoption mentioned |
| Named cause, not just outcome, when something failed | 15% | Aditya ran a formal post-mortem on a lost deal, documented the root cause, and it became standard practice before account qualification; Lavanya wrote both internal and customer-facing versions of an outage post-mortem | Reports outcomes ("it didn't work out") with no diagnosis of why |
| Comfortable being the senior-most person in the room | 15% | Rohan is "comfortable as the most senior engineer in the room"; Lavanya is the sole PM across three product areas with no PM layer above her | Needed a sign-off structure or a peer layer to function; discomfort with sole ownership |

`success_profile_score` = weighted sum, rescaled to 1–10.

**Exclusion clause (mandatory, non-negotiable):** Institution pedigree (XLRI, NIT, IIT-adjacent), gendered language patterns, and generic "culture fit" framing are excluded from scoring even where they correlate with Exceeds in this 8-person sample. They are proxy risk, not causal signal, given the sample size. If the Phase 1 extraction step surfaces one of these as a candidate trait, it must be flagged and dropped, not silently scored.

**Calibration note:** Vikram (Meets) and Rahul (Meets) both show real strengths — Vikram shipped features and ran quarterly stakeholder reviews; Rahul built a team from scratch and hit pipeline targets. Their Meets rating (versus Exceeds) is the useful contrast: it shows these traits are about degree and initiative, not baseline competence. A candidate resembling Vikram/Rahul more than Rohan/Lavanya should score mid-range on this axis, not low — "Meets" is not a red flag.

---

## Combination logic — the 2×2 read

Per the Nine Checks (Check 8: judgement protected), the two scores are **never averaged**. The dashboard shows both, plus a `combined_read` that names any tension rather than smoothing it over.

| | High Role Fit | Low Role Fit |
|---|---|---|
| **High Success Profile** | Advance — strong on both axes | Advance with a flag — probe role-specific gaps directly in the interview |
| **Low Success Profile** | Advance with a flag — probe whether they'd function in a no-structure, no-committee environment | Pass, but state the reason on both axes explicitly in the record |

`recommendation` (`advance` / `pass`) is generated from this grid as a suggestion only. Arjun's click is still the action that moves a candidate forward — the rubric informs the call, it doesn't make it.

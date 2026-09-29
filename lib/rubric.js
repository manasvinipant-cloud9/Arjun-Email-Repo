// Deterministic scoring (same logic as pipeline/rank.py). Claude supplies 1-5 per
// criterion with evidence; this file does the weighting, the 2x2 and the ranking.
// The two axes are never averaged (rubric Check 8).

export const WEIGHTS = {
  PM: { shipped_and_killed: .25, comfort_without_structure: .20, ops_curiosity: .20,
        company_stage_fit: .15, location_fit: .10, yoe_band: .10 },
  SPM: { owned_area_solo: .25, integration_complexity: .25, ambiguous_calls: .20,
         early_stage: .15, ops_domain: .10, yoe_band: .05 },
  SUCCESS: { acted_before_asked: .25, owned_crisis: .25, adopted_without_mandate: .20,
             named_cause: .15, senior_most_comfort: .15 },
};

export const LABELS = {
  shipped_and_killed: 'Shipped & killed', comfort_without_structure: 'Comfort without structure',
  ops_curiosity: 'Ground-level ops curiosity', company_stage_fit: 'Company-stage fit',
  location_fit: 'Location fit', yoe_band: 'Years-of-experience band',
  owned_area_solo: 'Owned a product area solo', integration_complexity: 'Integration / platform complexity',
  ambiguous_calls: 'Ambiguous, consequential calls', early_stage: 'Early-stage / no-rulebook',
  ops_domain: 'Ops-heavy domain familiarity',
  acted_before_asked: 'Acted before being asked', owned_crisis: 'Owned a crisis without escalating',
  adopted_without_mandate: 'Work adopted without mandate', named_cause: 'Named cause when things failed',
  senior_most_comfort: 'Comfortable as senior-most',
};

const HIGH = 6.0;
const GRID = {
  'true,true': ['advance', 'Strong on both axes'],
  'false,true': ['advance_flag', 'Probe role-specific gaps directly in the interview'],
  'true,false': ['advance_flag', "Probe whether they'd function with no structure and no committee"],
  'false,false': ['pass', 'Below bar on both role fit and the Kargo success pattern'],
};
const TIER = { advance: 0, advance_flag: 1, pass: 2 };

function weighted(items, weights) {
  const byKey = Object.fromEntries(items.map(i => [i.key, i]));
  const missing = Object.keys(weights).filter(k => !byKey[k]);
  if (missing.length) throw new Error(`missing criteria: ${missing.join(', ')}`);
  let total = 0;
  const rows = Object.entries(weights).map(([key, w]) => {
    const s = Math.max(1, Math.min(5, Math.round(Number(byKey[key].score))));
    total += s * w;
    return { key, label: LABELS[key], weight: w, score: s, evidence: byKey[key].evidence || '' };
  });
  return [Math.round((1 + (total - 1) * 9 / 4) * 10) / 10, rows];
}

// Turn Claude's raw score object into the dashboard record.
export function computeScores(s) {
  const role = String(s.role_applied).toUpperCase();
  if (!WEIGHTS[role] || role === 'SUCCESS') throw new Error(`bad role ${role}`);
  const [rf, rfRows] = weighted(s.role_fit, WEIGHTS[role]);
  const [sp, spRows] = weighted(s.success_profile, WEIGHTS.SUCCESS);
  let [rec, reason] = GRID[`${rf >= HIGH},${sp >= HIGH}`];
  const flags = [...(s.flags || [])];
  if (!s.is_pm_application) {
    flags.unshift('Not a product-management application');
    if (rec !== 'pass') { rec = 'pass'; reason = `No product-management experience — overrides the grid (${reason.toLowerCase()})`; }
  }
  if (s.role_inferred) flags.push(`Role inferred as ${role}: ${s.role_inference_note || ''}`.trim());
  return { ...s, role_applied: role, role_fit_score: rf, success_profile_score: sp,
           role_fit: rfRows, success_profile: spRows, recommendation: rec, combined_read: reason, flags };
}

export function rank(candidates) {
  for (const role of ['PM', 'SPM']) {
    candidates.filter(c => c.role_applied === role)
      .sort((a, b) => TIER[a.recommendation] - TIER[b.recommendation]
        || b.success_profile_score - a.success_profile_score || b.role_fit_score - a.role_fit_score)
      .forEach((c, i) => { c.rank = i + 1; });
  }
  return candidates.sort((a, b) => (a.role_applied === 'SPM' ? 0 : 1) - (b.role_applied === 'SPM' ? 0 : 1) || a.rank - b.rank);
}

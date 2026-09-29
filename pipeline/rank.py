"""Step 3 — Validate, weight, place on the 2x2, rank.

Claude gives 1-5 per criterion with evidence; this script does all arithmetic so
scores are reproducible and auditable. The two axes are never averaged
(rubric Check 8) — ranking is by 2x2 tier, then Success Profile, then Role Fit.

Usage:  python pipeline/rank.py      -> work/ranked.json (no personal data)
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCORES = ROOT / "work" / "scores"

WEIGHTS = {
    "PM": {"shipped_and_killed": .25, "comfort_without_structure": .20, "ops_curiosity": .20,
           "company_stage_fit": .15, "location_fit": .10, "yoe_band": .10},
    "SPM": {"owned_area_solo": .25, "integration_complexity": .25, "ambiguous_calls": .20,
            "early_stage": .15, "ops_domain": .10, "yoe_band": .05},
    "SUCCESS": {"acted_before_asked": .25, "owned_crisis": .25, "adopted_without_mandate": .20,
                "named_cause": .15, "senior_most_comfort": .15},
}
LABELS = {
    "shipped_and_killed": "Shipped & killed", "comfort_without_structure": "Comfort without structure",
    "ops_curiosity": "Ground-level ops curiosity", "company_stage_fit": "Company-stage fit",
    "location_fit": "Location fit", "yoe_band": "Years-of-experience band",
    "owned_area_solo": "Owned a product area solo", "integration_complexity": "Integration / platform complexity",
    "ambiguous_calls": "Ambiguous, consequential calls", "early_stage": "Early-stage / no-rulebook",
    "ops_domain": "Ops-heavy domain familiarity",
    "acted_before_asked": "Acted before being asked", "owned_crisis": "Owned a crisis without escalating",
    "adopted_without_mandate": "Work adopted without mandate", "named_cause": "Named cause when things failed",
    "senior_most_comfort": "Comfortable as senior-most",
}
HIGH = 6.0  # on the 1-10 scale; a weighted avg of ~3.2/5

GRID = {
    (True, True): ("advance", "Strong on both axes"),
    (False, True): ("advance_flag", "Probe role-specific gaps directly in the interview"),
    (True, False): ("advance_flag", "Probe whether they'd function with no structure and no committee"),
    (False, False): ("pass", "Below bar on both role fit and the Kargo success pattern"),
}
TIER = {"advance": 0, "advance_flag": 1, "pass": 2}


def weighted(items: list, weights: dict, cid: str, axis: str) -> tuple[float, list]:
    by_key = {i["key"]: i for i in items}
    missing = set(weights) - set(by_key)
    if missing:
        raise ValueError(f"{cid}: {axis} missing criteria {sorted(missing)}")
    rows, total = [], 0.0
    for key, w in weights.items():
        s = max(1, min(5, int(round(float(by_key[key]["score"])))))
        total += s * w
        rows.append({"key": key, "label": LABELS[key], "weight": w, "score": s,
                     "evidence": by_key[key].get("evidence", "")})
    return round(1 + (total - 1) * 9 / 4, 1), rows


def main() -> None:
    manifest = json.loads((ROOT / "work" / "manifest.json").read_text())
    out, problems = [], []
    for m in manifest:
        p = SCORES / f"{m['id']}.json"
        if not p.exists():
            problems.append(f"{m['id']}: not scored yet")
            continue
        try:
            s = json.loads(p.read_text())
            role = s["role_applied"].upper()
            if role not in ("PM", "SPM"):
                raise ValueError(f"bad role {role}")
            rf, rf_rows = weighted(s["role_fit"], WEIGHTS[role], m["id"], "role_fit")
            sp, sp_rows = weighted(s["success_profile"], WEIGHTS["SUCCESS"], m["id"], "success_profile")
        except Exception as e:  # noqa: BLE001 — surface every bad file, don't stop the batch
            problems.append(f"{m['id']}: {e}")
            continue
        rec, reason = GRID[(rf >= HIGH, sp >= HIGH)]
        flags = list(s.get("flags", []))
        if not s.get("is_pm_application", True):
            flags.insert(0, "Not a product-management application")
            if rec != "pass":  # guardrail: the grid alone can't advance someone with no PM experience
                rec, reason = "pass", f"No product-management experience — overrides the grid ({reason.lower()})"
        if s.get("role_inferred"):
            flags.append(f"Role inferred as {role}: {s.get('role_inference_note', '')}".strip())
        if not m["has_email"]:
            flags.append("No email address found in CV — cannot be emailed")
        out.append({**s, "role_applied": role, "role_fit_score": rf, "success_profile_score": sp,
                    "role_fit": rf_rows, "success_profile": sp_rows, "recommendation": rec,
                    "combined_read": reason, "flags": flags, "has_email": m["has_email"]})
    for role in ("PM", "SPM"):
        group = sorted((c for c in out if c["role_applied"] == role),
                       key=lambda c: (TIER[c["recommendation"]], -c["success_profile_score"], -c["role_fit_score"]))
        for i, c in enumerate(group, 1):
            c["rank"] = i
    out.sort(key=lambda c: (c["role_applied"] != "SPM", c["rank"]))
    (ROOT / "work" / "ranked.json").write_text(json.dumps(out, indent=2))
    for role in ("SPM", "PM"):
        g = [c for c in out if c["role_applied"] == role]
        counts = {k: sum(c["recommendation"] == k for c in g) for k in TIER}
        print(f"{role}: {len(g)} candidates  advance={counts['advance']}  flag={counts['advance_flag']}  pass={counts['pass']}")
    if problems:
        print("Problems:\n  " + "\n  ".join(problems))
        sys.exit(1 if not out else 0)


if __name__ == "__main__":
    main()

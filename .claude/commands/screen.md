---
description: Screen new CVs in applications/ — extract, redact, score, rank, open the hiring dashboard
---
Run the Kargo hiring pipeline end to end. Follow CLAUDE.md.

1. `.venv/bin/python pipeline/extract.py` — extract + redact every CV in applications/.
2. Find candidates in work/manifest.json that have no work/scores/<id>.json yet. Score only those.
   Read pipeline/SCORING_GUIDE.md. For more than 10 new candidates, split them into batches of ~10 and
   spawn one scoring subagent per batch in parallel, each given the guide path and its list of IDs.
   Scorers read only work/redacted/ and reference/ — never applications/ or private/.
3. `.venv/bin/python pipeline/rank.py` — fix any file it reports as invalid, then rerun.
4. Start the dashboard with `.venv/bin/python pipeline/server.py` (in the background) and open http://localhost:8787.
5. Report: how many screened per role, how many recommended to advance, any flags (no email, role inferred,
   not a PM application). Do NOT press send or call /api/send — sending is Arjun's decision in the dashboard.

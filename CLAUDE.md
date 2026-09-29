# Kargo PM/SPM hiring pipeline

Trigger: Arjun drops CVs (PDF/DOCX/TXT) into `applications/` and runs `/screen`.

```
applications/ ──extract.py──► private/contacts.json   (name, email, phone — never shown to scorers)
                         └──► work/redacted/<id>.txt  (personal details + institutions stripped)
work/redacted + reference/rubric.md + JDs ──Claude (SCORING_GUIDE.md)──► work/scores/<id>.json
work/scores ──rank.py (weights, 2×2, rank — pure code)──► work/ranked.json
ranked + contacts ──server.py──► dashboard on localhost:8787 ──Arjun decides──► Resend
```

Rules that must not be broken:
- Scorers only ever see `work/redacted/`. Names/emails are merged back only inside `server.py`.
- Pedigree, gendered language, age and "culture fit" are never scored (rubric exclusion clause).
- The two axes are never averaged. Ranking = 2×2 tier → Success Profile → Role Fit.
- Claude never sends email to candidates. Emails go out only when Arjun sets a decision in the
  dashboard and presses Send. Every send is logged in `work/outbox.json` and is never repeated.
- `config.json` → `redirect_all_to` sends every email to one test address (use this for demos).

## Web version (Vercel)
`public/index.html` + `api/*.js` + `lib/*.js`. Arjun logs in with `DASHBOARD_PASSWORD`, uploads CVs in
**Upload CVs** (text is extracted in the browser), and `api/screen.js` runs two Gemini calls per CV:
`extract()` pulls contacts and returns redacted text, then `score()` sees only that redacted text.
`lib/rubric.js` mirrors `rank.py`. State lives in a private Vercel Blob store (append-only events).
Env vars: `DASHBOARD_PASSWORD`, `GEMINI_API_KEY` (optional `GEMINI_MODEL`, default gemini-2.5-flash), `BLOB_READ_WRITE_TOKEN` (from the linked store),
`RESEND_API_KEY`, `ARJUN_EMAIL`, `REDIRECT_ALL_TO` (demo), optional `EMAIL_FROM`, `EMAIL_REPLY_TO`.
The public repo holds code only — never commit `applications/`, `private/`, `work/` or `.env`.

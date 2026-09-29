"""Step 4 — Hiring dashboard + human-in-the-loop send.

Serves dashboard/index.html on http://localhost:8787 and a small JSON API.
This is the only place personal data (names, emails) is merged back with the
scores — in memory, on Arjun's machine.

Nothing is ever emailed to a candidate unless Arjun has
  1) set a decision (Invite / Decline) for that candidate, and
  2) pressed "Send approved emails" and confirmed.
Every send is logged in work/outbox.json and never repeated.

RESEND_API_KEY (env var or .env) switches from dry-run to live sending.

Usage:  python pipeline/server.py
"""
import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "work"
DECISIONS = WORK / "decisions.json"
OUTBOX = WORK / "outbox.json"
ROLE_NAMES = {"PM": "Product Manager", "SPM": "Senior Product Manager"}


def load(path: Path, default):
    return json.loads(path.read_text()) if path.exists() else default


def save(path: Path, data) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2))
    tmp.replace(path)


def env_key() -> str:
    if os.environ.get("RESEND_API_KEY"):
        return os.environ["RESEND_API_KEY"].strip()
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("RESEND_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"\'')
    return ""


def config() -> dict:
    cfg = {"from": "Kargo Hiring <onboarding@resend.dev>", "reply_to": "", "arjun_email": "",
           "redirect_all_to": "", "port": 8787}
    cfg.update(load(ROOT / "config.json", {}))
    return cfg


def fill(text: str, contact: dict) -> str:
    return text.replace("{{first_name}}", contact.get("first_name") or "there")


def state() -> dict:
    ranked = load(WORK / "ranked.json", [])
    contacts = load(ROOT / "private" / "contacts.json", {})
    decisions = load(DECISIONS, {})
    outbox = load(OUTBOX, {})
    cands = []
    for c in ranked:
        ct = contacts.get(c["id"], {})
        d = decisions.get(c["id"], {})
        drafts = {k: {"subject": fill(c[f"email_{k}"]["subject"], ct), "body": fill(c[f"email_{k}"]["body"], ct)}
                  for k in ("invite", "rejection")}
        for k in drafts:  # Arjun's edits win
            if d.get("edits", {}).get(k):
                drafts[k] = d["edits"][k]
        cands.append({**c, "name": ct.get("name", c["id"]), "email": ct.get("email", ""),
                      "source_file": ct.get("source_file", ""), "drafts": drafts,
                      "decision": d.get("decision"), "decided_at": d.get("decided_at"),
                      "sent": outbox.get(c["id"])})
    cfg = config()
    return {"candidates": cands, "mode": "live" if env_key() else "dry_run",
            "config": {k: cfg[k] for k in ("from", "arjun_email", "redirect_all_to")}}


def send_email(to: str, subject: str, body: str) -> dict:
    cfg = config()
    real_to = cfg["redirect_all_to"] or to
    if cfg["redirect_all_to"]:
        body = f"[TEST MODE — originally to {to}]\n\n{body}"
    key = env_key()
    if not key:
        return {"status": "dry_run", "to": real_to}
    payload = {"from": cfg["from"], "to": [real_to], "subject": subject, "text": body}
    if cfg["reply_to"]:
        payload["reply_to"] = cfg["reply_to"]
    req = urllib.request.Request("https://api.resend.com/emails", data=json.dumps(payload).encode(),
                                 method="POST", headers={"Authorization": f"Bearer {key}",
                                                         "Content-Type": "application/json",
                                                         "User-Agent": "kargo-hiring/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return {"status": "sent", "to": real_to, "resend_id": json.loads(r.read()).get("id")}
    except urllib.error.HTTPError as e:
        return {"status": "error", "to": real_to, "error": f"{e.code}: {e.read().decode()[:300]}"}
    except urllib.error.URLError as e:
        return {"status": "error", "to": real_to, "error": str(e.reason)}


def review_digest() -> tuple[str, str]:
    s = state()["candidates"]
    lines = [f"{len(s)} applications screened against the PM/SPM rubric and Kargo's success pattern.", ""]
    for role in ("SPM", "PM"):
        g = [c for c in s if c["role_applied"] == role]
        adv = [c for c in g if c["recommendation"] != "pass"]
        lines.append(f"{ROLE_NAMES[role]} — {len(g)} applicants, {len(adv)} recommended to advance")
        for c in g[:5]:
            lines.append(f"  #{c['rank']} {c['name']} — success {c['success_profile_score']}/10, "
                         f"role fit {c['role_fit_score']}/10 — {c['recommendation'].replace('_', ' + ')}")
            lines.append(f"      {c['headline']}")
        lines.append("")
    pending = sum(1 for c in s if not c["decision"])
    lines += [f"{pending} candidates are waiting on your decision. Every candidate has an invite and a decline "
              f"draft ready; nothing goes out until you decide and press Send.",
              "", f"Open the dashboard: http://localhost:{config()['port']}"]
    return f"Kargo hiring: {len(s)} candidates ranked, {pending} awaiting your call", "\n".join(lines)


class Handler(BaseHTTPRequestHandler):
    def _json(self, code: int, data) -> None:
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def log_message(self, fmt, *args):  # keep the terminal quiet except for sends
        pass

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            body = (ROOT / "dashboard" / "index.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/api/state":
            self._json(200, state())
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        # Only accept requests from the dashboard itself (blocks drive-by cross-site POSTs)
        origin = self.headers.get("Origin", "")
        if origin and not origin.startswith(("http://localhost", "http://127.0.0.1")):
            return self._json(403, {"error": "forbidden origin"})
        data = self._body()
        decisions = load(DECISIONS, {})
        outbox = load(OUTBOX, {})

        if self.path == "/api/decide":
            cid, dec = data["id"], data.get("decision")
            if cid in outbox:
                return self._json(409, {"error": "Email already sent — decision is locked"})
            if dec not in ("invite", "rejection", None):
                return self._json(400, {"error": "bad decision"})
            decisions.setdefault(cid, {}).update(decision=dec, decided_at=datetime.now().isoformat(timespec="seconds"))
            save(DECISIONS, decisions)
            return self._json(200, {"ok": True})

        if self.path == "/api/edit":
            cid, kind = data["id"], data["kind"]
            if cid in outbox:
                return self._json(409, {"error": "Email already sent"})
            decisions.setdefault(cid, {}).setdefault("edits", {})[kind] = {"subject": data["subject"], "body": data["body"]}
            save(DECISIONS, decisions)
            return self._json(200, {"ok": True})

        if self.path == "/api/review":
            to = config()["arjun_email"]
            if not to:
                return self._json(400, {"error": "Set arjun_email in config.json first"})
            subject, body = review_digest()
            res = send_email(to, subject, body)
            print(f"[review digest] {res}")
            return self._json(200, res)

        if self.path == "/api/send":
            if data.get("confirm") is not True:
                return self._json(400, {"error": "confirm required"})
            s = {c["id"]: c for c in state()["candidates"]}
            queue = [c for c in s.values() if c["decision"] and not c["sent"] and c["email"]]
            results = []
            for c in queue:
                d = c["drafts"][c["decision"]]
                res = send_email(c["email"], d["subject"], d["body"])
                res.update(kind=c["decision"], at=datetime.now().isoformat(timespec="seconds"), subject=d["subject"])
                if res["status"] in ("sent", "dry_run"):
                    outbox[c["id"]] = res
                    save(OUTBOX, outbox)
                results.append({"id": c["id"], "name": c["name"], **res})
                print(f"[send] {c['name']:<24} {c['decision']:<9} -> {res['status']} {res.get('error', '')}")
                time.sleep(0.6)  # Resend free tier rate limit
            return self._json(200, {"results": results})

        if self.path == "/api/reset-dry-run":
            save(OUTBOX, {k: v for k, v in outbox.items() if v.get("status") != "dry_run"})
            return self._json(200, {"ok": True})

        self._json(404, {"error": "not found"})


def main() -> None:
    port = config()["port"]
    mode = "LIVE (Resend key found)" if env_key() else "DRY RUN (no RESEND_API_KEY — nothing is really sent)"
    print(f"Kargo hiring dashboard -> http://localhost:{port}   [{mode}]")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main()

"""Step 1 — Extract + prepare.

Reads every CV in applications/ (PDF, DOCX, TXT), and splits it into two things
that never meet again until the dashboard is built:

  private/contacts.json      name, email, phone, links   (never shown to the scorer)
  work/redacted/<id>.txt     CV text with personal details stripped (the only thing the scorer reads)

Redaction removes: name, email, phone, URLs/handles, gendered titles/pronouns,
DOB/age/marital/gender/religion/nationality lines, and institution names
(rubric exclusion clause: pedigree is proxy risk, not signal).

Usage:  python pipeline/extract.py
"""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APPS = ROOT / "applications"
PRIVATE = ROOT / "private"
RED = ROOT / "work" / "redacted"

EMAIL_RE = re.compile(r"[A-Za-z0-9_.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z]{2,})+")
PHONE_RE = re.compile(r"(?:\+?91[\s-]?)?(?:\d[\s-]?){10}(?!\d)")
URL_RE = re.compile(r"(?:https?://)?(?:www\.)?(?:linkedin\.com|github\.com|leetcode\.com|behance\.net|medium\.com)/\S*", re.I)
HANDLE_RE = re.compile(r"\b[a-z]+-[a-z]+-(?:product|pm|dev|mktg|growth)\b", re.I)
PERSONAL_LINE_RE = re.compile(
    r"^.*\b(date of birth|d\.o\.b|dob|age\s*[:\-]|marital status|gender\s*[:\-]|sex\s*[:\-]|religion|nationality|"
    r"father'?s name|mother'?s name|passport no)\b.*$", re.I | re.M)
GENDER_WORDS = [
    (r"\b(Mr|Mrs|Ms|Miss|Shri|Smt)\.?\s", ""),
    (r"\b(he|she)\b", "they"), (r"\b(He|She)\b", "They"),
    (r"\b(his|her|hers)\b", "their"), (r"\b(His|Her)\b", "Their"),
    (r"\b(him)\b", "them"), (r"\b(himself|herself)\b", "themself"),
]
INSTITUTION_RE = re.compile(
    r"\b(IIT|IIM|NIT|IIIT|BITS|XLRI|ISB|SPJIMR|MDI|FMS|NMIMS|IMT|VJTI|SRCC|LSR)\b[\w\s,.()-]{0,40}?(?=[|·,\n]|\d{4}|$)"
    r"|\b(?:[A-Z][\w.&'-]*\s){0,5}(?:University|College|Institute|School of [A-Z][\w]+|Vidyalaya|Academy)\b(?:\s(?:of|for)\s(?:[A-Z][\w.&'-]*\s?){1,4})?",
    re.M)


def read_text(path: Path) -> tuple[str, list[str]]:
    """Return (text, link_uris). Link URIs catch emails hidden in mailto: annotations."""
    suffix = path.suffix.lower()
    uris: list[str] = []
    if suffix == ".pdf":
        import pypdf
        reader = pypdf.PdfReader(str(path))
        for page in reader.pages:
            for a in page.get("/Annots") or []:
                act = a.get_object().get("/A")
                if act and act.get("/URI"):
                    uris.append(str(act["/URI"]))
        return "\n".join((p.extract_text() or "") for p in reader.pages), uris
    if suffix == ".docx":
        import docx
        d = docx.Document(str(path))
        parts = [p.text for p in d.paragraphs]
        for t in d.tables:
            for row in t.rows:
                parts.append(" | ".join(c.text for c in row.cells))
        return "\n".join(parts), uris
    return path.read_text(errors="ignore"), uris


def name_from_filename(path: Path) -> str:
    stem = re.sub(r"^(?:s?pm_)?\d+_", "", path.stem)
    parts = [p for p in re.split(r"[_\-\s]+", stem) if p.isalpha()]
    return " ".join(p.capitalize() for p in parts)


def role_hint(path: Path) -> str:
    s = path.stem.lower()
    if s.startswith("spm_"):
        return "SPM"
    if s.startswith("pm_"):
        return "PM"
    return "UNSPECIFIED"   # scorer infers from the CV and flags it


def find_email(text: str, uris: list[str]) -> str:
    cands = [u[7:] for u in uris if u.lower().startswith("mailto:")] + EMAIL_RE.findall(text)
    for c in cands:
        # PDF text often glues the uppercase name onto the address ("HARSH REDDYsquad_5@...")
        c = re.sub(r"^[A-Z]{2,}(?=[a-z0-9_])", "", c.strip())
        if "@" in c:
            return c
    return ""


def find_phone(text: str) -> str:
    m = PHONE_RE.search(text)
    return re.sub(r"\s+", " ", m.group(0)).strip() if m else ""


def redact(text: str, name: str) -> str:
    t = text
    t = URL_RE.sub("[LINK]", t)
    t = EMAIL_RE.sub("[EMAIL]", t)
    t = PHONE_RE.sub("[PHONE]", t)
    # PDF text often duplicates/glues phone numbers ("+91 98202 1134598202 11345"); sweep leftover fragments
    t = re.sub(r"\+\d{1,3}[\s-]?(?:\d[\s-]?){4,}", "[PHONE]", t)
    t = re.sub(r"(?<=\[PHONE\])[\s\d-]+|[\s\d-]+(?=\[PHONE\])", " ", t)
    t = HANDLE_RE.sub("[LINK]", t)
    t = PERSONAL_LINE_RE.sub("[PERSONAL DETAIL REMOVED]", t)
    tokens = [p for p in name.split() if len(p) >= 2]
    if tokens:
        t = re.sub(r"\s*".join(map(re.escape, tokens)), "[CANDIDATE]", t, flags=re.I)
    for tok in tokens:
        t = re.sub(rf"(?<![A-Za-z]){re.escape(tok)}(?![a-z])", "[CANDIDATE]", t, flags=re.I)
        if len(tok) >= 4:  # glued uppercase ("MEHTARohan")
            t = t.replace(tok.upper(), "[CANDIDATE]")
    for pat, rep in GENDER_WORDS:
        t = re.sub(pat, rep, t)
    t = INSTITUTION_RE.sub("[INSTITUTION]", t)
    t = re.sub(r"(\[CANDIDATE\]\s*){2,}", "[CANDIDATE] ", t)
    t = re.sub(r"[ \t]+\n", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def candidate_id(path: Path) -> str:
    return "K-" + hashlib.sha1(path.name.encode()).hexdigest()[:6].upper()


def main() -> None:
    PRIVATE.mkdir(exist_ok=True)
    RED.mkdir(parents=True, exist_ok=True)
    contacts_path = PRIVATE / "contacts.json"
    contacts = json.loads(contacts_path.read_text()) if contacts_path.exists() else {}
    files = sorted(p for p in APPS.iterdir() if p.suffix.lower() in {".pdf", ".docx", ".txt"})
    if not files:
        sys.exit("No CVs found in applications/")
    manifest = []
    for f in files:
        cid = candidate_id(f)
        text, uris = read_text(f)
        name = name_from_filename(f) or text.strip().splitlines()[0][:60]
        contacts[cid] = {
            "name": name,
            "first_name": name.split()[0] if name else "there",
            "email": find_email(text, uris),
            "phone": find_phone(text),
            "source_file": f.name,
        }
        red = redact(text, name)
        (RED / f"{cid}.txt").write_text(red)
        manifest.append({"id": cid, "role_hint": role_hint(f), "chars": len(red),
                         "has_email": bool(contacts[cid]["email"])})
    contacts_path.write_text(json.dumps(contacts, indent=2))
    (ROOT / "work" / "manifest.json").write_text(json.dumps(manifest, indent=2))
    missing = [m["id"] for m in manifest if not m["has_email"]]
    print(f"Prepared {len(manifest)} candidates -> work/redacted/  (contacts kept in private/)")
    if missing:
        print(f"No email found for: {', '.join(missing)} — these can be scored but not emailed")


if __name__ == "__main__":
    main()

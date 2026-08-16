"""Parse a Topps product checklist PDF into {section: {code: player+team}} JSON.

    python scripts/parse-checklist.py <checklist.pdf> <out.json>

The PDF extracts with the code glued to the player name ("BTP-11Juan Soto"), so
the code pattern has to stop at the right place. A greedy suffix eats the capital that
starts the name and yields "BTP-11J"; an optional trailing [A-Z] does the same
thing to "RVA-13Manny" -> "RVA-13M". Both silently turn every double-digit card
into an unknown code, so the numeric suffix is digits only. Numeric and alpha suffixes are matched
separately, and the alpha one is non-greedy up to the first Capital+lowercase.
"""
import re, sys, json
from pypdf import PdfReader

NUMERIC = re.compile(r'^([A-Z]{1,6}-\d{1,3})\s*(.+)$')                 # BTP-11, RVA-13
ALPHA   = re.compile(r'^([A-Z]{1,6}-[A-Z]{1,5}?)\s*([A-Z][a-z].+)$')  # RA-JWI, IS-SH
HEADER  = re.compile(r"^[A-Z0-9 &'\-\.]{4,}$")

txt = "\n".join((p.extract_text() or "") for p in PdfReader(sys.argv[1]).pages)
sections, cur = {}, None
for l in (x.strip() for x in txt.splitlines()):
    if not l:
        continue
    m = NUMERIC.match(l) or ALPHA.match(l)
    if m:
        if cur:
            sections.setdefault(cur, {})[m.group(1)] = m.group(2)
    elif HEADER.match(l):
        cur = l
json.dump(sections, open(sys.argv[2], "w"), ensure_ascii=False)
print(f"{len(sections)} sections, {sum(len(v) for v in sections.values())} cards")

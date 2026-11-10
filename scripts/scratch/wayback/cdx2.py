"""Ad-hoc CDX query: python3 cdx2.py <name> key=value ..."""
import json, sys, urllib.parse
from wb import RAW, get
CDX = "https://web.archive.org/cdx/search/cdx"
name = sys.argv[1]
params = dict(a.split("=", 1) for a in sys.argv[2:])
params.setdefault("output", "json")
url = CDX + "?" + urllib.parse.urlencode(params)
dest = RAW / "cdx" / f"cdx_{name}.json"
rec = get(url, dest, kind="cdx")
txt = dest.read_text()
try:
    rows = json.loads(txt or "[]"); print(name, rec["status"], max(len(rows) - 1, 0), "rows")
except Exception:
    print(name, rec["status"], txt[:200])
